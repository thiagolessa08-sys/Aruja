import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { buscarContribuintes } from '@/lib/contribuinte-detalhe'

// Busca de contribuintes por nome ou CPF/CNPJ — alimenta o card "Consultar Contribuinte".
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ matches: [] })
  try {
    return NextResponse.json({ matches: await buscarContribuintes(q) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
