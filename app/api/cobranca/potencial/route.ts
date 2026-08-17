import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { potencialArrecadacao } from '@/lib/tributo-engine'

// "Potencial de Arrecadação" (Cobrança): split do saldo devedor em Vencido × A Vencer,
// por tributo analítico.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    const data = await potencialArrecadacao(ano, mes)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
