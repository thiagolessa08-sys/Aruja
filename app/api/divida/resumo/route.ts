import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoDivida, iptuDividaResumo, debitosPassiveisDivida } from '@/lib/divida-engine'

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const [data, iptuDivida, debitosPassiveis] = await Promise.all([resumoDivida(), iptuDividaResumo(), debitosPassiveisDivida()])
    return NextResponse.json({ ...data, iptuDivida, debitosPassiveis })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
