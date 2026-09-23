import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { analiseConversaoMes, ConversaoMesFiltro } from '@/lib/cobranca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mesRaw = req.nextUrl.searchParams.get('mes')
  const mes = Number(mesRaw)
  const tipo = req.nextUrl.searchParams.get('tipo')
  const codigosRaw = req.nextUrl.searchParams.get('codigos')
  const nome = req.nextUrl.searchParams.get('nome')

  if (!mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'mês inválido (1-12)' }, { status: 400 })
  }

  let filtro: ConversaoMesFiltro
  if (tipo === 'tributo' && codigosRaw) {
    const codigos = codigosRaw.split(',').map(Number).filter(n => Number.isFinite(n))
    if (!codigos.length) return NextResponse.json({ error: 'codigos inválidos' }, { status: 400 })
    filtro = { tipo: 'tributo', codigos }
  } else if (tipo === 'operador' && nome) {
    filtro = { tipo: 'operador', nome }
  } else if (tipo === 'geral') {
    filtro = { tipo: 'geral' }
  } else {
    return NextResponse.json({ error: 'Parâmetros inválidos: informe tipo=tributo&codigos=..., tipo=operador&nome=... ou tipo=geral' }, { status: 400 })
  }

  try {
    const item = await analiseConversaoMes(ano, mes, filtro)
    return NextResponse.json(item)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
