import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, FAIXA_CASE } from '@/lib/imobiliario-filtros'
import { bucketsIptu } from '@/lib/tributo-engine'

const SCHEMA = 'pref_aruja_sp'

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

    const [cadastro, buckets] = await Promise.all([
      agentQuery(`
        SELECT no_exercicio_lancamento AS ano, COUNT(*) AS qt, SUM(vl_venal_imovel) AS venal
        FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
        WHERE no_exercicio_lancamento BETWEEN 2018 AND 2030
        GROUP BY no_exercicio_lancamento`, 50),
      bucketsIptu(),
    ])

    const cad = new Map<number, { qt: number; venal: number }>()
    let anoMax = 0
    for (const r of cadastro.rows) {
      const ano = Number(r[0]); if (!ano || ano < 1990) continue
      cad.set(ano, { qt: Number(r[1]) || 0, venal: Number(r[2]) || 0 })
      if (ano > anoMax) anoMax = ano
    }
    anoMax = Math.max(anoMax, buckets.size ? Math.max(...buckets.keys()) : 0)
    const ano = f.ano || anoMax
    const c = cad.get(ano)
    const b = buckets.get(ano)

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
    if (c) insights.push(`O cadastro imobiliário de ${ano} tem ${int(c.qt)} imóveis lançados, somando ${money(c.venal)} em valor venal.`)
    if (b) {
      const taxa = b.lancado ? (b.arrecadado / b.lancado) * 100 : 0
      insights.push(`IPTU lançado de ${money(b.lancado)}; arrecadado ${money(b.arrecadado)} (${pct(taxa)} do lançado).`)
      insights.push(`Inadimplência de ${money(b.inadimplente)} (vencido) e ${money(b.emAberto)} ainda em aberto a receber.`)
    }
    if (totFaixa && insights.length < 3) {
      insights.push(`${pct((ate300 / totFaixa) * 100)} dos imóveis têm valor venal de até R$ 300 mil — base predominantemente residencial popular.`)
    }

    return NextResponse.json({ insights, geradoEm: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
