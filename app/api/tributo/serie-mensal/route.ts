import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieMensalTributo } from '@/lib/tributo-engine'
import { parseGrupo } from '@/lib/tributos'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const grupo = parseGrupo(req.nextUrl.searchParams.get('grupo'))
  if (!grupo) return NextResponse.json({ error: 'grupo inválido' }, { status: 400 })
  const ano = Number(req.nextUrl.searchParams.get('ano'))
  if (!ano) return NextResponse.json({ error: 'ano inválido' }, { status: 400 })

  try {
    const serie = await serieMensalTributo(grupo, ano)
    return NextResponse.json({ grupo, ano, serie })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
