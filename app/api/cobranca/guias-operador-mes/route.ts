import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { guiasOperadorMes } from '@/lib/cobranca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : 2025
  const mesRaw = req.nextUrl.searchParams.get('mes')
  const mes = Number(mesRaw)
  const nome = req.nextUrl.searchParams.get('nome')

  if (!mes || mes < 1 || mes > 12) return NextResponse.json({ error: 'mês inválido (1-12)' }, { status: 400 })
  if (!nome) return NextResponse.json({ error: 'parâmetro nome obrigatório' }, { status: 400 })

  try {
    const resultado = await guiasOperadorMes(ano, mes, nome)
    return NextResponse.json(resultado)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
