import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bairrosTributo, OPC_ISSCC, type MetricaBairro } from '@/lib/bairros-tributo'

const OK: MetricaBairro[] = ['lancado', 'arrecadado', 'emAberto', 'inadimplencia', 'isento', 'suspenso']

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const bairro = sp.get('bairro') || null
    const m = sp.get('metrica') as MetricaBairro
    const metrica = OK.includes(m) ? m : 'lancado'
    return NextResponse.json({ bairros: await bairrosTributo(OPC_ISSCC, { ano, bairro, metrica }) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
