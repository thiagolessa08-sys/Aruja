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
