import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { devedoresPorGrupo } from '@/lib/tributo-engine'
import { parseGrupo } from '@/lib/tributos'

// Drill do gráfico "Tributos Lançados" (Contribuinte): maiores devedores do grupo de
// tributo clicado, com nome e tipo de pessoa (F/J).
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const grupo = parseGrupo(req.nextUrl.searchParams.get('grupo'))
  if (!grupo) return NextResponse.json({ error: 'grupo inválido' }, { status: 400 })
  const ano = Number(req.nextUrl.searchParams.get('ano')) || undefined
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    const itens = await devedoresPorGrupo(grupo, ano, mes)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
