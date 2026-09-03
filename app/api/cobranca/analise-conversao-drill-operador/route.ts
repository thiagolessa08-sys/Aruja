import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { conversaoDrillOperador, ConversaoDrillOperadorFiltro } from '@/lib/cobranca-engine'

// Drill "por operador" da Análise de Conversão — espelho de analise-conversao-drill, mas
// quebrando por operador em vez de por tributo: ao clicar num tributo (lente Por Tributo) ou
// num período (lente Por Período), alimenta o "Melhor usuário" do box Melhor desempenho.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
  const tipo = req.nextUrl.searchParams.get('tipo')
  const anoDrillRaw = req.nextUrl.searchParams.get('anoDrill')
  const nome = req.nextUrl.searchParams.get('nome')

  let filtro: ConversaoDrillOperadorFiltro
  if (tipo === 'periodo' && anoDrillRaw && /^\d{4}$/.test(anoDrillRaw)) {
    filtro = { tipo: 'periodo', ano: Number(anoDrillRaw) }
  } else if (tipo === 'tributo' && nome) {
    filtro = { tipo: 'tributo', nome }
  } else {
    return NextResponse.json({ error: 'Parâmetros inválidos: informe tipo=periodo&anoDrill=... ou tipo=tributo&nome=...' }, { status: 400 })
  }

  try {
    const itens = await conversaoDrillOperador(ano, mes, filtro)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
