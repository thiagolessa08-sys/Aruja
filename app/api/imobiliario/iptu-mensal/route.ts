import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { serieMensalIptu, previsaoMensalIptu } from '@/lib/tributo-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || new Date().getFullYear()
    // previsao=1 → mês a mês PROJETADO (sazonalidade dos anos reais); senão, série real
    const previsao = req.nextUrl.searchParams.get('previsao') === '1'
    const mensal = previsao ? await previsaoMensalIptu(ano) : await serieMensalIptu(ano)
    return NextResponse.json({ ano, previsao, mensal })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
