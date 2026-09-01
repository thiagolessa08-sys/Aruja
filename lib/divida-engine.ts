import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN, TTL_30MIN } from '@/lib/cache'
import { CODIGOS_EXCLUIDOS } from '@/lib/tributos'

const SCHEMA = 'pref_aruja_sp'

// Situações de dívida (tb_dsod_parcelas.ds_situacao). Texto → filtro em JS
// (IQ dá 500 com literal de texto no WHERE).
const SIT_DIVIDA: Record<string, 'administrativa' | 'judicial' | 'ajuizamento'> = {
  DividaAtiva: 'administrativa',
  Ajuizada: 'judicial',
  'Em Ajuizamento': 'ajuizamento',
}

export interface ResumoDivida {
  total: number
  administrativa: number
  judicial: number
  ajuizamento: number
  porTributo: { nome: string; valor: number }[]
  porExercicio: { ano: number; valor: number }[]
  recuperacao: {
    lancado: number; pago: number; taxa: number
    porExercicio: { ano: number; lancado: number; pago: number; taxa: number }[]
  }
  composicao: { principal: number; correcao: number; juros: number; multa: number; honorarios: number }
}

const num = (v: unknown) => Number(v) || 0

// Valor legal da dívida ativa (Lei 6.830/80): principal + atualização monetária + juros de
// mora + multa (de mora ou punitiva) + encargos legais (honorários, quando ajuizada) —
// tb_dsod_parcelas_atualizadas já traz essa composição pré-calculada por parcela (recarga
// diária, dt_atualizacao = hoje). ⚠️ cd_parcelas NÃO é único nessa tabela — uma parcela pode
// ter várias linhas (fatias por cd_tributo/padrão de correção diferentes dentro da mesma
// parcela, ex.: uma parcela com 5 linhas somando o vl_total correto); por isso o lookup
// pré-agrega por cd_parcelas ANTES de entrar em qualquer JOIN com uma query já agrupada —
// sem isso, o JOIN direto multiplica linhas e infla até colunas que não vêm dessa tabela
// (ex.: vl_saldo/vl_lancto da própria query principal). Cobertura ~98-99,6% das parcelas em
// aberto nas 3 situações de dívida; o COALESCE cai para vl_saldo (só principal) no restante.
const ATUALIZADA_LOOKUP = `SELECT cd_parcelas,
  SUM(vl_parcela) vl_parcela, SUM(vl_correcao) vl_correcao, SUM(vl_juros) vl_juros,
  SUM(vl_multa) vl_multa, SUM(vl_honorarios) vl_honorarios, SUM(vl_total) vl_total
  FROM ${SCHEMA}.tb_dsod_parcelas_atualizadas GROUP BY cd_parcelas`

// Data de atualização dos dados = MAX(dt_alter_ods) das guias (cross-tributo). TTL de 30min
// (não o TTL_15MIN de 24h) — ver comentário em dataAtualizacaoIptu (tributo-engine.ts).
export async function dataAtualizacaoDivida(): Promise<string | null> {
  return cached('dataAtualizDivida', TTL_30MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${SCHEMA}.tb_dsod_guias`, 1)
    const v = r.rows[0]?.[0]
    if (!v) return null
    return String(v).slice(0, 10) // 'YYYY-MM-DD'
  })
}

// `ano` (opcional): restringe TUDO ao exercício de origem da guia (no_exercicio_lancamento).
// `mes` (opcional): restringe às parcelas com vencimento até o mês informado (acumulado).
// Sem os dois, mostra o estoque acumulado de sempre (todos os exercícios/meses).
export async function resumoDivida(ano?: number, mes?: number): Promise<ResumoDivida> {
  return cached(`divida:resumo:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => resumoDividaRaw(ano, mes))
}

async function resumoDividaRaw(ano?: number, mes?: number): Promise<ResumoDivida> {
  // Uma passada: situação × tributo × exercício. Agregações feitas em JS. vl_lancto/vl_pagto
  // dão a Taxa de Recuperação (histórico de inscrição/pagamento — conceito diferente, não
  // muda com a composição legal abaixo). "saldo" é o valor de dívida ativa considerado nos
  // KPIs/gráficos: principal + atualização monetária + juros + multa + honorários, via
  // tb_dsod_parcelas_atualizadas (fallback pro saldo puro nos ~1-2% sem cobertura).
  const cond: string[] = []
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(p.dt_vencimento) <= ${mes}`)
  const filtro = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const r = await agentQuery(`
    SELECT p.ds_situacao AS sit, t.ds_tributo AS nome, g.no_exercicio_lancamento AS ex,
           SUM(pp.vl_lancto) AS lancto, SUM(pp.vl_pagto) AS pagto,
           SUM(COALESCE(pa.vl_total, pp.vl_saldo)) AS saldo,
           SUM(CASE WHEN pa.cd_parcelas IS NOT NULL THEN pa.vl_parcela ELSE pp.vl_saldo END) AS principal,
           SUM(COALESCE(pa.vl_correcao, 0)) AS correcao, SUM(COALESCE(pa.vl_juros, 0)) AS juros,
           SUM(COALESCE(pa.vl_multa, 0)) AS multa, SUM(COALESCE(pa.vl_honorarios, 0)) AS honorarios
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    LEFT JOIN (${ATUALIZADA_LOOKUP}) pa ON pa.cd_parcelas = p.cd_parcelas
    ${filtro}
    GROUP BY p.ds_situacao, t.ds_tributo, g.no_exercicio_lancamento`, 8000)

  let administrativa = 0, judicial = 0, ajuizamento = 0
  let lancadoTotal = 0, pagoTotal = 0
  let cPrincipal = 0, cCorrecao = 0, cJuros = 0, cMulta = 0, cHonorarios = 0
  const trib = new Map<string, number>()
  const exerc = new Map<number, number>()
  const exercRec = new Map<number, { lancado: number; pago: number }>()

  for (const row of r.rows) {
    const sit = String(row[0] ?? '').trim()
    const tipo = SIT_DIVIDA[sit]
    if (!tipo) continue // só dívida (ignora Normal)
    const nome = String(row[1] ?? '').trim() || 'Não classificado'
    const exAno = num(row[2])
    const lancto = num(row[3]), pagto = num(row[4]), saldo = num(row[5])

    lancadoTotal += lancto
    pagoTotal += pagto
    if (exAno >= 2005 && exAno <= 2030) {
      const e = exercRec.get(exAno) ?? { lancado: 0, pago: 0 }
      e.lancado += lancto; e.pago += pagto
      exercRec.set(exAno, e)
    }

    if (saldo <= 0) continue // porTributo/porExercicio (saldo em aberto) ignoram saldo zerado
    if (tipo === 'administrativa') administrativa += saldo
    else if (tipo === 'judicial') judicial += saldo
    else ajuizamento += saldo

    cPrincipal += num(row[6]); cCorrecao += num(row[7]); cJuros += num(row[8]); cMulta += num(row[9]); cHonorarios += num(row[10])

    trib.set(nome, (trib.get(nome) ?? 0) + saldo)
    if (exAno >= 2005 && exAno <= 2030) exerc.set(exAno, (exerc.get(exAno) ?? 0) + saldo)
  }

  const porTributo = Array.from(trib.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 9)

  const porExercicio = Array.from(exerc.entries())
    .map(([ex, valor]) => ({ ano: ex, valor }))
    .sort((a, b) => a.ano - b.ano)

  const recPorExercicio = Array.from(exercRec.entries())
    .map(([ex, x]) => ({ ano: ex, lancado: x.lancado, pago: x.pago, taxa: x.lancado ? (x.pago / x.lancado) * 100 : 0 }))
    .filter(x => x.lancado > 0)
    .sort((a, b) => a.ano - b.ano)

  return {
    total: administrativa + judicial + ajuizamento, administrativa, judicial, ajuizamento, porTributo, porExercicio,
    recuperacao: {
      lancado: lancadoTotal, pago: pagoTotal, taxa: lancadoTotal ? (pagoTotal / lancadoTotal) * 100 : 0,
      porExercicio: recPorExercicio,
    },
    composicao: { principal: cPrincipal, correcao: cCorrecao, juros: cJuros, multa: cMulta, honorarios: cHonorarios },
  }
}

export interface MaiorDevedor { cd: number; nome: string; cpfCnpj: string; saldo: number; crc: string }

// Situações de dívida "reais" (exclui 'Normal' — sem formalização, tratada à parte por
// não ter um cd_devedor tributo-agnóstico confiável, ver debitosPassiveisDivida).
const SITUACOES_DIVIDA = new Set(['DividaAtiva', 'Ajuizada', 'Em Ajuizamento'])

// Maiores devedores (dívida ativa) — agrupado por g.cd_contr (contribuinte devedor da
// guia, tributo-agnóstico, ao contrário de cd_origem/cd_devedor que apontam pra tabelas
// diferentes conforme o tributo). Soma vl_saldo de todas as guias em situação de dívida.
// `situacao` (opcional) restringe a uma única situação (drill do gráfico "Situação das
// Parcelas") — sem ela, mantém o padrão de somar as 3 situações de dívida juntas.
export async function maioresDevedores(limite = 200, ano?: number, mes?: number, situacao?: string): Promise<MaiorDevedor[]> {
  const sit = situacao && SITUACOES_DIVIDA.has(situacao) ? situacao : undefined
  return cached(`divida:devedores:${limite}:${ano ?? 'all'}:${mes ?? ''}:${sit ?? 'all'}`, TTL_15MIN, () => maioresDevedoresRaw(limite, ano, mes, sit))
}

async function maioresDevedoresRaw(limite: number, ano?: number, mes?: number, situacao?: string): Promise<MaiorDevedor[]> {
  const cond = [situacao ? `p.ds_situacao = '${situacao}'` : `p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')`]
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(p.dt_vencimento) <= ${mes}`)
  const r = await agentQuery(`
    SELECT TOP ${limite} g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj, SUM(COALESCE(pa.vl_total, pp.vl_saldo)) saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
    LEFT JOIN (${ATUALIZADA_LOOKUP}) pa ON pa.cd_parcelas = p.cd_parcelas
    WHERE ${cond.join(' AND ')}
    GROUP BY g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj
    ORDER BY saldo DESC`, limite)
  // CRC: a pedido do usuário, a coluna inteira usa o cd_contr (código interno do contribuinte)
  // como valor de exibição — não é um CRC de fato (não vem de tb_dsod_contribuinte_mobiliario/
  // tb_dsod_contadores; a cobertura real via esse vínculo era de só 13% dos 200 maiores
  // devedores). Decisão explícita do usuário mesmo sabendo que é coincidência de números.
  const devedores = r.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim(), cpfCnpj: String(row[2] ?? '').trim(), saldo: num(row[3]), crc: String(num(row[0])) }))
    .filter(x => x.saldo > 0)
  return devedores
}

export interface IptuDivida { imoveisComIptu: number; imoveisEmDivida: number; valorDivida: number }

// IPTU × Dívida Ativa: de todos os imóveis com IPTU lançado (cd_devedor, g.cd_tributo=1),
// quantos têm alguma guia em situação de dívida (administrativa/judicial/ajuizamento).
export async function iptuDividaResumo(ano?: number, mes?: number): Promise<IptuDivida> {
  return cached(`divida:iptu:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => iptuDividaResumoRaw(ano, mes))
}

async function iptuDividaResumoRaw(ano?: number, mes?: number): Promise<IptuDivida> {
  const condTot = ['g.cd_tributo = 1']
  if (ano) condTot.push(`g.no_exercicio_lancamento = ${ano}`)
  const joinMes = mes ? ` JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia` : ''
  if (mes) condTot.push(`MONTH(p.dt_vencimento) <= ${mes}`)

  const condDiv = ['g.cd_tributo = 1', `p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')`, 'pp.vl_saldo > 0']
  if (ano) condDiv.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) condDiv.push(`MONTH(p.dt_vencimento) <= ${mes}`)

  const [totR, divR] = await Promise.all([
    agentQuery(`SELECT COUNT(DISTINCT g.cd_devedor) FROM ${SCHEMA}.tb_dsod_guias g${joinMes} WHERE ${condTot.join(' AND ')}`, 1),
    agentQuery(`
      SELECT COUNT(DISTINCT g.cd_devedor) qt, SUM(COALESCE(pa.vl_total, pp.vl_saldo)) saldo
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
      LEFT JOIN (${ATUALIZADA_LOOKUP}) pa ON pa.cd_parcelas = p.cd_parcelas
      WHERE ${condDiv.join(' AND ')}`, 1),
  ])
  return {
    imoveisComIptu: num(totR.rows[0]?.[0]),
    imoveisEmDivida: num(divR.rows[0]?.[0]),
    valorDivida: num(divR.rows[0]?.[1]),
  }
}

export interface DebitosPassiveis { total: number; quantidade: number; porTributo: { nome: string; valor: number }[] }

// Débitos passíveis de serem inscritos em Dívida Ativa: parcelas ainda em situação
// 'Normal' (nunca formalizadas em dívida ativa), já vencidas, com saldo líquido em aberto
// (net > 0 por tributo+devedor+vencimento — mesma convenção de "emAberto/inadimplência"
// usada em bucketsIptu/bucketsItbi; SUM(vl_saldo) bruto não serve aqui, pois parcelas
// substituídas/recalculadas deixam saldo "fantasma" que só o net por movimento resolve).
// Exclui os códigos de tributo de CODIGOS_EXCLUIDOS (ruído/não-tributário, ex.: cd 20
// sozinho infla o total em ~R$8 bi se não for excluído — validado contra dados reais).
const EX_FLOOR_DEBITOS = 2019

export async function debitosPassiveisDivida(ano?: number, mes?: number): Promise<DebitosPassiveis> {
  return cached(`divida:passiveis:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => debitosPassiveisDividaRaw(ano, mes))
}

async function debitosPassiveisDividaRaw(ano?: number, mes?: number): Promise<DebitosPassiveis> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const cond = [
    `p.ds_situacao = 'Normal'`, 'p.no_parcela <> 0', `g.cd_tributo NOT IN (${excl})`,
    'pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20)', 'pm.cd_tipo_lancamento IN (0,4,7,10,1)',
    'p.dt_vencimento < getdate()-1',
    ano ? `g.no_exercicio_lancamento = ${ano}` : `g.no_exercicio_lancamento >= ${EX_FLOOR_DEBITOS}`,
  ]
  if (mes) cond.push(`MONTH(p.dt_vencimento) <= ${mes}`)
  const r = await agentQuery(`
    SELECT trib, t.ds_tributo nome, SUM(valor) saldo, COUNT(*) qt FROM (
      SELECT g.cd_tributo trib, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE ${cond.join(' AND ')}
      GROUP BY g.cd_tributo, g.cd_devedor, p.dt_vencimento
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > 1
    ) x
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = x.trib
    GROUP BY trib, t.ds_tributo`, 500)

  let total = 0, quantidade = 0
  const trib = new Map<string, number>()
  for (const row of r.rows) {
    const nome = String(row[1] ?? '').trim() || 'Não classificado'
    const saldo = num(row[2]), qt = num(row[3])
    total += saldo
    quantidade += qt
    trib.set(nome, (trib.get(nome) ?? 0) + saldo)
  }
  const porTributo = Array.from(trib.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 9)

  return { total, quantidade, porTributo }
}

export interface SituacaoParcela { codigo: string; situacao: string; quantidade: number; pct: number }

const LABEL_SITUACAO: Record<string, string> = {
  Normal: 'Normal',
  DividaAtiva: 'Dívida Ativa (administrativa)',
  Ajuizada: 'Ajuizada',
  'Em Ajuizamento': 'Em Ajuizamento',
}

// Situação das Parcelas: contagem de todas as parcelas por ds_situacao. Só contagem —
// o valor (R$) em aberto agregado por situação NÃO é confiável aqui, pois a soma bruta de
// vl_saldo para 'Normal' infla pra ~R$11 bi (parcelas recalculadas/substituídas e códigos
// de tributo ruidosos — mesmo problema já resolvido em debitosPassiveisDivida via net por
// movimento + CODIGOS_EXCLUIDOS). O valor confiável de 'Normal' vencido já está no card
// "Débitos Passíveis de Inscrição"; os valores das 3 situações de dívida já estão nos
// demais cards desta tela (resumoDivida).
export async function situacaoParcelas(ano?: number, mes?: number): Promise<SituacaoParcela[]> {
  return cached(`divida:situacaoParcelas:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => situacaoParcelasRaw(ano, mes))
}

async function situacaoParcelasRaw(ano?: number, mes?: number): Promise<SituacaoParcela[]> {
  const cond: string[] = []
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(p.dt_vencimento) <= ${mes}`)
  const from = ano
    ? `${SCHEMA}.tb_dsod_parcelas p JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia`
    : `${SCHEMA}.tb_dsod_parcelas p`
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const r = await agentQuery(`SELECT p.ds_situacao sit, COUNT(*) qt FROM ${from}${where} GROUP BY p.ds_situacao`, 20)
  const itens = r.rows
    .map(row => ({ situacao: String(row[0] ?? '').trim(), quantidade: num(row[1]) }))
    .filter(x => x.situacao)
  const total = itens.reduce((s, x) => s + x.quantidade, 0) || 1
  return itens
    .map(x => ({ codigo: x.situacao, situacao: LABEL_SITUACAO[x.situacao] ?? x.situacao, quantidade: x.quantidade, pct: (x.quantidade / total) * 100 }))
    .sort((a, b) => b.quantidade - a.quantidade)
}

export interface DebitoNegociado { setor: string; valor: number; quantidade: number }

// Débitos Negociados por Situação (a pedido do usuário) — baixas de parcela originadas por
// parcelamento, via tb_dsod_parcela_baixas.ds_setor_origem_baixa (nomes exatos da tabela:
// 'Parcelamento', 'Reparcelamento', 'BxParcelamento'). Abrange TODOS os tributos/exercícios,
// não só as 3 situações formais de dívida ativa — restringir a elas (testado ao vivo) faz
// 'Reparcelamento' e 'BxParcelamento' sumirem (0 linhas), pois essas baixas ocorrem em
// parcelas que em geral nunca chegaram a ser inscritas em dívida ativa.
const SETORES_NEGOCIADOS = ['Parcelamento', 'Reparcelamento', 'BxParcelamento']

// ⚠️ Ao juntar tb_dsod_parcelas nessas baixas negociadas, usar pm.cd_parcela (da tabela de
// MOVIMENTO), NUNCA pb.cd_parcelas (da tabela de BAIXA). Validado ao vivo: numa baixa de
// Parcelamento/Reparcelamento, pb.cd_parcelas aponta pra parcela ANTIGA que está sendo
// encerrada pela renegociação — esse número fica "órfão" (não existe mais em
// tb_dsod_parcelas) pra praticamente 100% das baixas a partir de 2020 (ex.: jul/2022, 0 de
// 111 resolvem via pb.cd_parcelas). Já pm.cd_parcela aponta pra parcela atual/resultante e
// resolve ~100% em qualquer período. Usar pb.cd_parcelas nesse join (erro cometido antes)
// subestimava o total negociado em quase metade (R$129mi vs R$254mi reais, all-time) por
// excluir silenciosamente quase toda a negociação de 2020 em diante. Esse problema NÃO
// existe do lado "arrecadado" (pb.cd_parcelas resolve ~99,7% ali, validado ao vivo) — é
// específico de baixas de renegociação, que por natureza encerram a parcela antiga.
export async function debitosNegociadosDivida(ano?: number, mes?: number): Promise<DebitoNegociado[]> {
  return cached(`divida:negociados:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => debitosNegociadosDividaRaw(ano, mes))
}

async function debitosNegociadosDividaRaw(ano?: number, mes?: number): Promise<DebitoNegociado[]> {
  const cond = [`pb.ds_setor_origem_baixa IN ('${SETORES_NEGOCIADOS.join("','")}')`]
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(pb.dt_baixa) <= ${mes}`)
  const r = await agentQuery(`
    SELECT pb.ds_setor_origem_baixa setor, SUM(pm.vl_movimento) valor, COUNT(DISTINCT pm.cd_parcela) qtd
    FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
    JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pm.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    WHERE ${cond.join(' AND ')}
    GROUP BY pb.ds_setor_origem_baixa`, 20)
  return r.rows
    .map(row => ({ setor: String(row[0] ?? '').trim(), valor: num(row[1]), quantidade: num(row[2]) }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
}

export interface TransacaoModalidade { situacao: string; label: string; quantidade: number; valor: number }

const LABEL_MODALIDADE: Record<string, string> = {
  Normal: 'Normal',
  DividaAtiva: 'Dívida Ativa',
  Ajuizada: 'Ajuizada',
  'Em Ajuizamento': 'Em Ajuizamento',
}

// Transação por Modalidade (a pedido do usuário) — as MESMAS transações negociadas de
// debitosNegociadosDivida acima (ds_setor_origem_baixa IN Parcelamento/Reparcelamento/
// BxParcelamento), mas agrupadas pela situação da PARCELA (Normal/DividaAtiva/Ajuizada/
// Em Ajuizamento) em vez do setor de origem da baixa — mostra em qual modalidade formal a
// negociação ocorreu. As 4 situações têm volume real (validado ao vivo): Normal concentra a
// maior parte (parcelas negociadas antes de qualquer formalização em dívida ativa).
export async function transacoesPorModalidade(ano?: number, mes?: number): Promise<TransacaoModalidade[]> {
  return cached(`divida:transacaoModalidade:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => transacoesPorModalidadeRaw(ano, mes))
}

async function transacoesPorModalidadeRaw(ano?: number, mes?: number): Promise<TransacaoModalidade[]> {
  const cond = [`pb.ds_setor_origem_baixa IN ('${SETORES_NEGOCIADOS.join("','")}')`]
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(pb.dt_baixa) <= ${mes}`)
  const r = await agentQuery(`
    SELECT p.ds_situacao sit, COUNT(DISTINCT pm.cd_parcela) qtd, SUM(pm.vl_movimento) valor
    FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
    JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pm.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    WHERE ${cond.join(' AND ')}
    GROUP BY p.ds_situacao`, 20)
  return r.rows
    .map(row => ({ situacao: String(row[0] ?? '').trim(), quantidade: num(row[1]), valor: num(row[2]) }))
    .filter(x => LABEL_MODALIDADE[x.situacao] && x.quantidade > 0)
    .map(x => ({ ...x, label: LABEL_MODALIDADE[x.situacao] }))
    .sort((a, b) => b.quantidade - a.quantidade)
}

export interface DevedorModalidade { cd: number; nome: string; cpfCnpj: string; valor: number; quantidade: number }

// Drill de "Transação por Modalidade" (a pedido do usuário) — contribuintes cujas
// transações negociadas (mesmo escopo de transacoesPorModalidade acima) se enquadram na
// situação/modalidade clicada, agrupado por g.cd_contr (mesmo padrão tributo-agnóstico de
// maioresDevedores).
export async function devedoresModalidade(situacao: string, limite = 10, ano?: number, mes?: number): Promise<DevedorModalidade[]> {
  if (!LABEL_MODALIDADE[situacao]) return []
  return cached(`divida:devedoresModalidade:${situacao}:${limite}:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => devedoresModalidadeRaw(situacao, limite, ano, mes))
}

async function devedoresModalidadeRaw(situacao: string, limite: number, ano?: number, mes?: number): Promise<DevedorModalidade[]> {
  const cond = [`pb.ds_setor_origem_baixa IN ('${SETORES_NEGOCIADOS.join("','")}')`, `p.ds_situacao = '${situacao}'`]
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(pb.dt_baixa) <= ${mes}`)
  const r = await agentQuery(`
    SELECT TOP ${limite} g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj, SUM(pm.vl_movimento) valor, COUNT(DISTINCT pm.cd_parcela) qtd
    FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
    JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pm.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
    WHERE ${cond.join(' AND ')}
    GROUP BY g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj
    ORDER BY valor DESC`, limite)
  return r.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim(), cpfCnpj: String(row[2] ?? '').trim(), valor: num(row[3]), quantidade: num(row[4]) }))
    .filter(x => x.valor > 0)
}

export interface HistoricoNegArr { ano: number; negociado: number; arrecadado: number }

const EX_FLOOR_HISTORICO = 2016

// Histórico – Débitos Negociados e Arrecadados, por ano (a pedido do usuário, gráfico de
// linha ao lado de "Débitos Negociados por Situação"). "Negociado" é a mesma métrica de
// debitosNegociadosDivida, agora por YEAR(dt_baixa) — o ano em que a baixa por parcelamento/
// reparcelamento de fato ocorreu (não o exercício de origem da guia). "Arrecadado" usa a
// fórmula padrão de arrecadação por baixa (mov 11/14, lançamento 0/4/7/10, exclui Estorno de
// Baixa — mesma convenção usada nas telas de tributo), restrita às 3 situações de dívida
// ativa, também por ano de baixa — assim as duas séries comparam o MESMO eixo de tempo (ano
// em que o evento aconteceu), não o ano de origem do débito.
export async function historicoNegociadosArrecadados(): Promise<HistoricoNegArr[]> {
  return cached('divida:historicoNegArr', TTL_15MIN, historicoNegociadosArrecadadosRaw)
}

async function historicoNegociadosArrecadadosRaw(): Promise<HistoricoNegArr[]> {
  const [negR, arrR] = await Promise.all([
    agentQuery(`
      SELECT YEAR(pb.dt_baixa) ano, SUM(pm.vl_movimento) valor
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
      WHERE pb.ds_setor_origem_baixa IN ('${SETORES_NEGOCIADOS.join("','")}') AND YEAR(pb.dt_baixa) >= ${EX_FLOOR_HISTORICO}
      GROUP BY YEAR(pb.dt_baixa)`, 40),
    agentQuery(`
      SELECT YEAR(pb.dt_baixa) ano, SUM(pm.vl_movimento) valor
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      WHERE p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')
        AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
        AND tb.ds_tipo_baixa <> 'Estorno de Baixa' AND YEAR(pb.dt_baixa) >= ${EX_FLOOR_HISTORICO}
      GROUP BY YEAR(pb.dt_baixa)`, 40),
  ])
  const neg = new Map<number, number>(), arr = new Map<number, number>()
  const okAno = (a: number) => a >= 2005 && a <= 2035
  for (const row of negR.rows) { const a = num(row[0]); if (okAno(a)) neg.set(a, num(row[1])) }
  for (const row of arrR.rows) { const a = num(row[0]); if (okAno(a)) arr.set(a, num(row[1])) }
  const anos = Array.from(new Set([...neg.keys(), ...arr.keys()])).sort((a, b) => a - b)
  return anos.map(ano => ({ ano, negociado: neg.get(ano) ?? 0, arrecadado: arr.get(ano) ?? 0 }))
}

export interface HistoricoMes { mes: number; negociado: number; arrecadado: number }

// Drill mensal do Histórico – Débitos Negociados e Arrecadados (a pedido do usuário, clique
// num ponto do gráfico de linha por ano). Mesma lógica de historicoNegociadosArrecadados
// acima, restrita a um único ano (YEAR(dt_baixa) = ano) e agrupada por MONTH(dt_baixa) em
// vez de YEAR(dt_baixa). Preenche os 12 meses (mesmo os sem baixa nenhuma) pra manter o eixo
// do tempo contínuo dentro do ano, ao contrário da série anual que só lista anos com dado.
export async function historicoNegArrPorMes(ano: number): Promise<HistoricoMes[]> {
  return cached(`divida:historicoNegArrMes:${ano}`, TTL_15MIN, () => historicoNegArrPorMesRaw(ano))
}

async function historicoNegArrPorMesRaw(ano: number): Promise<HistoricoMes[]> {
  const [negR, arrR] = await Promise.all([
    agentQuery(`
      SELECT MONTH(pb.dt_baixa) mes, SUM(pm.vl_movimento) valor
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
      WHERE pb.ds_setor_origem_baixa IN ('${SETORES_NEGOCIADOS.join("','")}') AND YEAR(pb.dt_baixa) = ${ano}
      GROUP BY MONTH(pb.dt_baixa)`, 20),
    agentQuery(`
      SELECT MONTH(pb.dt_baixa) mes, SUM(pm.vl_movimento) valor
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      WHERE p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')
        AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
        AND tb.ds_tipo_baixa <> 'Estorno de Baixa' AND YEAR(pb.dt_baixa) = ${ano}
      GROUP BY MONTH(pb.dt_baixa)`, 20),
  ])
  const neg = new Map<number, number>(), arr = new Map<number, number>()
  for (const row of negR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) neg.set(m, num(row[1])) }
  for (const row of arrR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) arr.set(m, num(row[1])) }
  return Array.from({ length: 12 }, (_, i) => i + 1).map(mes => ({ mes, negociado: neg.get(mes) ?? 0, arrecadado: arr.get(mes) ?? 0 }))
}

export interface HistoricoPerfil { perfil: string; label: string; negociado: number; arrecadado: number }

const LABEL_PERFIL: Record<string, string> = { F: 'Pessoa Física', J: 'Pessoa Jurídica' }

// Terceiro nível de drill do Histórico – Débitos Negociados e Arrecadados (a pedido do
// usuário: Ano → Mês → Perfil de Contribuinte). Mesma lógica de historicoNegArrPorMes acima,
// restrita a um único mês (YEAR/MONTH(dt_baixa) = ano/mês) e agrupada por
// tb_dsod_contribuinte.ic_pessoa (F=Pessoa Física, J=Pessoa Jurídica) em vez de MONTH(dt_baixa).
// Lado negociado junta tb_dsod_parcelas via pm.cd_parcela (não pb.cd_parcelas) — ver nota
// grande em debitosNegociadosDividaRaw sobre por que esse é o join correto para baixas de
// renegociação. Ao contrário do tributo (que se perde na renegociação, reclassificado num
// código sintético "Parcelamento"), o contribuinte (g.cd_contr) é preservado normalmente, e
// seu ic_pessoa dá uma quebra real em ambos os lados (validado ao vivo, ex.: jul/2022:
// negociado F R$725k/92 contribuintes vs J R$118k/13 contribuintes).
export async function historicoNegArrPorPerfil(ano: number, mes: number): Promise<HistoricoPerfil[]> {
  return cached(`divida:historicoNegArrPerfil:${ano}:${mes}`, TTL_15MIN, () => historicoNegArrPorPerfilRaw(ano, mes))
}

async function historicoNegArrPorPerfilRaw(ano: number, mes: number): Promise<HistoricoPerfil[]> {
  const [negR, arrR] = await Promise.all([
    agentQuery(`
      SELECT cp.ic_pessoa perfil, SUM(pm.vl_movimento) valor
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pm.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
      WHERE pb.ds_setor_origem_baixa IN ('${SETORES_NEGOCIADOS.join("','")}')
        AND YEAR(pb.dt_baixa) = ${ano} AND MONTH(pb.dt_baixa) = ${mes}
      GROUP BY cp.ic_pessoa`, 20),
    agentQuery(`
      SELECT cp.ic_pessoa perfil, SUM(pm.vl_movimento) valor
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela_baixa = pb.cd_parcela_baixa
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
      WHERE p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')
        AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
        AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
        AND YEAR(pb.dt_baixa) = ${ano} AND MONTH(pb.dt_baixa) = ${mes}
      GROUP BY cp.ic_pessoa`, 20),
  ])
  const neg = new Map<string, number>(), arr = new Map<string, number>()
  for (const row of negR.rows) { const p = String(row[0] ?? '').trim(); if (LABEL_PERFIL[p]) neg.set(p, (neg.get(p) ?? 0) + num(row[1])) }
  for (const row of arrR.rows) { const p = String(row[0] ?? '').trim(); if (LABEL_PERFIL[p]) arr.set(p, (arr.get(p) ?? 0) + num(row[1])) }
  const perfis = Array.from(new Set([...neg.keys(), ...arr.keys()]))
  return perfis
    .map(perfil => ({ perfil, label: LABEL_PERFIL[perfil], negociado: neg.get(perfil) ?? 0, arrecadado: arr.get(perfil) ?? 0 }))
    .filter(x => x.negociado > 0 || x.arrecadado > 0)
    .sort((a, b) => b.negociado - a.negociado)
}
