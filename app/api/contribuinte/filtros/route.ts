import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { PESSOAS } from '@/lib/contribuinte-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const r = await agentQuery(
      `SELECT YEAR(dt_inscr) AS ano, COUNT(*) AS n
       FROM ${SCHEMA}.tb_dsod_contribuinte
       GROUP BY YEAR(dt_inscr)`,
      200
    )
    const anos = r.rows
      .map(row => Number(row[0]))
      .filter(a => a >= 2010 && a <= 2030)
      .sort((a, b) => b - a)

    return NextResponse.json({ anos, pessoas: PESSOAS })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
