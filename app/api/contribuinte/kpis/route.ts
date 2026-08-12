import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { lerFiltros, contribuinteBase } from '@/lib/contribuinte-filtros'

interface Kpi {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

function variacao(atual: number, anterior: number): { pct: string; dir: 'up' | 'down' | 'flat' } {
  if (!anterior) return { pct: '0,00%', dir: 'flat' }
  const r = ((atual - anterior) / Math.abs(anterior)) * 100
  const dir = r > 0.005 ? 'up' : r < -0.005 ? 'down' : 'flat'
  return { pct: r.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%', dir }
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const semP = !f.pessoa

    const { totalAll, pfTot, pjTot, ativosAll, ativosF, ativosJ, novosPorAno, cobranca } = await contribuinteBase()

    const anoMax = Math.max(...Array.from(novosPorAno.keys()), 0)
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1
    const novA = novosPorAno.get(anoAtual) ?? { f: 0, j: 0, t: 0 }
    const novP = novosPorAno.get(anoAnt) ?? { f: 0, j: 0, t: 0 }
    const novAtual = f.pessoa === 'F' ? novA.f : f.pessoa === 'J' ? novA.j : novA.t
    const novPrev = f.pessoa === 'F' ? novP.f : f.pessoa === 'J' ? novP.j : novP.t

    const totalKpi = semP ? totalAll : f.pessoa === 'F' ? pfTot : pjTot
    const ativosKpi = semP ? ativosAll : f.pessoa === 'F' ? ativosF : ativosJ
    const pctAtivos = totalKpi ? (ativosKpi / totalKpi) * 100 : 0
    const pctPf = totalAll ? (pfTot / totalAll) * 100 : 0
    const pctPj = totalAll ? (pjTot / totalAll) * 100 : 0
    const pctCobr = totalAll ? (cobranca / totalAll) * 100 : 0

    const labelTotal = semP ? 'Total Contribuintes' : f.pessoa === 'F' ? 'Total Pessoa Física' : 'Total Pessoa Jurídica'

    const kpis: Kpi[] = [
      { label: labelTotal, value: fmtInt(totalKpi), subLabel: `Novos ${anoAtual}`, subValue: fmtInt(novAtual), ...variacao(novAtual, novPrev) },
      { label: 'Pessoa Física', value: fmtInt(pfTot), subLabel: 'da base', subValue: fmtPct1(pctPf), pct: fmtPct1(pctPf), dir: pctPf >= 50 ? 'up' : 'down' },
      { label: 'Pessoa Jurídica', value: fmtInt(pjTot), subLabel: 'da base', subValue: fmtPct1(pctPj), pct: fmtPct1(pctPj), dir: 'flat' },
      { label: 'Cadastros Ativos', value: fmtInt(ativosKpi), subLabel: 'do total', subValue: fmtPct1(pctAtivos), pct: fmtPct1(pctAtivos), dir: pctAtivos >= 90 ? 'up' : 'down' },
      semP
        ? { label: 'Em Cobrança', value: fmtInt(cobranca), subLabel: 'da base', subValue: fmtPct1(pctCobr), pct: fmtPct1(pctCobr), dir: 'down' }
        : { label: 'Em Cobrança', value: '—', subLabel: 'não filtrável por pessoa', subValue: '—', pct: '', dir: 'flat' },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
