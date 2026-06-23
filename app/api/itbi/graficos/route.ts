import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, classificaNatureza, NATUREZAS, NATUREZA_OUTROS } from '@/lib/itbi-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_ITBI = /INTER VIVOS/i

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const semNat = !f.natureza
    const matchNat = (nat: string) => semNat || classificaNatureza(nat) === f.natureza

    const [itbi, receita] = await Promise.all([
      agentQuery(`
        SELECT YEAR(dt_transacao) AS ano, ds_natureza_transacao AS nat, COUNT(*) AS n,
          SUM(vl_venal) AS venal, SUM(vl_parte_financiada) AS fin, SUM(vl_parte_nao_financiada) AS naofin
        FROM ${SCHEMA}.tb_dsod_itbi
        GROUP BY YEAR(dt_transacao), ds_natureza_transacao`, 3000),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea, SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
    ])

    const trans = new Map<number, number>()
    const venal = new Map<number, number>()
    const fin = new Map<number, number>()
    const naofin = new Map<number, number>()
    for (const r of itbi.rows) {
      const ano = Number(r[0]); if (ano < 2000 || ano > 2030) continue
      if (!matchNat(String(r[1] ?? ''))) continue
      trans.set(ano, (trans.get(ano) ?? 0) + (Number(r[2]) || 0))
      venal.set(ano, (venal.get(ano) ?? 0) + (Number(r[3]) || 0))
      fin.set(ano, (fin.get(ano) ?? 0) + (Number(r[4]) || 0))
      naofin.set(ano, (naofin.get(ano) ?? 0) + (Number(r[5]) || 0))
    }

    const arr = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_ITBI.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0]); arr.set(ano, (arr.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    const anoMax = Math.max(...Array.from(trans.keys()), ...Array.from(arr.keys()), 0)
    const anoAtual = f.ano || anoMax

    // Linha — ITBI arrecadado por ano (últimos 6 com dado)
    const porAno = Array.from(arr.keys())
      .filter(a => a <= anoAtual && (arr.get(a) ?? 0) > 0)
      .sort((a, b) => a - b)
      .slice(-6)
      .map(ano => ({ ano, arrecadado: arr.get(ano) ?? 0 }))

    // Barras — nº de transmissões por ano (últimos 8)
    const transmissoes = Array.from(trans.keys())
      .filter(a => a >= 2010 && a <= anoAtual)
      .sort((a, b) => a - b)
      .slice(-8)
      .map(ano => ({ ano, qt: trans.get(ano) ?? 0 }))

    // Donut — natureza da transação no exercício corrente (classificada)
    const natCount = new Map<string, number>()
    for (const r of itbi.rows) {
      const ano = Number(r[0]); if (ano !== anoAtual) continue
      const id = classificaNatureza(String(r[1] ?? ''))
      natCount.set(id, (natCount.get(id) ?? 0) + (Number(r[2]) || 0))
    }
    const naturezasOrd = [...NATUREZAS, NATUREZA_OUTROS as { id: string; label: string }]
    const naturezas = naturezasOrd
      .map(n => ({ id: n.id, label: n.label, qt: natCount.get(n.id) ?? 0 }))
      .filter(n => n.qt > 0)

    // Composição — financiado × não financiado (exercício corrente)
    const financiamento = { financiado: fin.get(anoAtual) ?? 0, naoFinanciado: naofin.get(anoAtual) ?? 0 }

    // Tabela — exercícios (últimos 6 desc)
    const anosTab = Array.from(new Set([...trans.keys(), ...arr.keys()]))
      .filter(a => a >= 2010 && a <= anoAtual)
      .sort((a, b) => b - a)
      .slice(0, 6)
    const exercicios = anosTab.map(ano => {
      const t = trans.get(ano) ?? 0, v = venal.get(ano) ?? 0
      return { ano, transmissoes: t, movimentado: v, arrecadado: arr.get(ano) ?? 0, ticket: t ? v / t : 0 }
    })

    return NextResponse.json({ porAno, transmissoes, naturezas, financiamento, exercicios, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
