import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { historicoNegArrPorMes } from '@/lib/divida-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano'))
    if (!ano) return NextResponse.json({ error: 'Parâmetro ano é obrigatório' }, { status: 400 })
    const meses = await historicoNegArrPorMes(ano)
    return NextResponse.json({ meses })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
