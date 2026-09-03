import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resultadoMensalRanking } from '@/lib/cobranca-engine'

// Top 10 Mês/Ano por DAM Geradas, no histórico inteiro — alimenta o mapa de calor (treemap)
// da tela de Cobrança.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    const itens = await resultadoMensalRanking(mes)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
