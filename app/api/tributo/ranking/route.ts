import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { rankingTributos } from '@/lib/tributo-engine'

// Ranking de tributos individuais (cd_tributo + nome) dentro do grupo "Outros Tributos"
// (tudo que não cai em IPTU/ITBI/ISS Construção Civil/ISS/TFE/TFHS) — usado no gráfico
// "Outros Tributos por Tipo" da tela Outros Tributos.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const ano = Number(req.nextUrl.searchParams.get('ano')) || undefined
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    const itens = await rankingTributos(true, ano, mes)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
