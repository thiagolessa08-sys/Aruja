import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoDivida, iptuDividaResumo, debitosPassiveisDivida, situacaoParcelas, debitosNegociadosDivida, dataAtualizacaoDivida } from '@/lib/divida-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || undefined
    const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
    const [data, iptuDivida, debitosPassiveis, situacoes, negociados, geral, dataAtualizacao] = await Promise.all([
      resumoDivida(ano, mes), iptuDividaResumo(ano, mes), debitosPassiveisDivida(ano, mes), situacaoParcelas(ano, mes),
      debitosNegociadosDivida(ano, mes),
      ano ? resumoDivida() : Promise.resolve(null), // só p/ extrair a lista de anos quando filtrado
      dataAtualizacaoDivida(),
    ])
    const anos = (geral ?? data).recuperacao.porExercicio.map(x => x.ano).sort((a, b) => b - a)
    return NextResponse.json({ ...data, iptuDivida, debitosPassiveis, situacoes, negociados, anos, dataAtualizacao })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
