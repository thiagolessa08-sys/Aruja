import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const r = await agentQuery(`
      SELECT YEAR(dt_emissao) AS ano, COUNT(*) AS qt, SUM(vl_servicos) AS base, SUM(vl_imposto) AS iss
      FROM ${SCHEMA}.tb_dsod_nfse
      GROUP BY YEAR(dt_emissao)`, 100)

    const anos = r.rows
      .map(row => ({ ano: num(row[0]), qt: num(row[1]), base: num(row[2]), iss: num(row[3]) }))
      .filter(x => x.ano >= 2020 && x.ano <= 2026 && x.qt > 0)
      // descarta anos com valor médio por nota implausível (outlier de dado, ex.: 2021)
      .filter(x => x.base / x.qt < 50000)
      .sort((a, b) => a.ano - b.ano)

    return NextResponse.json({ anos })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
