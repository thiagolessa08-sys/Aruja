import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { damsDrillMes, DamDrillFiltro } from '@/lib/cobranca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
  const tipo = req.nextUrl.searchParams.get('tipo')
  const codigosRaw = req.nextUrl.searchParams.get('codigos')
  const nome = req.nextUrl.searchParams.get('nome')

  let filtro: DamDrillFiltro
  if (tipo === 'tributo' && codigosRaw) {
    const codigos = codigosRaw.split(',').map(Number).filter(n => Number.isFinite(n))
    if (!codigos.length) return NextResponse.json({ error: 'codigos inválido' }, { status: 400 })
    filtro = { tipo: 'tributo', codigos }
  } else if (tipo === 'operador' && nome) {
    filtro = { tipo: 'operador', nome }
  } else {
    return NextResponse.json({ error: 'Parâmetros inválidos: informe tipo=tributo&codigos=... ou tipo=operador&nome=...' }, { status: 400 })
  }

  try {
    const data = await damsDrillMes(ano, mes, filtro)
    return NextResponse.json({ porMes: data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
