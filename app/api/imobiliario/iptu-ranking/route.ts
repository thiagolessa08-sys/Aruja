import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { rankingIptu, type MetricaRank } from '@/lib/iptu-agg'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const tipo = sp.get('tipo') === 'proprietario' ? 'proprietario' : 'imovel'
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const metrica = (['lancado', 'arrecadado', 'emAberto', 'inadimplencia'] as const).find(m => m === sp.get('metrica')) ?? 'lancado' as MetricaRank
    return NextResponse.json({ tipo, metrica, itens: await rankingIptu(tipo, ano, metrica, sp.get('bairro') || null) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
