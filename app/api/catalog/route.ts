import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCatalog } from '@/lib/catalog-cache'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const catalog = getCatalog()
  if (!catalog) {
    return NextResponse.json({ catalog: null, message: 'Catálogo não gerado ainda.' })
  }

  return NextResponse.json({ catalog })
}
