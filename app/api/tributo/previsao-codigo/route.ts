import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { previsaoTributoCodigos } from '@/lib/tributo-engine'

// Previsão (lançado, 3 níveis) de um ou mais códigos de tributo específicos — drill do
// ranking "Outros Tributos por Tipo" (OutrosTributoDetalhe).
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const codigos = (req.nextUrl.searchParams.get('codigos') ?? '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v))
  if (!codigos.length) return NextResponse.json({ error: 'codigos inválido' }, { status: 400 })

  try {
    const previsao = await previsaoTributoCodigos(codigos)
    return NextResponse.json(previsao)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
