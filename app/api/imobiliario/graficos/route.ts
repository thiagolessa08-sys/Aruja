import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, FAIXA_CASE, FAIXAS_VENAL } from '@/lib/imobiliario-filtros'
import { bucketsIptu } from '@/lib/tributo-engine'

const SCHEMA = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [cadastro, serie] = await Promise.all([
      agentQuery(`
        SELECT no_exercicio_lancamento AS ano,
          COUNT(*) AS qt,
          SUM(vl_venal_imovel) AS venal,
          SUM(vl_venal_terreno) AS terreno,
          SUM(vl_venal_predio) AS predial
        FROM ${SCHEMA}.tb_dsod_imovel_urbano_lanc
        WHERE no_exercicio_lancamento BETWEEN 2018 AND 2030
        GROUP BY no_exercicio_lancamento`, 50),
      bucketsIptu(),
    ])

    const cad = new Map<number, { qt: number; venal: number; terreno: number; predial: number }>()
    let anoMax = 0
    for (const r of cadastro.rows) {
      const ano = Number(r[0])
      if (!ano || ano < 1990) continue
      cad.set(ano, { qt: Number(r[1]) || 0, venal: Number(r[2]) || 0, terreno: Number(r[3]) || 0, predial: Number(r[4]) || 0 })
      if (ano > anoMax) anoMax = ano
    }

    // Lançado/arrecadado OFICIAIS (Regras 1-2, parcela_movimento) por exercício.
    const eng = serie
    const iptuArr = new Map<number, number>(Array.from(serie.entries()).map(([ano, b]) => [ano, b.arrecadado]))
    const serieMax = serie.size ? Math.max(...serie.keys()) : 0
    anoMax = Math.max(anoMax, serieMax)

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

    // Linha — IPTU arrecadado por ano (motor). Últimos 6 anos com dado.
    const anosLinha = Array.from(iptuArr.keys()).filter(a => a <= anoAtual).sort((a, b) => a - b).slice(-6)
    const porAno = anosLinha.map(ano => ({ ano, arrecadado: iptuArr.get(ano) ?? 0 }))

    // Barras — Lançado × Arrecadado oficiais — últimos 3 exercícios
    const lancVsArrec = Array.from(serie.entries())
      .filter(([ano, b]) => ano <= anoAtual && b.lancado > 0)
      .sort((a, b) => a[0] - b[0])
      .slice(-3)
      .map(([ano, b]) => ({ ano, lancado: b.lancado, arrecadado: b.arrecadado }))

    // Composição do valor venal (terreno × predial) no exercício corrente
    const cAtual = cad.get(anoAtual) ?? { terreno: 0, predial: 0 }
    const venalComposicao = { terreno: cAtual.terreno, predial: cAtual.predial }

    // Tabela — exercícios (últimos 6): imóveis/venal do cadastro, lançado/arrec do motor
    const anosTab = Array.from(cad.keys()).filter(a => a <= anoAtual).sort((a, b) => b - a).slice(0, 6)
    const exercicios = anosTab.map(ano => {
      const c = cad.get(ano)!
      const s = eng.get(ano)
      const lanc = s?.lancado ?? null
      const arr = s?.arrecadado ?? 0
      return {
        ano,
        qt: c.qt,
        venal: c.venal,
        lancado: lanc,
        arrecadado: arr,
        pct: lanc && lanc > 0 ? (arr / lanc) * 100 : null,
      }
    })

    return NextResponse.json({ porAno, faixas, lancVsArrec, venalComposicao, exercicios, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
