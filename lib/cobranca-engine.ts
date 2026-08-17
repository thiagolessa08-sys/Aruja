import { agentQuery } from '@/lib/agent'
import { rankingTributos } from '@/lib/tributo-engine'
import { cached, TTL_15MIN } from '@/lib/cache'

const SCHEMA = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

export interface ResumoCobranca {
  ano: number
  lancado: number
  arrecadado: number
  saldo: number
  conversao: number
  totalBaixas: number
  tributos: { nome: string; lancado: number; arrecadado: number; saldo: number; conversao: number }[]
  inadimplenciaPorTributo: { nome: string; codigos: number[]; saldo: number; lancado: number; conversao: number }[]
  canais: { nome: string; n: number }[]
  baixasPorAno: { ano: number; n: number }[]
}

const TOP_N_INAD = 10

export async function resumoCobranca(ano = 2025): Promise<ResumoCobranca> {
  return cached(`cobranca:${ano}`, TTL_15MIN, () => resumoCobrancaRaw(ano))
}

async function resumoCobrancaRaw(ano: number): Promise<ResumoCobranca> {
  const [rank, canaisR, anoR] = await Promise.all([
    rankingTributos(false, ano),
    agentQuery(`
      SELECT ds_setor_origem_baixa AS setor, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      GROUP BY ds_setor_origem_baixa`, 100),
    agentQuery(`
      SELECT YEAR(dt_baixa) AS ano, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      GROUP BY YEAR(dt_baixa)`, 100),
  ])

  const tributos = rank
    .filter(t => t.lancado > 0)
    .map(t => ({ nome: t.nome, lancado: t.lancado, arrecadado: t.arrecadado, saldo: t.saldo, conversao: t.lancado ? (t.arrecadado / t.lancado) * 100 : 0 }))
    .slice(0, 10)

  // Inadimplência (saldo devedor) por tributo ANALÍTICO — cada cd_tributo individual (não
  // agrupado por IPTU/ITBI/ISS/...), ranqueado pelo saldo (diferente de `tributos`, que
  // ranqueia pelo lançado). Top N + linha agregada "Demais tributos", mesmo padrão do
  // ranking de Outros Tributos por Tipo.
  const rankSaldo = rank.filter(t => t.saldo > 0).sort((a, b) => b.saldo - a.saldo)
  const topInad = rankSaldo.slice(0, TOP_N_INAD)
  const restoInad = rankSaldo.slice(TOP_N_INAD)
  const inadimplenciaPorTributo = topInad.map(t => ({ nome: t.nome, codigos: [t.cd], saldo: t.saldo, lancado: t.lancado, conversao: t.lancado ? (t.arrecadado / t.lancado) * 100 : 0 }))
  if (restoInad.length) {
    const lancadoResto = restoInad.reduce((a, t) => a + t.lancado, 0)
    const arrecadadoResto = restoInad.reduce((a, t) => a + t.arrecadado, 0)
    inadimplenciaPorTributo.push({
      nome: `Demais tributos (${restoInad.length})`,
      codigos: restoInad.map(t => t.cd),
      saldo: restoInad.reduce((a, t) => a + t.saldo, 0),
      lancado: lancadoResto,
      conversao: lancadoResto ? (arrecadadoResto / lancadoResto) * 100 : 0,
    })
  }

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

  const totalBaixas = anoR.rows.reduce((a, r) => a + num(r[1]), 0)

  return {
    ano, lancado, arrecadado, saldo,
    conversao: lancado ? (arrecadado / lancado) * 100 : 0,
    totalBaixas, tributos, inadimplenciaPorTributo, canais, baixasPorAno,
  }
}

export interface DamMes { mes: number; qt: number }
export interface DamTributo { nome: string; codigos: number[]; qt: number }
export interface DamOperador { nome: string; qt: number }
export interface DamsGeradas {
  ano: number
  total: number
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
export async function damsGeradas(ano = 2025): Promise<DamsGeradas> {
  return cached(`dams:${ano}`, TTL_15MIN, () => damsGeradasRaw(ano))
}

async function damsGeradasRaw(ano: number): Promise<DamsGeradas> {
  const [totalR, mesR, tribR, operR] = await Promise.all([
    agentQuery(`SELECT COUNT(*) FROM ${SCHEMA}.tb_dsod_guias WHERE YEAR(dt_geracao) = ${ano}`, 1),
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias g
      LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
      WHERE YEAR(g.dt_geracao) = ${ano}
      GROUP BY g.cd_tributo, t.ds_tributo`, 200),
    // Milhares de valores distintos (muitos são CPF/CNPJ de contribuintes que geraram a
    // própria guia pelo portal) — TOP + ORDER BY direto no SQL, "Demais" calculado por
    // diferença do total (evita trazer a cauda toda pro JS).
    agentQuery(`
      SELECT TOP ${TOP_N_DAM_OPER} cd_usuario_gerador, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}
      GROUP BY cd_usuario_gerador
      ORDER BY qt DESC`, TOP_N_DAM_OPER),
  ])

  const total = num(totalR.rows[0]?.[0])

  const porMesMap = new Map<number, number>()
  for (const row of mesR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) porMesMap.set(m, num(row[1])) }
  const porMes: DamMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, qt: porMesMap.get(m) ?? 0 })

  const tribList = tribR.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`, qt: num(row[2]) }))
    .filter(x => x.qt > 0)
    .sort((a, b) => b.qt - a.qt)
  const topTrib = tribList.slice(0, TOP_N_DAM_TRIB)
  const restoTrib = tribList.slice(TOP_N_DAM_TRIB)
  const porTributo: DamTributo[] = topTrib.map(t => ({ nome: t.nome, codigos: [t.cd], qt: t.qt }))
  if (restoTrib.length) {
    porTributo.push({ nome: `Demais tributos (${restoTrib.length})`, codigos: restoTrib.map(t => t.cd), qt: restoTrib.reduce((s, t) => s + t.qt, 0) })
  }

  const operList = operR.rows
    .map(row => ({ nome: String(row[0] ?? '').trim() || 'Não identificado', qt: num(row[1]) }))
    .filter(x => x.qt > 0)
  const somaTopOper = operList.reduce((s, x) => s + x.qt, 0)
  const porOperador: DamOperador[] = [...operList]
  const restoOper = total - somaTopOper
  if (restoOper > 0) porOperador.push({ nome: 'Demais operadores', qt: restoOper })

  return { ano, total, porMes, porTributo, porOperador }
}
