import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { maioresDevedores } from '@/lib/divida-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const limite = Number(req.nextUrl.searchParams.get('limite')) || 200
    const devedores = await maioresDevedores(limite)
    return NextResponse.json({ devedores })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
