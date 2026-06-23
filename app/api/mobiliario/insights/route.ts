import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, SITUACOES_ATIVAS } from '@/lib/mobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_ISS = /IMPOSTOS SOBRE SERVI/i

const int = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const money = (v: number) =>
  Math.abs(v) >= 1e9
    ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' bi'
    : 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [sitRows, abRows, receita] = await Promise.all([
      agentQuery(`
        SELECT ds_situacao AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY ds_situacao`, 50),
      agentQuery(`
        SELECT YEAR(dt_inicio_atividade) AS ano, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY YEAR(dt_inicio_atividade)`, 200),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea, SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
    ])

    let total = 0, ativas = 0
    for (const r of sitRows.rows) {
      const sit = String(r[0] ?? '').trim(), n = Number(r[1]) || 0
      total += n
      if (SITUACOES_ATIVAS.has(sit)) ativas += n
    }

    const ab = new Map<number, number>()
    for (const r of abRows.rows) {
      const ano = Number(r[0]); if (ano < 2000 || ano > 2030) continue
      ab.set(ano, (ab.get(ano) ?? 0) + (Number(r[1]) || 0))
    }
    const iss = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_ISS.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0]); iss.set(ano, (iss.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    const anoMax = Math.max(...Array.from(ab.keys()), ...Array.from(iss.keys()), 0)
    const anoAtual = f.ano || anoMax

    const insights: string[] = []
    if (total) {
      insights.push(`O cadastro mobiliário tem ${int(total)} empresas, sendo ${int(ativas)} ativas (${pct((ativas / total) * 100)} da base).`)
    }
    const abA = ab.get(anoAtual) ?? 0, abP = ab.get(anoAtual - 1) ?? 0
    if (abA || abP) {
      if (abP) {
        const v = ((abA - abP) / abP) * 100
        insights.push(`${int(abA)} empresas abertas em ${anoAtual} (${v >= 0 ? '+' : ''}${pct(v)} vs ${anoAtual - 1}).`)
      } else {
        insights.push(`${int(abA)} empresas abertas em ${anoAtual}.`)
      }
    }
    const issA = iss.get(anoAtual) ?? 0
    if (issA) {
      insights.push(`ISS arrecadado de ${money(issA)} em ${anoAtual} — o principal tributo do cadastro mobiliário.`)
    }

    return NextResponse.json({ insights, geradoEm: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
