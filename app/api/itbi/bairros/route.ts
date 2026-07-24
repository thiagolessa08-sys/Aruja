import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bairrosItbi, type MetricaBairroItbi } from '@/lib/itbi-agg'

const METRICAS_OK: MetricaBairroItbi[] = ['lancado', 'arrecadado', 'inadimplencia', 'emAberto', 'isento', 'suspenso']

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const bairro = sp.get('bairro') || null
    const rua = bairro ? (sp.get('rua') || null) : null
    const met = sp.get('metrica') as MetricaBairroItbi
    const metrica = METRICAS_OK.includes(met) ? met : 'lancado'
    const itens = await bairrosItbi({
      ano: Number(sp.get('ano')) || new Date().getFullYear(),
      espolio: sp.get('espolio') === '1',
      semNumero: sp.get('semnumero') === '1',
      bairro,
      rua,
      metrica,
    })
    const nivel = rua ? 'imovel' : bairro ? 'rua' : 'bairro'
    return NextResponse.json({ nivel, bairro, rua, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
