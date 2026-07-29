import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoDivida, iptuDividaResumo, debitosPassiveisDivida, situacaoParcelas } from '@/lib/divida-engine'

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const [data, iptuDivida, debitosPassiveis, situacoes] = await Promise.all([
      resumoDivida(), iptuDividaResumo(), debitosPassiveisDivida(), situacaoParcelas(),
    ])
    return NextResponse.json({ ...data, iptuDivida, debitosPassiveis, situacoes })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
