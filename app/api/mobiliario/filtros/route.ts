import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { SITUACOES } from '@/lib/mobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const res = await agentQuery(`
      SELECT YEAR(dt_inicio_atividade) AS ano, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
      GROUP BY YEAR(dt_inicio_atividade)`, 200)
    const anos = res.rows
      .map(r => Number(r[0]))
      .filter(a => a >= 2010 && a <= 2030)
      .sort((a, b) => b - a)
    return NextResponse.json({ anos, situacoes: SITUACOES })
  } catch (e) {
    return NextResponse.json({ error: String(e), anos: [], situacoes: SITUACOES }, { status: 200 })
  }
}
