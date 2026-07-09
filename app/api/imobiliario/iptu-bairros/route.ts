import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bairrosIptu } from '@/lib/iptu-agg'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const bairro = sp.get('bairro') || null
    const itens = await bairrosIptu({
      ano: Number(sp.get('ano')) || new Date().getFullYear(),
      espolio: sp.get('espolio') === '1',
      semNumero: sp.get('semnumero') === '1',
      bairro,
    })
    return NextResponse.json({ nivel: bairro ? 'rua' : 'bairro', bairro, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
