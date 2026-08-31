import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { historicoAreaEdificada, qtdIsscc, qtdIssccAteMes, bucketsIsscc, bucketsIssccAteMes } from '@/lib/isscc-engine'

// Item 2 — Histórico de alterações de área edificada × quantidade/valor de ISSCC, por ano.
// mes: acumulado até o mês (YTD), aplicado a todos os anos da série (mesma convenção do
// hist de Evolução em /api/isscc/visao).
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const mesSel = Number(req.nextUrl.searchParams.get('mes')) || null
    const [area, qtd, buckets] = await Promise.all([
      historicoAreaEdificada(mesSel),
      mesSel ? qtdIssccAteMes(mesSel) : qtdIsscc(),
      mesSel ? bucketsIssccAteMes(mesSel) : bucketsIsscc(),
    ])

    // Anos com alteração de área OU ISSCC lançado; últimos 8.
    const anosSet = new Set<number>()
    for (const a of area.keys()) anosSet.add(a)
    for (const [a, b] of buckets) if (b.lancado > 0) anosSet.add(a)
    const anos = [...anosSet].filter(a => a >= 2016).sort((x, y) => x - y).slice(-8)

    const serie = anos.map(ano => {
      const ar = area.get(ano)
      const b = buckets.get(ano)
      return {
        ano,
        imoveisAlterados: ar?.imoveisAlterados ?? 0,
        areaEdificada: ar?.areaEdificada ?? 0,
        qtdIsscc: qtd.get(ano) ?? 0,
        valorIsscc: b?.lancado ?? 0,
      }
    })
    return NextResponse.json({ serie })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
