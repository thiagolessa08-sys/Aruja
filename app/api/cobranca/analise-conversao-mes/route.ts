import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { analiseConversaoMesPorTributo, analiseConversaoMesPorOperador } from '@/lib/cobranca-engine'

// tipo=tributo (DAM já filtrado por um tributo) → quebra POR OPERADOR daquele tributo/mês.
// tipo=operador (DAM já filtrado por um operador) → quebra POR TRIBUTO daquele operador/mês.
// tipo=geral (lente "Por Período", sem filtro) → quebra POR TRIBUTO do mês inteiro.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mesRaw = req.nextUrl.searchParams.get('mes')
  const mes = Number(mesRaw)
  const tipo = req.nextUrl.searchParams.get('tipo')
  const codigosRaw = req.nextUrl.searchParams.get('codigos')
  const nome = req.nextUrl.searchParams.get('nome')

  if (!mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'mês inválido (1-12)' }, { status: 400 })
  }

  try {
    if (tipo === 'tributo' && codigosRaw) {
      const codigos = codigosRaw.split(',').map(Number).filter(n => Number.isFinite(n))
      if (!codigos.length) return NextResponse.json({ error: 'codigos inválidos' }, { status: 400 })
      const itens = await analiseConversaoMesPorOperador(ano, mes, { tipo: 'tributo', codigos })
      return NextResponse.json({ eixo: 'operador', itens })
    }
    if (tipo === 'operador' && nome) {
      const itens = await analiseConversaoMesPorTributo(ano, mes, { tipo: 'operador', nome })
      return NextResponse.json({ eixo: 'tributo', itens })
    }
    if (tipo === 'geral') {
      const itens = await analiseConversaoMesPorTributo(ano, mes, { tipo: 'geral' })
      return NextResponse.json({ eixo: 'tributo', itens })
    }
    return NextResponse.json({ error: 'Parâmetros inválidos: informe tipo=tributo&codigos=..., tipo=operador&nome=... ou tipo=geral' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
