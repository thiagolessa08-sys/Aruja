import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoCobranca } from '@/lib/cobranca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    const data = await resumoCobranca(ano, mes)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
