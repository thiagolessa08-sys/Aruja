import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resultadoMesPorSetor } from '@/lib/cobranca-engine'

// Drill "por setor" (Contribuinte/Imobiliário/Mobiliário) do "Resultado Mensal da
// Arrecadação" — ao clicar num mês, quebra Enviado (Geradas) x Pago daquele mês exato por
// setor de cobrança, em valor e em quantidade, mais o detalhamento por tributo.
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
    const dados = await resultadoMesPorSetor(ano, mes)
    return NextResponse.json(dados)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
