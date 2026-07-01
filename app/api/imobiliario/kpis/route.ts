import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { lerFiltros, faixaWhere } from '@/lib/imobiliario-filtros'
import { serieTributo, saldoVencidoAberto } from '@/lib/tributo-engine'

interface Kpi {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  return (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
}
function fmtPct1(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}
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

    // Todos os KPIs vêm do motor de parcelas (cd_tributo IPTU). Não decomponíveis por faixa.
    const [serie, saldoVA] = await Promise.all([
      serieTributo('iptu'),
      saldoVencidoAberto('iptu'),
    ])

    const serieAno = new Map(serie.map(s => [s.ano, s]))
    const anoMax = serie.length ? serie[serie.length - 1].ano : new Date().getFullYear()
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const sA = serieAno.get(anoAtual), sP = serieAno.get(anoAnt)
    const lcA = sA?.lancado ?? 0, lcP = sP?.lancado ?? 0
    const arA = sA?.arrecadado ?? 0, arP = sP?.arrecadado ?? 0
    const isA = sA?.isencao ?? 0
    const suA = sA?.suspenso ?? 0

    const va = saldoVA.get(anoAtual) ?? { vencido: 0, aberto: 0 }
    const inadA = va.vencido   // saldo vencido = inadimplência
    const abertoA = va.aberto  // saldo a vencer = em aberto

    const pctDo = (v: number) => (lcA ? fmtPct1((v / lcA) * 100) : '0,0%')

    // Buckets monetários não são decomponíveis por faixa de venal → "—" com faixa ativa.
    const semFaixa = !faixaWhere(f.faixa)
    const branco = (label: string): Kpi => ({ label, value: '—', subLabel: 'não filtrável por faixa', subValue: '—', pct: '', dir: 'flat' })

    const kpis: Kpi[] = semFaixa ? [
      { label: 'Total Lançado', value: fmtMoney(lcA), subLabel: 'Ano Anterior', subValue: fmtMoney(lcP), ...variacao(lcA, lcP) },
      { label: 'Total Arrecadado', value: fmtMoney(arA), subLabel: 'Ano Anterior', subValue: fmtMoney(arP), ...variacao(arA, arP) },
      { label: 'Total Inadimplência', value: fmtMoney(inadA), subLabel: 'vencido · do lançado', subValue: pctDo(inadA), pct: pctDo(inadA), dir: 'down' },
      { label: 'Total em Aberto', value: fmtMoney(abertoA), subLabel: 'a vencer · do lançado', subValue: pctDo(abertoA), pct: pctDo(abertoA), dir: 'flat' },
      { label: 'Total Isento', value: fmtMoney(isA), subLabel: 'do lançado', subValue: pctDo(isA), pct: pctDo(isA), dir: 'flat' },
      { label: 'Total Suspenso', value: fmtMoney(suA), subLabel: 'do lançado', subValue: pctDo(suA), pct: pctDo(suA), dir: 'flat' },
    ] : [
      branco('Total Lançado'), branco('Total Arrecadado'), branco('Total Inadimplência'),
      branco('Total em Aberto'), branco('Total Isento'), branco('Total Suspenso'),
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
