import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, faixaWhere } from '@/lib/imobiliario-filtros'
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

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  return (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
}
function fmtInt(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
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
    const fw = faixaWhere(f.faixa)

    const [cadastro, serie] = await Promise.all([
      // Cadastro de IPTU por exercício (imóveis + valor venal — filtrável por faixa).
      agentQuery(`
        SELECT no_exercicio_lancamento AS ano,
          COUNT(*) AS qt,
          SUM(vl_venal_imovel) AS venal
        FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
        WHERE no_exercicio_lancamento BETWEEN 2018 AND 2030${fw}
        GROUP BY no_exercicio_lancamento`, 50),
      // Lançado/arrecadado/inadimplência REAIS pelo motor de parcelas (cd_tributo IPTU).
      serieTributo('iptu'),
    ])

    const qt = new Map<number, number>()
    const venal = new Map<number, number>()
    let anoMax = 0
    for (const r of cadastro.rows) {
      const ano = Number(r[0])
      if (!ano || ano < 1990) continue
      qt.set(ano, Number(r[1]) || 0)
      venal.set(ano, Number(r[2]) || 0)
      if (ano > anoMax) anoMax = ano
    }

    const serieAno = new Map(serie.map(s => [s.ano, s]))
    const serieMax = serie.length ? serie[serie.length - 1].ano : 0
    anoMax = Math.max(anoMax, serieMax)

    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const qtA = qt.get(anoAtual) ?? 0, qtP = qt.get(anoAnt) ?? 0
    const vnA = venal.get(anoAtual) ?? 0, vnP = venal.get(anoAnt) ?? 0
    const sA = serieAno.get(anoAtual), sP = serieAno.get(anoAnt)
    const lcA = sA?.lancado ?? 0, lcP = sP?.lancado ?? 0
    const arA = sA?.arrecadado ?? 0, arP = sP?.arrecadado ?? 0
    const inA = sA?.saldo ?? 0
    const pctInad = lcA ? (inA / lcA) * 100 : 0

    // Lançado/arrecadado/inadimplência vêm do motor de parcelas — não decomponíveis por
    // faixa de venal. Com filtro de faixa ativo, exibimos "—".
    const semFaixa = !faixaWhere(f.faixa)
    const branco = { value: '—', subLabel: 'não filtrável por faixa', subValue: '—', pct: '', dir: 'flat' as const }

    const kpis: Kpi[] = [
      { label: 'Imóveis Lançados', value: fmtInt(qtA), subLabel: 'Ano Anterior', subValue: fmtInt(qtP), ...variacao(qtA, qtP) },
      { label: 'Valor Venal Total', value: fmtMoney(vnA), subLabel: 'Ano Anterior', subValue: fmtMoney(vnP), ...variacao(vnA, vnP) },
      semFaixa
        ? { label: 'IPTU Lançado', value: fmtMoney(lcA), subLabel: 'Ano Anterior', subValue: fmtMoney(lcP), ...variacao(lcA, lcP) }
        : { label: 'IPTU Lançado', ...branco },
      semFaixa
        ? { label: 'IPTU Arrecadado', value: fmtMoney(arA), subLabel: 'Ano Anterior', subValue: fmtMoney(arP), ...variacao(arA, arP) }
        : { label: 'IPTU Arrecadado', ...branco },
      semFaixa
        ? { label: 'Inadimplência', value: fmtMoney(inA), subLabel: 'do Lançado', subValue: fmtPct1(pctInad), pct: fmtPct1(pctInad), dir: 'down' }
        : { label: 'Inadimplência', ...branco },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
