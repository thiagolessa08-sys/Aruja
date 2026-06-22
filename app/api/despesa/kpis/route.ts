import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'

interface Kpi {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

function fmtMi(v: number): string {
  return (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
}

function variacao(atual: number, anterior: number): { pct: string; dir: 'up' | 'down' | 'flat' } {
  if (!anterior) return { pct: '0,00%', dir: 'flat' }
  const r = ((atual - anterior) / Math.abs(anterior)) * 100
  const dir = r > 0.005 ? 'up' : r < -0.005 ? 'down' : 'flat'
  return { pct: r.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%', dir }
}

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const [execucao, orcado, alteracao] = await Promise.all([
      agentQuery(`
        SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
          SUM(f.VL_SALDO_MES_EMPENHADO) AS emp,
          SUM(f.VL_SALDO_MES_LIQUIDADO) AS liq,
          SUM(f.VL_SALDO_MES_PAGO) AS pago
        FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO, d.NO_MES`, 2000),
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ORC_APROV_LEI) AS loa
        FROM ${SCHEMA}.FATO_BIORC_ELABORACAO_ORCAMENTO f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO`, 100),
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ALTERACAOORCAMENTARIA) AS alt
        FROM ${SCHEMA}.FATO_BIORC_ALTERACAO_ORCAMENTARIA_DESPESA f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO`, 100),
    ])

    const emp = new Map<string, number>()
    const liq = new Map<string, number>()
    const pago = new Map<string, number>()
    let anoAtual = 0, mesAtual = 0
    for (const r of execucao.rows) {
      const ano = Number(r[0]), mes = Number(r[1])
      emp.set(`${ano}-${mes}`, Number(r[2]) || 0)
      liq.set(`${ano}-${mes}`, Number(r[3]) || 0)
      pago.set(`${ano}-${mes}`, Number(r[4]) || 0)
      if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) { anoAtual = ano; mesAtual = mes }
    }
    const anoAnt = anoAtual - 1
    const ytd = (m: Map<string, number>, ano: number) => {
      let s = 0
      for (let i = 1; i <= mesAtual; i++) s += m.get(`${ano}-${i}`) ?? 0
      return s
    }

    const loa = new Map<number, number>()
    for (const r of orcado.rows) loa.set(Number(r[0]), Number(r[1]) || 0)
    const alt = new Map<number, number>()
    for (const r of alteracao.rows) alt.set(Number(r[0]), Number(r[1]) || 0)

    const dotIniAtual = loa.get(anoAtual) ?? 0
    const dotIniAnt = loa.get(anoAnt) ?? 0
    const dotAtuAtual = (loa.get(anoAtual) ?? 0) + (alt.get(anoAtual) ?? 0)
    const dotAtuAnt = (loa.get(anoAnt) ?? 0) + (alt.get(anoAnt) ?? 0)

    const empA = ytd(emp, anoAtual), empB = ytd(emp, anoAnt)
    const liqA = ytd(liq, anoAtual), liqB = ytd(liq, anoAnt)
    const pagoA = ytd(pago, anoAtual), pagoB = ytd(pago, anoAnt)

    const kpis: Kpi[] = [
      { label: 'Dotação Inicial', value: fmtMi(dotIniAtual), subLabel: 'Ano Anterior', subValue: fmtMi(dotIniAnt), ...variacao(dotIniAtual, dotIniAnt) },
      { label: 'Dotação Atualizada', value: fmtMi(dotAtuAtual), subLabel: 'Ano Anterior', subValue: fmtMi(dotAtuAnt), ...variacao(dotAtuAtual, dotAtuAnt) },
      { label: 'Valor Empenho', value: fmtMi(empA), subLabel: 'Ano Anterior', subValue: fmtMi(empB), ...variacao(empA, empB) },
      { label: 'Valor Liquidado', value: fmtMi(liqA), subLabel: 'Ano Anterior', subValue: fmtMi(liqB), ...variacao(liqA, liqB) },
      { label: 'Valor Pago', value: fmtMi(pagoA), subLabel: 'Ano Anterior', subValue: fmtMi(pagoB), ...variacao(pagoA, pagoB) },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual, mes: mesAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
