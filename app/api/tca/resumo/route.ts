import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoTca } from '@/lib/tca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || new Date().getFullYear()
    return NextResponse.json(await resumoTca(ano))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
