import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { damsPorTributoMes } from '@/lib/cobranca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mes = Number(req.nextUrl.searchParams.get('mes'))
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Parâmetro mes inválido (1-12)' }, { status: 400 })
  }

  try {
    const itens = await damsPorTributoMes(ano, mes)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
