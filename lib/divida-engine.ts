import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
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
}

const num = (v: unknown) => Number(v) || 0

// Data de atualização dos dados = MAX(dt_alter_ods) das guias (cross-tributo).
export async function dataAtualizacaoDivida(): Promise<string | null> {
  return cached('dataAtualizDivida', TTL_15MIN, async () => {
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
  // (além de vl_saldo, já usado) dão a Taxa de Recuperação: de tudo que foi inscrito em
  // dívida ativa (lançado), quanto já foi efetivamente pago.
  const cond: string[] = []
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(p.dt_vencimento) <= ${mes}`)
  const filtro = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const r = await agentQuery(`
    SELECT p.ds_situacao AS sit, t.ds_tributo AS nome, g.no_exercicio_lancamento AS ex,
           SUM(pp.vl_lancto) AS lancto, SUM(pp.vl_pagto) AS pagto, SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    ${filtro}
    GROUP BY p.ds_situacao, t.ds_tributo, g.no_exercicio_lancamento`, 8000)

  let administrativa = 0, judicial = 0, ajuizamento = 0
  let lancadoTotal = 0, pagoTotal = 0
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
  }
}

export interface MaiorDevedor { cd: number; nome: string; cpfCnpj: string; saldo: number }

// Maiores devedores (dívida ativa) — agrupado por g.cd_contr (contribuinte devedor da
// guia, tributo-agnóstico, ao contrário de cd_origem/cd_devedor que apontam pra tabelas
// diferentes conforme o tributo). Soma vl_saldo de todas as guias em situação de dívida.
export async function maioresDevedores(limite = 200, ano?: number, mes?: number): Promise<MaiorDevedor[]> {
  return cached(`divida:devedores:${limite}:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => maioresDevedoresRaw(limite, ano, mes))
}

async function maioresDevedoresRaw(limite: number, ano?: number, mes?: number): Promise<MaiorDevedor[]> {
  const cond = [`p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')`]
  if (ano) cond.push(`g.no_exercicio_lancamento = ${ano}`)
  if (mes) cond.push(`MONTH(p.dt_vencimento) <= ${mes}`)
  const r = await agentQuery(`
    SELECT TOP ${limite} g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj, SUM(pp.vl_saldo) saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
    WHERE ${cond.join(' AND ')}
    GROUP BY g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj
    ORDER BY saldo DESC`, limite)
  return r.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim(), cpfCnpj: String(row[2] ?? '').trim(), saldo: num(row[3]) }))
    .filter(x => x.saldo > 0)
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
      SELECT COUNT(DISTINCT g.cd_devedor) qt, SUM(pp.vl_saldo) saldo
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
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

export interface SituacaoParcela { situacao: string; quantidade: number; pct: number }

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
    .map(x => ({ situacao: LABEL_SITUACAO[x.situacao] ?? x.situacao, quantidade: x.quantidade, pct: (x.quantidade / total) * 100 }))
    .sort((a, b) => b.quantidade - a.quantidade)
}
