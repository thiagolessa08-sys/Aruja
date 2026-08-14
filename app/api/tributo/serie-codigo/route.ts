import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieTributoPorCodigos, dataAtualizacaoTributo } from '@/lib/tributo-engine'

// Detalhe (série anual) de um ou mais códigos de tributo específicos — drill do ranking
// "Outros Tributos por Tipo" (OutrosTributosPorTipo/OutrosTributoDetalhe).
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const codigos = (req.nextUrl.searchParams.get('codigos') ?? '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v))
  if (!codigos.length) return NextResponse.json({ error: 'codigos inválido' }, { status: 400 })
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    const [serie, dataAtualizacao] = await Promise.all([
      serieTributoPorCodigos(codigos, undefined, undefined, mes),
      dataAtualizacaoTributo(),
    ])
    return NextResponse.json({ serie, dataAtualizacao })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
