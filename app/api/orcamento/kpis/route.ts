import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereImpostoTaxa, WHERE_RECEITA_OFICIAL } from '@/lib/receita-filtros'

const SCHEMA = 'pref_aruja_sp'
const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

interface Kpi {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

function fmtMi(v: number): string {
  return (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
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

    const [receita, orcado, alteracao] = await Promise.all([
      agentQuery(`
        SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
          SUM(f.VL_ARRECADACAO_RECEITA) AS liquida
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE 1=1${WHERE_RECEITA_OFICIAL}${whereImpostoTaxa(f)}
        GROUP BY d.NO_ANO, d.NO_MES`, 5000),
      // Orçado = PREVISÃO DE RECEITA na LOA (lado receita, filtro oficial Ronaldo)
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_PREVISAO_RECEITA_LOA) AS loa
        FROM ${SCHEMA}.FATO_BIORC_ELABORACAO_PREVISAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE 1=1${WHERE_RECEITA_OFICIAL}${whereImpostoTaxa(f)}
        GROUP BY d.NO_ANO`, 100),
      // Alteração da previsão de receita (lado receita; sem coluna de tipo, filtra ficha/categoria/ano)
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ALTERACAOORCAMENTARIA) AS alt
        FROM ${SCHEMA}.FATO_BIORC_ALTERACAO_ORCAMENTARIA_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE f.CD_FICHA_RECEITA < 5000 AND nr.CD_CATEGORIA_ECONOMICA_RECEITA NOT IN ('-1','-3') AND d.NO_ANO >= 2023${whereImpostoTaxa(f)}
        GROUP BY d.NO_ANO`, 100),
    ])

    // Arrecadação por ano-mês (natureza já filtrada no SQL)
    const arrec = new Map<string, number>()
    const mesesPorAno = new Map<number, number>()
    let anoMax = 0
    for (const r of receita.rows) {
      const ano = Number(r[0]), mes = Number(r[1]), v = Number(r[2]) || 0
      arrec.set(`${ano}-${mes}`, (arrec.get(`${ano}-${mes}`) ?? 0) + v)
      mesesPorAno.set(ano, Math.max(mesesPorAno.get(ano) ?? 0, mes))
      if (ano > anoMax) anoMax = ano
    }

    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1
    const mesAtual = f.mes || mesesPorAno.get(anoAtual) || 12

    const get = (ano: number, mes: number) => arrec.get(`${ano}-${mes}`) ?? 0
    const ytd = (ano: number, ateMes: number) => { let s = 0; for (let m = 1; m <= ateMes; m++) s += get(ano, m); return s }
    const mesAntMes = mesAtual > 1 ? mesAtual - 1 : 12
    const mesAntAno = mesAtual > 1 ? anoAtual : anoAtual - 1

    const loa = new Map<number, number>()
    for (const r of orcado.rows) loa.set(Number(r[0]), Number(r[1]) || 0)
    const alt = new Map<number, number>()
    for (const r of alteracao.rows) alt.set(Number(r[0]), Number(r[1]) || 0)

    const orcAtual = loa.get(anoAtual) ?? 0
    const orcAnt = loa.get(anoAnt) ?? 0
    const orcAtualizadoAtual = (loa.get(anoAtual) ?? 0) + (alt.get(anoAtual) ?? 0)
    const orcAtualizadoAnt = (loa.get(anoAnt) ?? 0) + (alt.get(anoAnt) ?? 0)

    const arrecMes = get(anoAtual, mesAtual)
    const arrecMesAnt = get(anoAnt, mesAtual)
    const arrecYtd = ytd(anoAtual, mesAtual)
    const arrecYtdAnt = ytd(anoAnt, mesAtual)
    const arrecMesAnterior = get(mesAntAno, mesAntMes)

    const kpis: Kpi[] = [
      { label: 'Orçado', value: fmtMi(orcAtual), subLabel: 'Ano Anterior', subValue: fmtMi(orcAnt), ...variacao(orcAtual, orcAnt) },
      { label: 'Orçado Atualizado', value: fmtMi(orcAtualizadoAtual), subLabel: 'Ano Anterior', subValue: fmtMi(orcAtualizadoAnt), ...variacao(orcAtualizadoAtual, orcAtualizadoAnt) },
      { label: 'Arrecadação Mês', value: fmtMi(arrecMes), subLabel: `${MESES[mesAtual]}/${String(anoAnt).slice(2)}`, subValue: fmtMi(arrecMesAnt), ...variacao(arrecMes, arrecMesAnt) },
      { label: 'Arrecadação Até o Mês', value: fmtMi(arrecYtd), subLabel: 'Ano Anterior', subValue: fmtMi(arrecYtdAnt), ...variacao(arrecYtd, arrecYtdAnt) },
      // "Mês Anterior" agora compara com o MÊS ATUAL (não com o mesmo mês do ano passado)
      { label: 'Arrecadação Mês Anterior', value: fmtMi(arrecMesAnterior), subLabel: `${MESES[mesAtual]}/${String(anoAtual).slice(2)}`, subValue: fmtMi(arrecMes), ...variacao(arrecMes, arrecMesAnterior) },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual, mes: mesAtual, mesNome: MESES[mesAtual] } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
