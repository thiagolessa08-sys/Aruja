import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, classificaNatureza } from '@/lib/itbi-filtros'
import { serieTributo } from '@/lib/tributo-engine'

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
const fmtMoney = (v: number) =>
  Math.abs(v) >= 1e9
    ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
    : Math.abs(v) >= 1e6
      ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
      : 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil'
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
    const semNat = !f.natureza
    const matchNat = (nat: string) => semNat || classificaNatureza(nat) === f.natureza

    const [itbi, serie] = await Promise.all([
      agentQuery(`
        SELECT YEAR(dt_transacao) AS ano, ds_natureza_transacao AS nat, COUNT(*) AS n,
          SUM(vl_venal) AS venal, SUM(vl_parte_financiada) AS fin, SUM(vl_parte_nao_financiada) AS naofin
        FROM ${SCHEMA}.tb_dsod_itbi
        GROUP BY YEAR(dt_transacao), ds_natureza_transacao`, 3000),
      // Arrecadado/inadimplência REAIS pelo motor de parcelas (cd_tributo ITBI).
      serieTributo('itbi'),
    ])

    const trans = new Map<number, number>()
    const venal = new Map<number, number>()
    const fin = new Map<number, number>()
    const naofin = new Map<number, number>()
    for (const r of itbi.rows) {
      const ano = Number(r[0]); if (ano < 2000 || ano > 2030) continue
      if (!matchNat(String(r[1] ?? ''))) continue
      trans.set(ano, (trans.get(ano) ?? 0) + (Number(r[2]) || 0))
      venal.set(ano, (venal.get(ano) ?? 0) + (Number(r[3]) || 0))
      fin.set(ano, (fin.get(ano) ?? 0) + (Number(r[4]) || 0))
      naofin.set(ano, (naofin.get(ano) ?? 0) + (Number(r[5]) || 0))
    }

    const arr = new Map<number, number>(serie.map(s => [s.ano, s.arrecadado]))
    const inad = new Map<number, number>(serie.map(s => [s.ano, s.saldo]))
    const serieMax = serie.length ? serie[serie.length - 1].ano : 0

    const anoMax = Math.max(...Array.from(trans.keys()), serieMax, 0)
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const tA = trans.get(anoAtual) ?? 0, tP = trans.get(anoAnt) ?? 0
    const vA = venal.get(anoAtual) ?? 0, vP = venal.get(anoAnt) ?? 0
    const arA = arr.get(anoAtual) ?? 0, arP = arr.get(anoAnt) ?? 0
    const inA = inad.get(anoAtual) ?? 0, inP = inad.get(anoAnt) ?? 0
    const ticketA = tA ? vA / tA : 0, ticketP = tP ? vP / tP : 0

    const kpis: Kpi[] = [
      semNat
        ? { label: 'ITBI Arrecadado', value: fmtMoney(arA), subLabel: 'Ano Anterior', subValue: fmtMoney(arP), ...variacao(arA, arP) }
        : { label: 'ITBI Arrecadado', value: '—', subLabel: 'não filtrável por natureza', subValue: '—', pct: '', dir: 'flat' },
      { label: 'Transmissões', value: fmtInt(tA), subLabel: 'Ano Anterior', subValue: fmtInt(tP), ...variacao(tA, tP) },
      { label: 'Valor Movimentado', value: fmtMoney(vA), subLabel: 'Ano Anterior', subValue: fmtMoney(vP), ...variacao(vA, vP) },
      { label: 'Ticket Médio', value: fmtMoney(ticketA), subLabel: 'Ano Anterior', subValue: fmtMoney(ticketP), ...variacao(ticketA, ticketP) },
      semNat
        ? { label: 'Inadimplência', value: fmtMoney(inA), subLabel: 'Ano Anterior', subValue: fmtMoney(inP), ...variacao(inA, inP) }
        : { label: 'Inadimplência', value: '—', subLabel: 'não filtrável por natureza', subValue: '—', pct: '', dir: 'flat' },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
