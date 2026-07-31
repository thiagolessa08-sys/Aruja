import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const SCHEMA = 'pref_aruja_sp'

interface MesPfPj { mes: number; pf: number; pj: number }

// Drill do gráfico "Novos Contribuintes por Ano": abre o exercício clicado por mês de
// inscrição (dt_inscr), mesma fonte (tb_dsod_contribuinte) do total anual.
async function novosPorMes(ano: number): Promise<MesPfPj[]> {
  return cached(`novosPorMes:${ano}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT MONTH(dt_inscr) AS m, ic_pessoa AS p, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_contribuinte
      WHERE YEAR(dt_inscr) = ${ano}
      GROUP BY MONTH(dt_inscr), ic_pessoa`, 30)
    const pf = new Map<number, number>(), pj = new Map<number, number>()
    for (const row of r.rows) {
      const m = Number(row[0]) || 0
      const p = String(row[1] ?? '').trim()
      const n = Number(row[2]) || 0
      if (m < 1 || m > 12) continue
      if (p === 'F') pf.set(m, n)
      if (p === 'J') pj.set(m, n)
    }
    const out: MesPfPj[] = []
    for (let m = 1; m <= 12; m++) out.push({ mes: m, pf: pf.get(m) ?? 0, pj: pj.get(m) ?? 0 })
    return out
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano'))
    if (!ano) return NextResponse.json({ error: 'ano inválido' }, { status: 400 })
    return NextResponse.json({ ano, serie: await novosPorMes(ano) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
