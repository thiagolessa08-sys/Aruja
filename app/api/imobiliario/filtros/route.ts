import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const res = await agentQuery(`
      SELECT no_exercicio_lancamento AS ano, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
      WHERE no_exercicio_lancamento BETWEEN 2010 AND 2030
      GROUP BY no_exercicio_lancamento`, 50)
    const anos = res.rows
      .map(r => Number(r[0]))
      .filter(a => a >= 2010 && a <= 2030)
      .sort((a, b) => b - a)
    return NextResponse.json({ anos })
  } catch (e) {
    return NextResponse.json({ error: String(e), anos: [] }, { status: 200 })
  }
}
