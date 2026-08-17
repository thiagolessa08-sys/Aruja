import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { potencialMensalTributo } from '@/lib/tributo-engine'

// Drill "quando vence" do ranking de Potencial de Arrecadação (Cobrança): saldo por mês de
// vencimento de um ou mais códigos de tributo.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const codigos = (req.nextUrl.searchParams.get('codigos') ?? '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v))
  if (!codigos.length) return NextResponse.json({ error: 'codigos inválido' }, { status: 400 })
  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : undefined

  try {
    const itens = await potencialMensalTributo(codigos, ano)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
