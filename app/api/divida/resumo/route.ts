import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resumoDivida, iptuDividaResumo } from '@/lib/divida-engine'

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const [data, iptuDivida] = await Promise.all([resumoDivida(), iptuDividaResumo()])
    return NextResponse.json({ ...data, iptuDivida })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
