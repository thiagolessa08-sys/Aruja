import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, faixaWhere } from '@/lib/imobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'

interface Kpi {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

const RE_IPTU = /PREDIAL E TERRITORIAL URBANA/i

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

    const [cadastro, receita] = await Promise.all([
      // Cadastro de IPTU por exercício (lançamento). Lançado estimado = venal × alíquota.
      agentQuery(`
        SELECT no_exercicio_lancamento AS ano,
          COUNT(*) AS qt,
          SUM(vl_venal_imovel) AS venal,
          SUM(vl_venal_imovel * vl_aliquota) AS lancado
        FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
        WHERE no_exercicio_lancamento BETWEEN 2018 AND 2030${fw}
        GROUP BY no_exercicio_lancamento`, 50),
      // IPTU arrecadado por ano (receita). Filtra a alínea no JS.
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea,
          SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
    ])

    const qt = new Map<number, number>()
    const venal = new Map<number, number>()
    const lancado = new Map<number, number>()
    let anoMax = 0
    for (const r of cadastro.rows) {
      const ano = Number(r[0])
      if (!ano || ano < 1990) continue
      qt.set(ano, Number(r[1]) || 0)
      venal.set(ano, Number(r[2]) || 0)
      lancado.set(ano, Number(r[3]) || 0)
      if (ano > anoMax) anoMax = ano
    }

    const iptuArr = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_IPTU.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0])
      iptuArr.set(ano, (iptuArr.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const qtA = qt.get(anoAtual) ?? 0, qtP = qt.get(anoAnt) ?? 0
    const vnA = venal.get(anoAtual) ?? 0, vnP = venal.get(anoAnt) ?? 0
    const lcA = lancado.get(anoAtual) ?? 0, lcP = lancado.get(anoAnt) ?? 0
    const arA = iptuArr.get(anoAtual) ?? 0, arP = iptuArr.get(anoAnt) ?? 0
    const pctA = lcA ? (arA / lcA) * 100 : 0
    const pctP = lcP ? (arP / lcP) * 100 : 0

    // A receita (IPTU arrecadado) não é decomponível por faixa de venal — com filtro de
    // faixa ativo, os KPIs de arrecadação ficariam inconsistentes, então exibimos "—".
    const semFaixa = !faixaWhere(f.faixa)
    const branco = { value: '—', subLabel: 'não filtrável por faixa', subValue: '—', pct: '', dir: 'flat' as const }

    const kpis: Kpi[] = [
      { label: 'Imóveis Lançados', value: fmtInt(qtA), subLabel: 'Ano Anterior', subValue: fmtInt(qtP), ...variacao(qtA, qtP) },
      { label: 'Valor Venal Total', value: fmtMoney(vnA), subLabel: 'Ano Anterior', subValue: fmtMoney(vnP), ...variacao(vnA, vnP) },
      { label: 'IPTU Lançado (est.)', value: fmtMoney(lcA), subLabel: 'Ano Anterior', subValue: fmtMoney(lcP), ...variacao(lcA, lcP) },
      semFaixa
        ? { label: 'IPTU Arrecadado', value: fmtMoney(arA), subLabel: 'Ano Anterior', subValue: fmtMoney(arP), ...variacao(arA, arP) }
        : { label: 'IPTU Arrecadado', ...branco },
      semFaixa
        ? { label: 'Arrecadação IPTU', value: fmtPct1(pctA), subLabel: 'do Lançado', subValue: fmtMoney(lcA), ...variacao(pctA, pctP) }
        : { label: 'Arrecadação IPTU', ...branco },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
