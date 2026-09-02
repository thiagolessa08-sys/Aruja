import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { devedoresPorBairroTributoMes } from '@/lib/tributo-engine'

// Drill "por bairro" do painel "Quando Vence" (Cobrança) — entre o mês (potencial-mensal) e
// os devedores: saldo agrupado por bairro cadastral, pro mesmo tributo/ano/mês exatos.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const codigos = (req.nextUrl.searchParams.get('codigos') ?? '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v))
  const anoVenc = Number(req.nextUrl.searchParams.get('anoVenc'))
  const mesVenc = Number(req.nextUrl.searchParams.get('mesVenc'))
  if (!codigos.length || !Number.isInteger(anoVenc) || !Number.isInteger(mesVenc) || mesVenc < 1 || mesVenc > 12) {
    return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 })
  }

  try {
    const itens = await devedoresPorBairroTributoMes(codigos, anoVenc, mesVenc)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
