import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { lerFiltros, faixaWhere } from '@/lib/imobiliario-filtros'
import { bucketsIptu } from '@/lib/tributo-engine'

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

    // Todos os 6 buckets oficiais do IPTU (parcela_movimento). Não decomponíveis por faixa.
    const buckets = await bucketsIptu()
    const anos = Array.from(buckets.keys()).filter(a => a >= 2018 && a <= 2035).sort((a, b) => a - b)
    const anoMax = anos.length ? anos[anos.length - 1] : new Date().getFullYear()
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const z = { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
    const b = buckets.get(anoAtual) ?? z
    const bP = buckets.get(anoAnt) ?? z

    const pctDo = (v: number) => (b.lancado ? fmtPct1((v / b.lancado) * 100) : '0,0%')

    // Buckets monetários não são decomponíveis por faixa de venal → "—" com faixa ativa.
    const semFaixa = !faixaWhere(f.faixa)
    const branco = (label: string): Kpi => ({ label, value: '—', subLabel: 'não filtrável por faixa', subValue: '—', pct: '', dir: 'flat' })

    const kpis: Kpi[] = semFaixa ? [
      { label: 'Total Lançado', value: fmtMoney(b.lancado), subLabel: 'Ano Anterior', subValue: fmtMoney(bP.lancado), ...variacao(b.lancado, bP.lancado) },
      { label: 'Total Arrecadado', value: fmtMoney(b.arrecadado), subLabel: 'do lançado', subValue: pctDo(b.arrecadado), pct: pctDo(b.arrecadado), dir: (b.lancado && b.arrecadado / b.lancado >= 0.6 ? 'up' : 'down') },
      { label: 'Total Inadimplência', value: fmtMoney(b.inadimplente), subLabel: 'vencido · do lançado', subValue: pctDo(b.inadimplente), pct: pctDo(b.inadimplente), dir: 'down' },
      { label: 'Total em Aberto', value: fmtMoney(b.emAberto), subLabel: 'a receber · do lançado', subValue: pctDo(b.emAberto), pct: pctDo(b.emAberto), dir: 'flat' },
      { label: 'Total Isento', value: fmtMoney(b.isento), subLabel: 'do lançado', subValue: pctDo(b.isento), pct: pctDo(b.isento), dir: 'flat' },
      { label: 'Total Suspenso', value: fmtMoney(b.suspenso), subLabel: 'do lançado', subValue: pctDo(b.suspenso), pct: pctDo(b.suspenso), dir: 'flat' },
    ] : [
      branco('Total Lançado'), branco('Total Arrecadado'), branco('Total Inadimplência'),
      branco('Total em Aberto'), branco('Total Isento'), branco('Total Suspenso'),
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
