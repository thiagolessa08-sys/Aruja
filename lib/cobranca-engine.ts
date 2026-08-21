import { agentQuery } from '@/lib/agent'
import { rankingTributos } from '@/lib/tributo-engine'
import { CODIGOS_EXCLUIDOS } from '@/lib/tributos'
import { cached, TTL_15MIN } from '@/lib/cache'

const SCHEMA = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// tb_dsod_tipo_baixa.ds_tipo_baixa cujo evento é efetivamente um RECEBIMENTO em dinheiro
// (Pgto/Pago/depósito bancário/Simples Nacional pago). O restante das baixas — cancelamento,
// estorno, compensação, isenção, "sem movimento", etc. — NÃO representa dinheiro efetivamente
// pago pelo contribuinte. Usado por damsGeradas, resultadoMensalArrecadacao e
// comparativoDamPorId.
const TIPOS_BAIXA_PAGO = [
  'Pgto Normal (Prefeitura)', 'Pgto em Atraso (Tesouraria)', 'Pgto em Banco',
  'Pago pela parcela Unica', 'Pago pela parcela Normal',
  'Pago pela parcela Unica, MAS nao tem uma unica, conversao',
  'Pagamento efetuado por deposito bancario',
  'Simples Nacional - Pagto Matriz x Filial', 'Simples Nacional - Pagto PGFN',
]
const TIPOS_BAIXA_PAGO_SQL = TIPOS_BAIXA_PAGO.map(t => `'${t.replace(/'/g, "''")}'`).join(',')

export interface ResumoCobranca {
  ano: number
  lancado: number
  arrecadado: number
  saldo: number
  conversao: number
  totalBaixas: number
  tributos: { nome: string; lancado: number; arrecadado: number; saldo: number; conversao: number }[]
  canais: { nome: string; n: number }[]
  baixasPorAno: { ano: number; n: number }[]
}

export async function resumoCobranca(ano = 2025, mes?: number): Promise<ResumoCobranca> {
  return cached(`cobranca:${ano}:${mes ?? ''}`, TTL_15MIN, () => resumoCobrancaRaw(ano, mes))
}

async function resumoCobrancaRaw(ano: number, mes?: number): Promise<ResumoCobranca> {
  const filtroMesBaixa = mes ? ` AND MONTH(dt_baixa) <= ${mes}` : ''
  const whereMesBaixa = mes ? `WHERE MONTH(dt_baixa) <= ${mes}` : ''
  const [rank, canaisR, anoR] = await Promise.all([
    rankingTributos(false, ano, mes),
    // Canais de arrecadação (baixas) do exercício/mês selecionado — mesmo filtro de
    // ano/mes usado no resto do resumo, pra "Canais de Arrecadação" e o KPI "Baixas
    // Processadas" reagirem aos filtros da tela.
    agentQuery(`
      SELECT ds_setor_origem_baixa AS setor, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      WHERE YEAR(dt_baixa) = ${ano}${filtroMesBaixa}
      GROUP BY ds_setor_origem_baixa`, 100),
    // Série histórica (todos os anos) pro gráfico "Baixas Processadas por Ano" — não
    // restringe por exercício (é o propósito do gráfico mostrar a tendência plurianual),
    // mas acompanha o filtro de mês (acumulado até o mês, em cada ano) quando selecionado.
    agentQuery(`
      SELECT YEAR(dt_baixa) AS ano, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      ${whereMesBaixa}
      GROUP BY YEAR(dt_baixa)`, 100),
  ])

  const tributos = rank
    .filter(t => t.lancado > 0)
    .map(t => ({ nome: t.nome, lancado: t.lancado, arrecadado: t.arrecadado, saldo: t.saldo, conversao: t.lancado ? (t.arrecadado / t.lancado) * 100 : 0 }))
    .slice(0, 10)

  const lancado = rank.reduce((a, t) => a + t.lancado, 0)
  const arrecadado = rank.reduce((a, t) => a + t.arrecadado, 0)
  const saldo = rank.reduce((a, t) => a + t.saldo, 0)

  const canais = canaisR.rows
    .map(r => ({ nome: String(r[0] ?? '').trim() || 'Outros', n: num(r[1]) }))
    .filter(c => c.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)

  const baixasPorAno = anoR.rows
    .map(r => ({ ano: num(r[0]), n: num(r[1]) }))
    .filter(x => x.ano >= 2015 && x.ano <= 2026)
    .sort((a, b) => a.ano - b.ano)

  const totalBaixas = canaisR.rows.reduce((a, r) => a + num(r[1]), 0)

  return {
    ano, lancado, arrecadado, saldo,
    conversao: lancado ? (arrecadado / lancado) * 100 : 0,
    totalBaixas, tributos, canais, baixasPorAno,
  }
}

export interface DamMes { mes: number; qt: number; pagas: number }
export interface DamTributo { nome: string; codigos: number[]; qt: number; pagas: number }
export interface DamOperador { nome: string; qt: number; pagas: number }
export interface DamsGeradas {
  ano: number
  total: number
  totalPagas: number
  porMes: DamMes[]
  porTributo: DamTributo[]
  porOperador: DamOperador[]
}

const TOP_N_DAM_TRIB = 10
const TOP_N_DAM_OPER = 10

/**
 * Documentos de Arrecadação Municipal (DAM) gerados — tb_dsod_guias, cada linha é uma guia
 * (= um DAM) emitida. `dt_geracao` = quando foi gerada (não confundir com
 * no_exercicio_lancamento, o exercício fiscal a que a guia pertence — uma guia de 2025 pode
 * ser reemitida/gerada em 2026). `cd_usuario_gerador` = operador que gerou (nome de
 * atendente, ou identificadores especiais como "Internet"/autoatendimento pelo portal e
 * "Schedule"/geração automática agendada — nem todo valor é uma pessoa). Por tributo usa o
 * mesmo cd_tributo=20 "Documento de Arrecadacao" (DAM genérico, sem tributo específico
 * vinculado) já mapeado em lib/tributos.ts CODIGOS_EXCLUIDOS.
 */
export async function damsGeradas(ano = 2025, mes?: number): Promise<DamsGeradas> {
  return cached(`dams:${ano}:${mes ?? ''}`, TTL_15MIN, () => damsGeradasRaw(ano, mes))
}

async function damsGeradasRaw(ano: number, mes?: number): Promise<DamsGeradas> {
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const filtroMesBaixa = mes ? ` AND MONTH(pb.dt_baixa) <= ${mes}` : ''
  // Pagas conta DAMs (documentos) distintas — COUNT DISTINCT cd_guia via baixa de tipo
  // pagamento (ver TIPOS_BAIXA_PAGO), não eventos de baixa. cd_guia = -1 é a linha sentinela
  // ("Não Informado") de tb_dsod_parcelas — excluída do COUNT DISTINCT.
  const juncaoPagas = `
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL}) AND p.cd_guia > 0`
  const [totalR, mesR, tribR, operR, totalPagasR, mesPagasR, tribPagasR] = await Promise.all([
    agentQuery(`SELECT COUNT(*) FROM ${SCHEMA}.tb_dsod_guias WHERE YEAR(dt_geracao) = ${ano}${filtroMes}`, 1),
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}${filtroMes}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias g
      LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
      WHERE YEAR(g.dt_geracao) = ${ano}${filtroMes}
      GROUP BY g.cd_tributo, t.ds_tributo`, 200),
    // Milhares de valores distintos (muitos são CPF/CNPJ de contribuintes que geraram a
    // própria guia pelo portal) — TOP + ORDER BY direto no SQL, "Demais" calculado por
    // diferença do total (evita trazer a cauda toda pro JS).
    agentQuery(`
      SELECT TOP ${TOP_N_DAM_OPER} cd_usuario_gerador, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}${filtroMes}
      GROUP BY cd_usuario_gerador
      ORDER BY qt DESC`, TOP_N_DAM_OPER),
    agentQuery(`SELECT COUNT(DISTINCT p.cd_guia) AS qt ${juncaoPagas}`, 1),
    agentQuery(`SELECT MONTH(pb.dt_baixa) AS mes, COUNT(DISTINCT p.cd_guia) AS qt ${juncaoPagas} GROUP BY MONTH(pb.dt_baixa)`, 20),
    agentQuery(`SELECT g.cd_tributo AS cd, COUNT(DISTINCT p.cd_guia) AS qt ${juncaoPagas} GROUP BY g.cd_tributo`, 200),
  ])

  const total = num(totalR.rows[0]?.[0])
  const totalPagas = num(totalPagasR.rows[0]?.[0])

  const porMesPagasMap = new Map<number, number>()
  for (const row of mesPagasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) porMesPagasMap.set(m, num(row[1])) }
  const porMesMap = new Map<number, number>()
  for (const row of mesR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) porMesMap.set(m, num(row[1])) }
  const porMes: DamMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, qt: porMesMap.get(m) ?? 0, pagas: porMesPagasMap.get(m) ?? 0 })

  const tribPagasMap = new Map<number, number>()
  for (const row of tribPagasR.rows) tribPagasMap.set(num(row[0]), num(row[1]))
  const tribList = tribR.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`, qt: num(row[2]) }))
    .filter(x => x.qt > 0)
    .sort((a, b) => b.qt - a.qt)
  const topTrib = tribList.slice(0, TOP_N_DAM_TRIB)
  const restoTrib = tribList.slice(TOP_N_DAM_TRIB)
  const porTributo: DamTributo[] = topTrib.map(t => ({ nome: t.nome, codigos: [t.cd], qt: t.qt, pagas: tribPagasMap.get(t.cd) ?? 0 }))
  if (restoTrib.length) {
    porTributo.push({
      nome: `Demais tributos (${restoTrib.length})`, codigos: restoTrib.map(t => t.cd),
      qt: restoTrib.reduce((s, t) => s + t.qt, 0),
      pagas: restoTrib.reduce((s, t) => s + (tribPagasMap.get(t.cd) ?? 0), 0),
    })
  }

  const operBrutoNomes = operR.rows.map(row => String(row[0] ?? '').trim()).filter(Boolean)
  const operPagasR = operBrutoNomes.length
    ? await agentQuery(`
        SELECT g.cd_usuario_gerador AS nome, COUNT(DISTINCT p.cd_guia) AS qt
        ${juncaoPagas} AND g.cd_usuario_gerador IN (${operBrutoNomes.map(n => `'${n.replace(/'/g, "''")}'`).join(',')})
        GROUP BY g.cd_usuario_gerador`, 50)
    : { rows: [] as unknown[][] }
  const operPagasMap = new Map<string, number>()
  for (const row of operPagasR.rows) operPagasMap.set(String(row[0] ?? '').trim(), num(row[1]))

  const operList = operR.rows
    .map(row => { const bruto = String(row[0] ?? '').trim(); return { nome: bruto || 'Não identificado', qt: num(row[1]), pagas: operPagasMap.get(bruto) ?? 0 } })
    .filter(x => x.qt > 0)
  const somaTopOper = operList.reduce((s, x) => s + x.qt, 0)
  const somaTopOperPagas = operList.reduce((s, x) => s + x.pagas, 0)
  const porOperador: DamOperador[] = [...operList]
  const restoOper = total - somaTopOper
  const restoOperPagas = Math.max(0, totalPagas - somaTopOperPagas)
  if (restoOper > 0) porOperador.push({ nome: 'Demais operadores', qt: restoOper, pagas: restoOperPagas })

  return { ano, total, totalPagas, porMes, porTributo, porOperador }
}

export interface ResultadoMes { mes: number; geradas: number; recebidas: number; pagas: number }
export interface ResultadoMensal { ano: number; totalGeradas: number; totalRecebidas: number; totalPagas: number; porMes: ResultadoMes[] }

/**
 * Resultado mensal da arrecadação: DAM GERADAS (tb_dsod_guias.dt_geracao — emitidas) × DAM
 * RECEBIDAS pelo setor de Cobrança (tb_dsod_parcela_baixas.dt_baixa — mesma fonte/conceito
 * de baixasPorAno em resumoCobranca, aqui quebrado por mês em vez de por ano) × DAM PAGAS
 * (subconjunto de "recebidas" cujo tipo de baixa é um recebimento em dinheiro — ver
 * TIPOS_BAIXA_PAGO; o restante das baixas é cancelamento/estorno/compensação/etc., não paga).
 * Datas de geração e de baixa são eventos independentes — uma guia gerada em dezembro (ex.:
 * lote de IPTU do próximo exercício) só é "recebida"/"paga" quando o contribuinte efetivamente
 * paga, meses depois; por isso os volumes mensais não precisam (e tipicamente não vão) bater.
 */
export async function resultadoMensalArrecadacao(ano = 2025, mes?: number): Promise<ResultadoMensal> {
  return cached(`resultadoMensal:${ano}:${mes ?? ''}`, TTL_15MIN, () => resultadoMensalRaw(ano, mes))
}

async function resultadoMensalRaw(ano: number, mes?: number): Promise<ResultadoMensal> {
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const filtroMesBaixa = mes ? ` AND MONTH(pb.dt_baixa) <= ${mes}` : ''
  const [geradasR, recebidasR, pagasR] = await Promise.all([
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}${filtroMes}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT MONTH(dt_baixa) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      WHERE YEAR(dt_baixa) = ${ano}${filtroMesBaixa}
      GROUP BY MONTH(dt_baixa)`, 20),
    agentQuery(`
      SELECT MONTH(pb.dt_baixa) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL})
      GROUP BY MONTH(pb.dt_baixa)`, 20),
  ])

  const geradasMap = new Map<number, number>()
  for (const row of geradasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) geradasMap.set(m, num(row[1])) }
  const recebidasMap = new Map<number, number>()
  for (const row of recebidasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) recebidasMap.set(m, num(row[1])) }
  const pagasMap = new Map<number, number>()
  for (const row of pagasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) pagasMap.set(m, num(row[1])) }

  const porMes: ResultadoMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, geradas: geradasMap.get(m) ?? 0, recebidas: recebidasMap.get(m) ?? 0, pagas: pagasMap.get(m) ?? 0 })

  return {
    ano,
    totalGeradas: porMes.reduce((s, x) => s + x.geradas, 0),
    totalRecebidas: porMes.reduce((s, x) => s + x.recebidas, 0),
    totalPagas: porMes.reduce((s, x) => s + x.pagas, 0),
    porMes,
  }
}

export interface ComparativoDamIdMes { mes: number; geradas: number; pagas: number }
export interface ComparativoDamId { ano: number; totalGeradas: number; totalPagas: number; porMes: ComparativoDamIdMes[] }

/**
 * Comparativo de DAM por ID (documento) — GERADAS (tb_dsod_guias, 1 linha = 1 cd_guia = 1 DAM)
 * × PAGAS, contando DAMs DISTINTAS (COUNT DISTINCT cd_guia), não eventos de baixa como em
 * resultadoMensalArrecadacao. Diferença real: uma guia com várias parcelas (ex.: IPTU
 * parcelado) gera uma baixa "paga" por parcela — em 2025 são ~268 mil eventos pagos mas só
 * ~247 mil DAMs distintas por trás deles, porque parte dessas guias teve mais de uma parcela
 * paga no período. cd_guia = -1 é a linha sentinela ("Não Informado") de tb_dsod_parcelas — só
 * ~250 baixas pagas caem nela no ano e são excluídas do COUNT DISTINCT (senão contam como 1 DAM
 * fantasma). Uma DAM com parcelas pagas em meses diferentes aparece em mais de um mês aqui —
 * por isso a soma dos meses pode superar o total anual (que é DISTINCT sobre o ano inteiro).
 */
export async function comparativoDamPorId(ano = 2025, mes?: number): Promise<ComparativoDamId> {
  return cached(`comparativoDamId:${ano}:${mes ?? ''}`, TTL_15MIN, () => comparativoDamPorIdRaw(ano, mes))
}

async function comparativoDamPorIdRaw(ano: number, mes?: number): Promise<ComparativoDamId> {
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const filtroMesBaixa = mes ? ` AND MONTH(pb.dt_baixa) <= ${mes}` : ''
  const [geradasR, pagasR, totalPagasR] = await Promise.all([
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}${filtroMes}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT MONTH(pb.dt_baixa) AS mes, COUNT(DISTINCT p.cd_guia) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL}) AND p.cd_guia > 0
      GROUP BY MONTH(pb.dt_baixa)`, 20),
    agentQuery(`
      SELECT COUNT(DISTINCT p.cd_guia) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL}) AND p.cd_guia > 0`, 1),
  ])

  const geradasMap = new Map<number, number>()
  for (const row of geradasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) geradasMap.set(m, num(row[1])) }
  const pagasMap = new Map<number, number>()
  for (const row of pagasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) pagasMap.set(m, num(row[1])) }

  const porMes: ComparativoDamIdMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, geradas: geradasMap.get(m) ?? 0, pagas: pagasMap.get(m) ?? 0 })

  return {
    ano,
    totalGeradas: porMes.reduce((s, x) => s + x.geradas, 0),
    totalPagas: num(totalPagasR.rows[0]?.[0]),
    porMes,
  }
}

export interface ConversaoItem { nome: string; lancado: number; arrecadado: number; conversao: number }
export interface AnaliseConversao {
  ano: number
  porTributo: ConversaoItem[]
  porPeriodo: ConversaoItem[]
  porOperador: ConversaoItem[]
}

const TOP_N_CONV_OPER = 10
const ANO_MIN_CONV = 2018

/**
 * Análise de Conversão (arrecadado ÷ lançado) sob 3 lentes — mesma métrica de
 * "Conversão por Tributo" já mostrado no topo da tela, aqui reaproveitada em rankingTributos
 * (por tributo) e cruzada com duas dimensões novas: por período (exercício de lançamento,
 * desde ${ANO_MIN_CONV}) e por operador (cd_usuario_gerador da guia — mesmo campo usado em
 * damsGeradas, mas aqui pesando o valor $ lançado/pago em vez da contagem de guias). "Por
 * operador" revela conversão por QUEM gerou a guia — útil pra distinguir guias trabalhadas
 * ativamente por atendentes de guias autoemitidas pelo portal que ficam sem seguimento.
 */
export async function analiseConversao(ano = 2025, mes?: number): Promise<AnaliseConversao> {
  return cached(`analiseConversao:${ano}:${mes ?? ''}`, TTL_15MIN, () => analiseConversaoRaw(ano, mes))
}

async function analiseConversaoRaw(ano: number, mes?: number): Promise<AnaliseConversao> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const [rank, periodoR, totalAnoR, operR] = await Promise.all([
    rankingTributos(false, ano, mes),
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento >= ${ANO_MIN_CONV}${filtroMes}
      GROUP BY g.no_exercicio_lancamento`, 30),
    agentQuery(`
      SELECT SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento = ${ano}${filtroMes}`, 1),
    // Milhares de operadores distintos (mesma situação de damsGeradas) — busca um universo bem
    // maior que o TOP_N final (200) pra poder somar os códigos numéricos ao balde "Internet"
    // (ver abaixo) ANTES de recortar o top 10 exibido; "Demais operadores" continua calculado
    // por diferença do total do ano.
    agentQuery(`
      SELECT TOP 200 g.cd_usuario_gerador, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento = ${ano}${filtroMes}
      GROUP BY g.cd_usuario_gerador
      ORDER BY lancado DESC`, 200),
  ])

  const porTributo: ConversaoItem[] = rank
    .filter(t => t.lancado > 0)
    .sort((a, b) => b.lancado - a.lancado)
    .slice(0, 10)
    .map(t => ({ nome: t.nome, lancado: t.lancado, arrecadado: t.arrecadado, conversao: t.lancado ? (t.arrecadado / t.lancado) * 100 : 0 }))

  // Descarta exercícios "futuros" além do corrente com valores residuais (poucos reais,
  // ruído de lançamento/teste) — mantém só anos com volume real de lançamento.
  const anoAtual = new Date().getFullYear()
  const porPeriodo: ConversaoItem[] = periodoR.rows
    .map(row => ({ ex: num(row[0]), lancado: num(row[1]), pago: num(row[2]) }))
    .filter(x => x.ex >= ANO_MIN_CONV && x.ex <= anoAtual && x.lancado >= 1000)
    .sort((a, b) => a.ex - b.ex)
    .map(x => ({ nome: String(x.ex), lancado: x.lancado, arrecadado: x.pago, conversao: x.lancado ? (x.pago / x.lancado) * 100 : 0 }))

  const totalLancadoAno = num(totalAnoR.rows[0]?.[0])
  const totalPagoAno = num(totalAnoR.rows[0]?.[1])

  const operBruto = operR.rows
    .map(row => ({ nome: String(row[0] ?? '').trim() || 'Não identificado', lancado: num(row[1]), pago: num(row[2]) }))
    .filter(x => x.lancado > 0)

  // cd_usuario_gerador mistura formatos: login de atendente ("CalebeAM"), rótulo especial
  // ("Internet"/"Schedule") e, para registros mais antigos, um código numérico interno sem
  // nome cadastrado em nenhuma tabela do catálogo — esses códigos puramente numéricos são
  // autoemissão pelo portal e são somados ao balde "Internet" em vez de aparecerem soltos.
  const operMap = new Map<string, { lancado: number; pago: number }>()
  for (const x of operBruto) {
    const chave = /^\d+$/.test(x.nome) ? 'Internet' : x.nome
    const acc = operMap.get(chave) ?? { lancado: 0, pago: 0 }
    acc.lancado += x.lancado
    acc.pago += x.pago
    operMap.set(chave, acc)
  }
  const operList = Array.from(operMap, ([nome, v]) => ({ nome, ...v })).sort((a, b) => b.lancado - a.lancado)
  const somaLancadoTop = operList.reduce((s, x) => s + x.lancado, 0)
  const somaPagoTop = operList.reduce((s, x) => s + x.pago, 0)
  const porOperador: ConversaoItem[] = operList.slice(0, TOP_N_CONV_OPER).map(x => ({ nome: x.nome, lancado: x.lancado, arrecadado: x.pago, conversao: x.lancado ? (x.pago / x.lancado) * 100 : 0 }))
  const restoLancado = totalLancadoAno - somaLancadoTop
  const restoPago = totalPagoAno - somaPagoTop
  if (restoLancado > 0) {
    porOperador.push({ nome: 'Demais operadores', lancado: restoLancado, arrecadado: restoPago, conversao: restoLancado ? (restoPago / restoLancado) * 100 : 0 })
  }

  return { ano, porTributo, porPeriodo, porOperador }
}
