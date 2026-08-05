import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieDiariaTributo } from '@/lib/serie-diaria-tributo'

const isData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    let de = sp.get('de') || `${ano}-01-01`
    let ate = sp.get('ate') || `${ano}-12-31`
    if (!isData(de)) de = `${ano}-01-01`
    if (!isData(ate)) ate = `${ano}-12-31`
    const dias = await serieDiariaTributo('tcaDiario', '67', de, ate)
    const total = dias.reduce((s, d) => s + d.valor, 0)
    return NextResponse.json({ de, ate, dias, total })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
