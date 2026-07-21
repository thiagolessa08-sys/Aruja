import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieMensalTributo } from '@/lib/serie-mensal-tributo'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || new Date().getFullYear()
    const meses = await serieMensalTributo({ cacheKey: 'tcaMensal', codigos: '67' }, ano)
    return NextResponse.json({ meses })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
