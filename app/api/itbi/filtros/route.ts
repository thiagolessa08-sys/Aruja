import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { NATUREZAS } from '@/lib/itbi-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const naturezas = NATUREZAS.map(n => ({ id: n.id, label: n.label }))
  try {
    const res = await agentQuery(`
      SELECT YEAR(dt_transacao) AS ano, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_itbi
      GROUP BY YEAR(dt_transacao)`, 200)
    const anos = res.rows
      .map(r => Number(r[0]))
      .filter(a => a >= 2010 && a <= 2030)
      .sort((a, b) => b - a)
    return NextResponse.json({ anos, naturezas })
  } catch (e) {
    return NextResponse.json({ error: String(e), anos: [], naturezas }, { status: 200 })
  }
}
