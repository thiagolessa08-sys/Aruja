import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { previsaoIssFora } from '@/lib/iss-fora-previsao'

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    return NextResponse.json(await previsaoIssFora())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
