import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { conversaoDrillTributo, ConversaoDrillFiltro } from '@/lib/cobranca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
  const tipo = req.nextUrl.searchParams.get('tipo')
  const anoDrillRaw = req.nextUrl.searchParams.get('anoDrill')
  const nome = req.nextUrl.searchParams.get('nome')

  let filtro: ConversaoDrillFiltro
  if (tipo === 'periodo' && anoDrillRaw && /^\d{4}$/.test(anoDrillRaw)) {
    filtro = { tipo: 'periodo', ano: Number(anoDrillRaw) }
  } else if (tipo === 'operador' && nome) {
    filtro = { tipo: 'operador', nome }
  } else {
    return NextResponse.json({ error: 'Parâmetros inválidos: informe tipo=periodo&anoDrill=... ou tipo=operador&nome=...' }, { status: 400 })
  }

  try {
    const itens = await conversaoDrillTributo(ano, mes, filtro)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
