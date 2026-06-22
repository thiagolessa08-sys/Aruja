import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'
const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Cache curto em memória (dados mudam no máximo diariamente)
let cache: { data: unknown; at: number } | null = null
const TTL = 30 * 60 * 1000 // 30 min

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.data)
  }

  try {
    const [mensalR, previstoR, categoriaR] = await Promise.all([
      agentQuery(`
        SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
          SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS liq
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO, d.NO_MES`, 3000),
      agentQuery(`
        SELECT d.NO_ANO AS ano,
          SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_PREVISAO_RECEITA_LOA ELSE 0 END) AS loa
        FROM ${SCHEMA}.FATO_BIORC_ELABORACAO_PREVISAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO`, 100),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_CATEGORIA_ECONOMICA_RECEITA AS cat,
          SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS liq
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO, nr.DS_CATEGORIA_ECONOMICA_RECEITA`, 200),
    ])

    // --- Arrecadação mensal ---
    const arrec = new Map<string, number>()
    const anos = new Set<number>()
    const mesMaxPorAno = new Map<number, number>()
    let anoAtual = 0, mesAtual = 0
    for (const r of mensalR.rows) {
      const ano = Number(r[0]), mes = Number(r[1]), v = Number(r[2]) || 0
      arrec.set(`${ano}-${mes}`, v)
      anos.add(ano)
      mesMaxPorAno.set(ano, Math.max(mesMaxPorAno.get(ano) ?? 0, mes))
      if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) { anoAtual = ano; mesAtual = mes }
    }
    const get = (ano: number, mes: number) => arrec.get(`${ano}-${mes}`) ?? 0
    const anoAnt = anoAtual - 1

    // Anos "fechados" (têm mês 12)
    const anosFull = [...anos].filter(a => (mesMaxPorAno.get(a) ?? 0) >= 12).sort((a, b) => a - b)
    const latestFull = anosFull.length ? anosFull[anosFull.length - 1] : anoAtual

    const loa = new Map<number, number>()
    for (const r of previstoR.rows) loa.set(Number(r[0]), Number(r[1]) || 0)

    // 1) Arrecadação por Ano (4 últimos anos fechados) — arrecadado x previsto
    const anosAno = [latestFull - 3, latestFull - 2, latestFull - 1, latestFull]
    const porAno = anosAno.map(ano => {
      let arrecadado = 0
      for (let m = 1; m <= 12; m++) arrecadado += get(ano, m)
      return { ano, arrecadado, previsto: loa.get(ano) ?? 0 }
    })

    // 2) Arrecadação por Mês (ano atual x anterior)
    const porMes = []
    for (let m = 1; m <= 12; m++) {
      const ant = get(anoAnt, m), atu = get(anoAtual, m)
      const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
      porMes.push({ mes: m, nome: MESES[m], anoAnterior: ant, anoAtual: atu, pct })
    }

    // 3) Categoria econômica (ano atual)
    let correntes = 0, capital = 0
    for (const r of categoriaR.rows) {
      if (Number(r[0]) !== anoAtual) continue
      const cat = String(r[1]).trim().toUpperCase(); const v = Number(r[2]) || 0
      if (cat.includes('CORRENTE')) correntes += v
      else if (cat.includes('CAPITAL')) capital += v
    }

    // 4) Dívida Ativa por espécie (ano atual)
    const dividaR = await agentQuery(`
      SELECT nr.DS_ESPECIE_RECEITA AS esp, nr.DS_TIPO_RECEITA AS tipo,
        SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS liq
      FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
      JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
      JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
      WHERE d.NO_ANO = ${anoAtual}
      GROUP BY nr.DS_ESPECIE_RECEITA, nr.DS_TIPO_RECEITA`, 300)
    let daImpostos = 0, daTaxas = 0, daDemais = 0
    for (const r of dividaR.rows) {
      const esp = String(r[0]).trim().toUpperCase()
      const tipo = String(r[1]).toUpperCase()
      if (!tipo.includes('VIDA ATIVA')) continue
      const v = Number(r[2]) || 0
      if (esp === 'IMPOSTOS') daImpostos += v
      else if (esp === 'TAXAS') daTaxas += v
      else daDemais += v
    }
    const dividaAtiva = { total: daImpostos + daTaxas + daDemais, impostos: daImpostos, taxas: daTaxas, demais: daDemais }

    // 5) Histórico mensal (4 últimos anos presentes)
    const anosHist = [...anos].sort((a, b) => a - b).slice(-4)
    const historico = {
      anos: anosHist,
      linhas: Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i + 1],
        vals: anosHist.map(a => get(a, i + 1)),
      })),
    }

    const data = {
      porAno, porMes, categoria: { correntes, capital }, dividaAtiva, historico,
      ref: { anoAtual, mesAtual, mesNome: MESES[mesAtual], anoAnt, latestFull },
    }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
