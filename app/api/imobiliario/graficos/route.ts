import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, FAIXA_CASE, FAIXAS_VENAL } from '@/lib/imobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_IPTU = /PREDIAL E TERRITORIAL URBANA/i
const RE_ITBI = /INTER VIVOS/i
// Abaixo deste valor o IPTU lançado é considerado não-confiável (alíquota não populada no exercício)
const LANC_MIN = 1_000_000

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [cadastro, receita] = await Promise.all([
      agentQuery(`
        SELECT no_exercicio_lancamento AS ano,
          COUNT(*) AS qt,
          SUM(vl_venal_imovel) AS venal,
          SUM(vl_venal_terreno) AS terreno,
          SUM(vl_venal_predio) AS predial,
          SUM(vl_venal_imovel * vl_aliquota) AS lancado
        FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
        WHERE no_exercicio_lancamento BETWEEN 2018 AND 2030
        GROUP BY no_exercicio_lancamento`, 50),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea,
          SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
    ])

    const cad = new Map<number, { qt: number; venal: number; terreno: number; predial: number; lancado: number }>()
    let anoMax = 0
    for (const r of cadastro.rows) {
      const ano = Number(r[0])
      if (!ano || ano < 1990) continue
      cad.set(ano, { qt: Number(r[1]) || 0, venal: Number(r[2]) || 0, terreno: Number(r[3]) || 0, predial: Number(r[4]) || 0, lancado: Number(r[5]) || 0 })
      if (ano > anoMax) anoMax = ano
    }

    const iptuArr = new Map<number, number>()
    const itbiArr = new Map<number, number>()
    for (const r of receita.rows) {
      const al = String(r[1] ?? ''), ano = Number(r[0]), v = Number(r[2]) || 0
      if (RE_IPTU.test(al)) iptuArr.set(ano, (iptuArr.get(ano) ?? 0) + v)
      else if (RE_ITBI.test(al)) itbiArr.set(ano, (itbiArr.get(ano) ?? 0) + v)
    }

    const anoAtual = f.ano || anoMax

    // Faixas de venal do exercício corrente (donut) — round-trip extra pois depende do ano resolvido
    const faixaRes = await agentQuery(`
      SELECT ${FAIXA_CASE} AS faixa, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
      WHERE no_exercicio_lancamento = ${anoAtual}
      GROUP BY ${FAIXA_CASE}`, 20)
    const faixaQt = new Map<number, number>()
    for (const r of faixaRes.rows) faixaQt.set(Number(r[0]), Number(r[1]) || 0)
    const faixas = FAIXAS_VENAL.map(fx => ({ id: fx.id, label: fx.label, qt: faixaQt.get(fx.id) ?? 0 }))

    // Linha — IPTU arrecadado por ano (histórico confiável). Últimos 6 anos com dado.
    const anosLinha = Array.from(iptuArr.keys()).filter(a => a <= anoAtual).sort((a, b) => a - b).slice(-6)
    const porAno = anosLinha.map(ano => ({ ano, arrecadado: iptuArr.get(ano) ?? 0 }))

    // Barras — Lançado × Arrecadado (só exercícios com lançado confiável)
    const lancVsArrec = Array.from(cad.entries())
      .filter(([ano, v]) => v.lancado >= LANC_MIN && ano <= anoAtual)
      .sort((a, b) => a[0] - b[0])
      .map(([ano, v]) => ({ ano, lancado: v.lancado, arrecadado: iptuArr.get(ano) ?? 0 }))

    // Composição do valor venal (terreno × predial) no exercício corrente
    const cAtual = cad.get(anoAtual) ?? { terreno: 0, predial: 0 }
    const venalComposicao = { terreno: cAtual.terreno, predial: cAtual.predial }

    // Tabela — exercícios (últimos 6)
    const anosTab = Array.from(cad.keys()).filter(a => a <= anoAtual).sort((a, b) => b - a).slice(0, 6)
    const exercicios = anosTab.map(ano => {
      const c = cad.get(ano)!
      const arr = iptuArr.get(ano) ?? 0
      const lancConfiavel = c.lancado >= LANC_MIN
      return {
        ano,
        qt: c.qt,
        venal: c.venal,
        lancado: lancConfiavel ? c.lancado : null,
        arrecadado: arr,
        pct: lancConfiavel && c.lancado ? (arr / c.lancado) * 100 : null,
      }
    })

    return NextResponse.json({ porAno, faixas, lancVsArrec, venalComposicao, exercicios, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
