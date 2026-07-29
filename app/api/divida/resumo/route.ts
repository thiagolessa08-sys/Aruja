import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoDivida, iptuDividaResumo, debitosPassiveisDivida, situacaoParcelas } from '@/lib/divida-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || undefined
    const [data, iptuDivida, debitosPassiveis, situacoes, geral] = await Promise.all([
      resumoDivida(ano), iptuDividaResumo(ano), debitosPassiveisDivida(ano), situacaoParcelas(ano),
      ano ? resumoDivida() : Promise.resolve(null), // só p/ extrair a lista de anos quando filtrado
    ])
    const anos = (geral ?? data).recuperacao.porExercicio.map(x => x.ano).sort((a, b) => b - a)
    return NextResponse.json({ ...data, iptuDivida, debitosPassiveis, situacoes, anos })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
