import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { lerFiltros, contribuinteBase } from '@/lib/contribuinte-filtros'

const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    // Mesma fonte de dados do /api/contribuinte/kpis — garante que o total mostrado
    // aqui é sempre igual ao do KPI "Total Contribuintes" (antes cada rota calculava
    // por conta própria e podia divergir).
    const { totalAll: total, pfTot: pf, pjTot: pj, novosPorAno, cobranca } = await contribuinteBase()

    const anoMax = Math.max(...Array.from(novosPorAno.keys()), 0)
    const anoRef = f.ano || anoMax
    const novosRef = (novosPorAno.get(anoRef) ?? { t: 0 }).t
    const novosPrev = (novosPorAno.get(anoRef - 1) ?? { t: 0 }).t
    const varNovos = novosPrev ? ((novosRef - novosPrev) / novosPrev) * 100 : 0

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
