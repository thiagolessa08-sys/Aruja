import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, FAIXA_CASE, FAIXAS_VENAL } from '@/lib/imobiliario-filtros'
import { bucketsIptu, qtdImoveisIptu, formaPagamentoIptu } from '@/lib/tributo-engine'

const SCHEMA = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [cadastro, serie, qtdImoveis, formaPagto] = await Promise.all([
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
      qtdImoveisIptu(),
      formaPagamentoIptu(),
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

    // Tabela oficial de exercícios — lançado/pago do motor, qtd imóveis da base oficial,
    // inadimplência % = (pago − lançado) / lançado, aumento de imóveis ano-a-ano.
    const anosAsc = Array.from(new Set([...serie.keys(), ...qtdImoveis.keys()]))
      .filter(a => a >= 2020 && a <= anoAtual)
      .sort((a, b) => a - b)
    const exercicios = anosAsc.map((ano, i) => {
      const b = serie.get(ano)
      const lancado = b?.lancado ?? 0
      const pago = b?.arrecadado ?? 0
      const imoveis = qtdImoveis.get(ano) ?? 0
      const imoveisAnt = i > 0 ? (qtdImoveis.get(anosAsc[i - 1]) ?? 0) : 0
      const aumQtd = i > 0 ? imoveis - imoveisAnt : null
      const aumPct = i > 0 && imoveisAnt ? ((imoveis - imoveisAnt) / imoveisAnt) * 100 : null
      return {
        ano,
        lancado,
        pago,
        inadPct: lancado > 0 ? ((pago - lancado) / lancado) * 100 : 0,
        imoveis,
        aumPct,
        aumQtd,
      }
    }).reverse() // exibe do mais recente para o mais antigo

    // Aumento total de imóveis no período (primeiro → último exercício)
    const anoIni = anosAsc[0], anoFim = anosAsc[anosAsc.length - 1]
    const qi = qtdImoveis.get(anoIni) ?? 0, qf = qtdImoveis.get(anoFim) ?? 0
    const aumentoPeriodo = { qtd: qf - qi, pct: qi ? ((qf - qi) / qi) * 100 : 0, imoveisFim: qf }

    // Imóveis por forma de pagamento (linhas = categorias, colunas = anos)
    const formaAnos = Array.from(formaPagto.keys()).filter(a => a >= 2020 && a <= anoAtual).sort((a, b) => a - b)
    const formaPagamento = {
      anos: formaAnos,
      linhas: [
        { forma: 'Cota única', cor: '#1fa463', v: formaAnos.map(a => formaPagto.get(a)?.cotaUnica ?? 0) },
        { forma: 'Parcelado', cor: '#283e93', v: formaAnos.map(a => formaPagto.get(a)?.parcelado ?? 0) },
        { forma: 'Pago Parcial', cor: '#e8962e', v: formaAnos.map(a => formaPagto.get(a)?.pagoParcial ?? 0) },
        { forma: 'Em aberto', cor: '#d64545', v: formaAnos.map(a => formaPagto.get(a)?.emAberto ?? 0) },
      ],
    }

    return NextResponse.json({ porAno, faixas, lancVsArrec, venalComposicao, exercicios, aumentoPeriodo, formaPagamento, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
