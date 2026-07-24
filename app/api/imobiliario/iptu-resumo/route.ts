import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoIptu } from '@/lib/iptu-agg'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const bairro = sp.get('bairro') || null
    return NextResponse.json(await resumoIptu({
      ano,
      bairro,
      rua: bairro ? (sp.get('rua') || null) : null,
      espolio: sp.get('espolio') === '1',
      semNumero: sp.get('semnumero') === '1',
      mes: sp.get('mes') ? Number(sp.get('mes')) : null,
    }))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
