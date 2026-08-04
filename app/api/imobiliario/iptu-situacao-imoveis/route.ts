import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { imoveisPorSituacao } from '@/lib/iptu-agg'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const situacao = sp.get('situacao') || ''
    if (!situacao) return NextResponse.json({ error: 'situacao inválida' }, { status: 400 })
    const bairro = sp.get('bairro') || null
    const itens = await imoveisPorSituacao({
      ano,
      bairro,
      rua: bairro ? (sp.get('rua') || null) : null,
      espolio: sp.get('espolio') === '1',
      semNumero: sp.get('semnumero') === '1',
    }, situacao, sp.get('q') || undefined)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
