import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { comparativoIptu } from '@/lib/iptu-comparativo'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const bairro = sp.get('bairro') || null
    return NextResponse.json(await comparativoIptu(ano, bairro))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
