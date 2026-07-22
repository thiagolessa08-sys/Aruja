import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereExtra, whereUO, ANO_MIN_DESPESA } from '@/lib/despesa-filtros'

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

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const we = whereExtra({ ...f, mes: null }) // mês tratado em JS; aqui só secretaria

    const [execucao, orcado, alteracao] = await Promise.all([
      agentQuery(`
        SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
          SUM(f.VL_SALDO_MES_EMPENHADO) AS emp,
          SUM(f.VL_SALDO_MES_LIQUIDADO) AS liq,
          SUM(f.VL_SALDO_MES_PAGO) AS pago
        FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
        WHERE 1=1${we}
        GROUP BY d.NO_ANO, d.NO_MES`, 3000),
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ORC_APROV_LEI) AS loa
        FROM ${SCHEMA}.FATO_BIORC_ELABORACAO_ORCAMENTO f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO >= ${ANO_MIN_DESPESA}${whereUO('f.SK_INSTITUCIONAL_EXECUCAO', f.secretaria)}
        GROUP BY d.NO_ANO`, 100),
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ALTERACAOORCAMENTARIA) AS alt
        FROM ${SCHEMA}.FATO_BIORC_ALTERACAO_ORCAMENTARIA_DESPESA f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO >= ${ANO_MIN_DESPESA}${whereUO('f.SK_INSTITUCIONAL', f.secretaria)}
        GROUP BY d.NO_ANO`, 100),
    ])

    const emp = new Map<string, number>(), liq = new Map<string, number>(), pago = new Map<string, number>()
    const mesesPorAno = new Map<number, number>()
    let anoMax = 0
    for (const r of execucao.rows) {
      const ano = Number(r[0]), mes = Number(r[1])
      emp.set(`${ano}-${mes}`, Number(r[2]) || 0)
      liq.set(`${ano}-${mes}`, Number(r[3]) || 0)
      pago.set(`${ano}-${mes}`, Number(r[4]) || 0)
      mesesPorAno.set(ano, Math.max(mesesPorAno.get(ano) ?? 0, mes))
      if (ano > anoMax) anoMax = ano
    }

    const ano = f.ano || anoMax
    const anoAnt = ano - 1
    // mês de referência: específico (filtro) ou último mês com dados do ano
    const mesRef = f.mes || mesesPorAno.get(ano) || 12

    // Acumulado (YTD) de janeiro até o mês de referência — quando um mês é selecionado,
    // Empenhado/Liquidado/Pago somam o período (jan..mês), não só o mês isolado.
    const soma = (m: Map<string, number>, a: number, ateMes: number = mesRef) => {
      let s = 0
      for (let i = 1; i <= ateMes; i++) s += m.get(`${a}-${i}`) ?? 0
      return s
    }

    const loa = new Map<number, number>()
    for (const r of orcado.rows) loa.set(Number(r[0]), Number(r[1]) || 0)
    const alt = new Map<number, number>()
    for (const r of alteracao.rows) alt.set(Number(r[0]), Number(r[1]) || 0)

    const dotIniAtual = loa.get(ano) ?? 0
    const dotIniAnt = loa.get(anoAnt) ?? 0
    const dotAtuAtual = (loa.get(ano) ?? 0) + (alt.get(ano) ?? 0)
    const dotAtuAnt = (loa.get(anoAnt) ?? 0) + (alt.get(anoAnt) ?? 0)

    const empA = soma(emp, ano), empB = soma(emp, anoAnt)
    const liqA = soma(liq, ano), liqB = soma(liq, anoAnt, 12) // Ano Anterior = ano completo, não YTD
    const pagoA = soma(pago, ano), pagoB = soma(pago, anoAnt)

    const subAno = `Ano Anterior`

    const kpis: Kpi[] = [
      { label: 'Dotação Inicial', value: fmtMi(dotIniAtual), subLabel: subAno, subValue: fmtMi(dotIniAnt), ...variacao(dotIniAtual, dotIniAnt) },
      { label: 'Dotação Atualizada', value: fmtMi(dotAtuAtual), subLabel: subAno, subValue: fmtMi(dotAtuAnt), ...variacao(dotAtuAtual, dotAtuAnt) },
      { label: 'Valor Empenho', value: fmtMi(empA), subLabel: subAno, subValue: fmtMi(empB), ...variacao(empA, empB) },
      { label: 'Valor Liquidado', value: fmtMi(liqA), subLabel: subAno, subValue: fmtMi(liqB), ...variacao(liqA, liqB) },
      { label: 'Valor Pago', value: fmtMi(pagoA), subLabel: subAno, subValue: fmtMi(pagoB), ...variacao(pagoA, pagoB) },
    ]

    return NextResponse.json({ kpis, referencia: { ano, mes: mesRef } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
