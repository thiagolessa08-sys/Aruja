import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { devedoresPorTributo } from '@/lib/tributo-engine'

// Drill "quem deve" do ranking de Inadimplência por Tributo Analítico (Cobrança).
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const codigos = (req.nextUrl.searchParams.get('codigos') ?? '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v))
  if (!codigos.length) return NextResponse.json({ error: 'codigos inválido' }, { status: 400 })
  const ano = Number(req.nextUrl.searchParams.get('ano')) || undefined

  try {
    const itens = await devedoresPorTributo(codigos, ano)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
