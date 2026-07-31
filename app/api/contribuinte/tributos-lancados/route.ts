import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { lancadoPorGrupo } from '@/lib/tributo-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || undefined
    const grupos = await lancadoPorGrupo(ano)
    return NextResponse.json({ grupos })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
