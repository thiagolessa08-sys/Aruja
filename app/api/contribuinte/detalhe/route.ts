import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { detalheContribuinte } from '@/lib/contribuinte-detalhe'

// Perfil completo de um contribuinte (imóveis, estabelecimentos, tributos por grupo,
// composição do saldo em aberto) — alimenta o card "Consultar Contribuinte".
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'Parâmetro id inválido' }, { status: 400 })
  try {
    const detalhe = await detalheContribuinte(id)
    if (!detalhe) return NextResponse.json({ error: 'Contribuinte não encontrado' }, { status: 404 })
    return NextResponse.json({ detalhe })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
