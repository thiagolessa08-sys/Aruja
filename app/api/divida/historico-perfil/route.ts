import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { historicoNegArrPorPerfil } from '@/lib/divida-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano'))
    const mes = Number(req.nextUrl.searchParams.get('mes'))
    if (!ano || !mes) return NextResponse.json({ error: 'Parâmetros ano e mes são obrigatórios' }, { status: 400 })
    const perfis = await historicoNegArrPorPerfil(ano, mes)
    return NextResponse.json({ perfis })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
