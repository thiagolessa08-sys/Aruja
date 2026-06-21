import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

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
  const sinal = r > 0 ? '' : ''
  return { pct: sinal + r.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%', dir }
}

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const SCHEMA = 'pref_aruja_sp'

    const [receita, orcado, alteracao] = await Promise.all([
      agentQuery(`
        SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
          SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS liquida
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO, d.NO_MES`, 2000),
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ORC_APROV_LEI) AS loa
        FROM ${SCHEMA}.FATO_BIORC_ELABORACAO_ORCAMENTO f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO`, 100),
      agentQuery(`
        SELECT d.NO_ANO AS ano, SUM(f.VL_ALTERACAOORCAMENTARIA) AS alt
        FROM ${SCHEMA}.FATO_BIORC_ALTERACAO_ORCAMENTARIA_DESPESA f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO`, 100),
    ])

    // Mapas auxiliares
    const arrec = new Map<string, number>() // "ano-mes" -> liquida
    let anoAtual = 0
    let mesAtual = 0
    for (const r of receita.rows) {
      const ano = Number(r[0]); const mes = Number(r[1]); const v = Number(r[2]) || 0
      arrec.set(`${ano}-${mes}`, v)
      if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) { anoAtual = ano; mesAtual = mes }
    }
    const loa = new Map<number, number>()
    for (const r of orcado.rows) loa.set(Number(r[0]), Number(r[1]) || 0)
    const alt = new Map<number, number>()
    for (const r of alteracao.rows) alt.set(Number(r[0]), Number(r[1]) || 0)

    const anoAnt = anoAtual - 1
    const get = (ano: number, mes: number) => arrec.get(`${ano}-${mes}`) ?? 0
    const ytd = (ano: number, ateMes: number) => {
      let s = 0
      for (let m = 1; m <= ateMes; m++) s += get(ano, m)
      return s
    }
    // mês anterior (trata virada de ano)
    const mesAntMes = mesAtual > 1 ? mesAtual - 1 : 12
    const mesAntAno = mesAtual > 1 ? anoAtual : anoAtual - 1

    // Orçado e Orçado Atualizado
    const orcAtual = loa.get(anoAtual) ?? 0
    const orcAnt = loa.get(anoAnt) ?? 0
    const orcAtualizadoAtual = (loa.get(anoAtual) ?? 0) + (alt.get(anoAtual) ?? 0)
    const orcAtualizadoAnt = (loa.get(anoAnt) ?? 0) + (alt.get(anoAnt) ?? 0)

    // Arrecadação
    const arrecMes = get(anoAtual, mesAtual)
    const arrecMesAnt = get(anoAnt, mesAtual)
    const arrecYtd = ytd(anoAtual, mesAtual)
    const arrecYtdAnt = ytd(anoAnt, mesAtual)
    const arrecMesAnterior = get(mesAntAno, mesAntMes)
    const arrecMesAnteriorAnt = get(mesAntAno - 1, mesAntMes)

    const kpis: Kpi[] = [
      { label: 'Orçado', value: fmtMi(orcAtual), subLabel: 'Ano Anterior', subValue: fmtMi(orcAnt), ...variacao(orcAtual, orcAnt) },
      { label: 'Orçado Atualizado', value: fmtMi(orcAtualizadoAtual), subLabel: 'Ano Anterior', subValue: fmtMi(orcAtualizadoAnt), ...variacao(orcAtualizadoAtual, orcAtualizadoAnt) },
      { label: 'Arrecadação Mês', value: fmtMi(arrecMes), subLabel: `${MESES[mesAtual]}/${String(anoAnt).slice(2)}`, subValue: fmtMi(arrecMesAnt), ...variacao(arrecMes, arrecMesAnt) },
      { label: 'Arrecadação Até o Mês', value: fmtMi(arrecYtd), subLabel: 'Ano Anterior', subValue: fmtMi(arrecYtdAnt), ...variacao(arrecYtd, arrecYtdAnt) },
      { label: 'Arrecadação Mês Anterior', value: fmtMi(arrecMesAnterior), subLabel: `${MESES[mesAntMes]}/${String(mesAntAno - 1).slice(2)}`, subValue: fmtMi(arrecMesAnteriorAnt), ...variacao(arrecMesAnterior, arrecMesAnteriorAnt) },
    ]

    return NextResponse.json({ kpis, referencia: { ano: anoAtual, mes: mesAtual, mesNome: MESES[mesAtual] } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
