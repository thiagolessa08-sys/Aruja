import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, FAIXA_CASE } from '@/lib/imobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_IPTU = /PREDIAL E TERRITORIAL URBANA/i

function money(v: number): string {
  if (Math.abs(v) >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' bi'
  return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
}
const int = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [cadastro, receita] = await Promise.all([
      agentQuery(`
        SELECT no_exercicio_lancamento AS ano, COUNT(*) AS qt,
          SUM(vl_venal_imovel) AS venal, SUM(vl_venal_imovel * vl_aliquota) AS lancado
        FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
        WHERE no_exercicio_lancamento BETWEEN 2018 AND 2030
        GROUP BY no_exercicio_lancamento`, 50),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea, SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
    ])

    const cad = new Map<number, { qt: number; venal: number; lancado: number }>()
    let anoMax = 0
    for (const r of cadastro.rows) {
      const ano = Number(r[0]); if (!ano || ano < 1990) continue
      cad.set(ano, { qt: Number(r[1]) || 0, venal: Number(r[2]) || 0, lancado: Number(r[3]) || 0 })
      if (ano > anoMax) anoMax = ano
    }
    const iptuArr = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_IPTU.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0]); iptuArr.set(ano, (iptuArr.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    const ano = f.ano || anoMax
    const c = cad.get(ano)
    const arr = iptuArr.get(ano) ?? 0

    // Concentração: imóveis com venal até R$ 300 mil (faixas 1 e 2)
    const faixaRes = await agentQuery(`
      SELECT ${FAIXA_CASE} AS faixa, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
      WHERE no_exercicio_lancamento = ${ano} GROUP BY ${FAIXA_CASE}`, 20)
    let totFaixa = 0, ate300 = 0
    for (const r of faixaRes.rows) {
      const id = Number(r[0]), qt = Number(r[1]) || 0
      totFaixa += qt
      if (id === 1 || id === 2) ate300 += qt
    }

    const insights: string[] = []
    if (c) {
      insights.push(`O cadastro imobiliário de ${ano} tem ${int(c.qt)} imóveis lançados, somando ${money(c.venal)} em valor venal.`)
      const taxa = c.lancado ? (arr / c.lancado) * 100 : 0
      if (c.lancado >= 1e6) {
        insights.push(`IPTU lançado estimado de ${money(c.lancado)}; arrecadado ${money(arr)} até agora (${pct(taxa)} do lançado).`)
      } else {
        insights.push(`IPTU arrecadado de ${money(arr)} em ${ano}.`)
      }
    }
    if (totFaixa) {
      insights.push(`${pct((ate300 / totFaixa) * 100)} dos imóveis têm valor venal de até R$ 300 mil — base predominantemente residencial popular.`)
    }

    return NextResponse.json({ insights, geradoEm: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
