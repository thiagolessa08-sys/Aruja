import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieTributo } from '@/lib/tributo-engine'
import { parseGrupo, LABEL_GRUPO } from '@/lib/tributos'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const grupo = parseGrupo(req.nextUrl.searchParams.get('grupo'))
  if (!grupo) return NextResponse.json({ error: 'grupo inválido' }, { status: 400 })

  try {
    const serie = await serieTributo(grupo)
    return NextResponse.json({ grupo, label: LABEL_GRUPO[grupo], serie })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
