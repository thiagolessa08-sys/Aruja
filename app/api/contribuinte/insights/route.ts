import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros } from '@/lib/contribuinte-filtros'

const SCHEMA = 'pref_aruja_sp'
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [pessoaRows, anoRows, devRows] = await Promise.all([
      agentQuery(`
        SELECT ic_pessoa AS p, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY ic_pessoa`, 50),
      agentQuery(`
        SELECT YEAR(dt_inscr) AS ano, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY YEAR(dt_inscr)`, 200),
      agentQuery(`
        SELECT ds_setor_devedor AS setor, COUNT(DISTINCT cd_contr) AS n
        FROM ${SCHEMA}.tb_dsod_devedor_contribuinte
        GROUP BY ds_setor_devedor`, 100),
    ])

    let pf = 0, pj = 0
    for (const r of pessoaRows.rows) {
      const p = String(r[0] ?? '').trim(), n = Number(r[1]) || 0
      if (p === 'F') pf += n
      if (p === 'J') pj += n
    }
    const total = pf + pj

    const anos = new Map<number, number>()
    for (const r of anoRows.rows) {
      const ano = Number(r[0])
      if (!(ano >= 2010 && ano <= 2030)) continue
      anos.set(ano, (anos.get(ano) ?? 0) + (Number(r[1]) || 0))
    }
    const anoMax = Math.max(...Array.from(anos.keys()), 0)
    const anoRef = f.ano || anoMax
    const novosRef = anos.get(anoRef) ?? 0
    const novosPrev = anos.get(anoRef - 1) ?? 0
    const varNovos = novosPrev ? ((novosRef - novosPrev) / novosPrev) * 100 : 0

    let cobranca = 0
    for (const r of devRows.rows) {
      if (String(r[0] ?? '').trim() === 'CobrancaAcumulada') cobranca = Number(r[1]) || 0
    }

    const insights = [
      `A base reúne ${fmtInt(total)} contribuintes — ${fmtInt(pf)} PF (${fmtPct(total ? pf / total * 100 : 0)}) e ${fmtInt(pj)} PJ (${fmtPct(total ? pj / total * 100 : 0)}).`,
      novosPrev
        ? `${fmtInt(novosRef)} novos cadastros em ${anoRef} (${varNovos >= 0 ? '+' : ''}${fmtPct(varNovos)} vs ${anoRef - 1}).`
        : `${fmtInt(novosRef)} novos cadastros em ${anoRef}.`,
      `${fmtInt(cobranca)} contribuintes (${fmtPct(total ? cobranca / total * 100 : 0)} da base) constam em cobrança acumulada.`,
    ]

    return NextResponse.json({ insights })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
