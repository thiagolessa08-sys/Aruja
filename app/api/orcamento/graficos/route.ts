import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereMes, WHERE_RECEITA_OFICIAL, ANO_MIN_RECEITA } from '@/lib/receita-filtros'

const SCHEMA = 'pref_aruja_sp'
const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [mensalR, previstoR, categoriaR] = await Promise.all([
      agentQuery(`
        SELECT d.NO_ANO AS ano, d.NO_MES AS mes, nr.DS_ESPECIE_RECEITA AS esp,
          SUM(f.VL_ARRECADACAO_RECEITA) AS liq
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE 1=1${WHERE_RECEITA_OFICIAL}
        GROUP BY d.NO_ANO, d.NO_MES, nr.DS_ESPECIE_RECEITA`, 5000),
      agentQuery(`
        SELECT d.NO_ANO AS ano,
          SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_PREVISAO_RECEITA_LOA ELSE 0 END) AS loa
        FROM ${SCHEMA}.FATO_BIORC_ELABORACAO_PREVISAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        GROUP BY d.NO_ANO`, 100),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_CATEGORIA_ECONOMICA_RECEITA AS cat, nr.DS_ESPECIE_RECEITA AS esp,
          SUM(f.VL_ARRECADACAO_RECEITA) AS liq
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE 1=1${WHERE_RECEITA_OFICIAL}${whereMes(f)}
        GROUP BY d.NO_ANO, nr.DS_CATEGORIA_ECONOMICA_RECEITA, nr.DS_ESPECIE_RECEITA`, 800),
    ])

    // Arrecadação por ano-mês (espécie filtrada em JS)
    const arrec = new Map<string, number>()
    const anos = new Set<number>()
    const mesMaxPorAno = new Map<number, number>()
    let anoMax = 0
    for (const r of mensalR.rows) {
      const esp = String(r[2] ?? '').trim()
      if (f.especie && esp !== f.especie) continue
      const ano = Number(r[0]), mes = Number(r[1]), v = Number(r[3]) || 0
      arrec.set(`${ano}-${mes}`, (arrec.get(`${ano}-${mes}`) ?? 0) + v)
      anos.add(ano)
      mesMaxPorAno.set(ano, Math.max(mesMaxPorAno.get(ano) ?? 0, mes))
      if (ano > anoMax) anoMax = ano
    }
    const get = (ano: number, mes: number) => arrec.get(`${ano}-${mes}`) ?? 0

    const anosFull = [...anos].filter(a => (mesMaxPorAno.get(a) ?? 0) >= 12).sort((a, b) => a - b)
    const latestFull = anosFull.length ? anosFull[anosFull.length - 1] : anoMax
    const fimAno = f.ano || latestFull
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const loa = new Map<number, number>()
    for (const r of previstoR.rows) loa.set(Number(r[0]), Number(r[1]) || 0)

    // 1) Arrecadação por Ano (até 4 anos terminando no ano selecionado, mín. 2023 — regra Ronaldo)
    const anoIniPorAno = Math.max(fimAno - 3, ANO_MIN_RECEITA)
    const anosPorAno: number[] = []
    for (let a = anoIniPorAno; a <= fimAno; a++) anosPorAno.push(a)
    const porAno = anosPorAno.map(ano => {
      let arrecadado = 0
      for (let m = 1; m <= 12; m++) arrecadado += get(ano, m)
      return { ano, arrecadado, previsto: loa.get(ano) ?? 0 }
    })

    // 2) Arrecadação por Mês (ano selecionado x anterior)
    const porMes = []
    for (let m = 1; m <= 12; m++) {
      const ant = get(anoAnt, m), atu = get(anoAtual, m)
      const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
      porMes.push({ mes: m, nome: MESES[m], anoAnterior: ant, anoAtual: atu, pct })
    }

    // 3) Categoria econômica (ano selecionado/mês/espécie) — filtra ano e espécie em JS
    let correntes = 0, capital = 0
    for (const r of categoriaR.rows) {
      if (Number(r[0]) !== anoAtual) continue
      const esp = String(r[2] ?? '').trim()
      if (f.especie && esp !== f.especie) continue
      const cat = String(r[1] ?? '').trim().toUpperCase(); const v = Number(r[3]) || 0
      if (cat.includes('CORRENTE')) correntes += v
      else if (cat.includes('CAPITAL')) capital += v
    }

    // 4) Dívida Ativa por espécie (ano selecionado) — visão própria, não usa filtro de espécie
    const dividaR = await agentQuery(`
      SELECT nr.DS_ESPECIE_RECEITA AS esp, nr.DS_TIPO_RECEITA AS tipo,
        SUM(f.VL_ARRECADACAO_RECEITA) AS liq
      FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
      JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
      JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
      WHERE d.NO_ANO = ${anoAtual}${WHERE_RECEITA_OFICIAL}
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

    // 4b) Hierarquia da arrecadação (drill: Categoria → Espécie → Alínea → Natureza) no ano selecionado
    const treeR = await agentQuery(`
      SELECT nr.DS_CATEGORIA_ECONOMICA_RECEITA AS cat, nr.DS_ESPECIE_RECEITA AS esp,
        nr.DS_ALINEA_RECEITA AS ali, nr.DS_NATUREZA_RECEITA AS nat,
        SUM(f.VL_ARRECADACAO_RECEITA) AS v
      FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
      JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
      JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
      WHERE d.NO_ANO = ${anoAtual}${WHERE_RECEITA_OFICIAL}
      GROUP BY nr.DS_CATEGORIA_ECONOMICA_RECEITA, nr.DS_ESPECIE_RECEITA, nr.DS_ALINEA_RECEITA, nr.DS_NATUREZA_RECEITA`, 5000)
    const categoriaTree = treeR.rows
      .map(r => ({ cat: String(r[0] ?? '').trim(), esp: String(r[1] ?? '').trim(), ali: String(r[2] ?? '').trim(), nat: String(r[3] ?? '').trim(), v: Number(r[4]) || 0 }))
      .filter(t => t.v !== 0)

    // 5) Histórico mensal (4 últimos anos presentes, espécie filtrada)
    const anosHist = [...anos].sort((a, b) => a - b).slice(-4)
    const historico = {
      anos: anosHist,
      linhas: Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i + 1],
        vals: anosHist.map(a => get(a, i + 1)),
      })),
    }

    return NextResponse.json({ porAno, porMes, categoria: { correntes, capital }, categoriaTree, dividaAtiva, historico, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
