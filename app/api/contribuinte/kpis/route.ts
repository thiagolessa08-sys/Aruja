import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros } from '@/lib/contribuinte-filtros'

const SCHEMA = 'pref_aruja_sp'

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

    const [sitRows, anoRows, devRows] = await Promise.all([
      agentQuery(`
        SELECT ds_sit_cadast AS sit, ic_pessoa AS p, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY ds_sit_cadast, ic_pessoa`, 200),
      agentQuery(`
        SELECT YEAR(dt_inscr) AS ano, ic_pessoa AS p, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY YEAR(dt_inscr), ic_pessoa`, 400),
      agentQuery(`
        SELECT ds_setor_devedor AS setor, COUNT(DISTINCT cd_contr) AS n
        FROM ${SCHEMA}.tb_dsod_devedor_contribuinte
        GROUP BY ds_setor_devedor`, 100),
    ])

    // Snapshot por tipo de pessoa e situação
    let totalAll = 0, pfTot = 0, pjTot = 0
    let ativosAll = 0, ativosF = 0, ativosJ = 0
    for (const r of sitRows.rows) {
      const sit = String(r[0] ?? '').trim()
      const p = String(r[1] ?? '').trim()
      const n = Number(r[2]) || 0
      totalAll += n
      if (p === 'F') pfTot += n
      if (p === 'J') pjTot += n
      if (sit === 'Ativo') {
        ativosAll += n
        if (p === 'F') ativosF += n
        if (p === 'J') ativosJ += n
      }
    }

    // Novos por ano (por tipo de pessoa)
    const novos = new Map<number, { f: number; j: number; t: number }>()
    for (const r of anoRows.rows) {
      const ano = Number(r[0])
      if (!(ano >= 2010 && ano <= 2030)) continue
      const p = String(r[1] ?? '').trim()
      const n = Number(r[2]) || 0
      const cur = novos.get(ano) ?? { f: 0, j: 0, t: 0 }
      if (p === 'F') cur.f += n
      if (p === 'J') cur.j += n
      cur.t += n
      novos.set(ano, cur)
    }
    const anoMax = Math.max(...Array.from(novos.keys()), 0)
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1
    const novA = novos.get(anoAtual) ?? { f: 0, j: 0, t: 0 }
    const novP = novos.get(anoAnt) ?? { f: 0, j: 0, t: 0 }
    const novAtual = f.pessoa === 'F' ? novA.f : f.pessoa === 'J' ? novA.j : novA.t
    const novPrev = f.pessoa === 'F' ? novP.f : f.pessoa === 'J' ? novP.j : novP.t

    // Cobrança acumulada (distinct contribuintes) — base-wide
    let cobranca = 0
    for (const r of devRows.rows) {
      if (String(r[0] ?? '').trim() === 'CobrancaAcumulada') cobranca = Number(r[1]) || 0
    }

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
