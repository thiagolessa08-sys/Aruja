import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieMensalTributo } from '@/lib/serie-mensal-tributo'

const S = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || new Date().getFullYear()
    const meses = await serieMensalTributo({
      cacheKey: 'itbiMensal', codigos: '10',
      joinExtra: `JOIN ${S}.tb_dsod_itbi it ON it.cd_itbi = g.cd_origem`,
      whereExtra: 'AND it.vl_total > 0',
    }, ano)
    return NextResponse.json({ meses })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
