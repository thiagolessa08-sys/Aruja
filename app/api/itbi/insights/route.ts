import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, classificaNatureza } from '@/lib/itbi-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_ITBI = /INTER VIVOS/i

const int = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const money = (v: number) =>
  Math.abs(v) >= 1e9
    ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' bi'
    : Math.abs(v) >= 1e6
      ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
      : 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' mil'
const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

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
    let naofinAtualBase = 0, movAtualBase = 0, cvAtual = 0, totAtual = 0
    const arr = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_ITBI.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0]); arr.set(ano, (arr.get(ano) ?? 0) + (Number(r[2]) || 0))
    }
    for (const r of itbi.rows) {
      const ano = Number(r[0]); if (ano < 2000 || ano > 2030) continue
      trans.set(ano, (trans.get(ano) ?? 0) + (Number(r[2]) || 0))
      venal.set(ano, (venal.get(ano) ?? 0) + (Number(r[3]) || 0))
    }

    const anoMax = Math.max(...Array.from(trans.keys()), ...Array.from(arr.keys()), 0)
    const anoAtual = f.ano || anoMax

    for (const r of itbi.rows) {
      const ano = Number(r[0]); if (ano !== anoAtual) continue
      const n = Number(r[2]) || 0
      totAtual += n
      if (classificaNatureza(String(r[1] ?? '')) === 'compra_venda') cvAtual += n
      naofinAtualBase += Number(r[5]) || 0
      movAtualBase += (Number(r[4]) || 0) + (Number(r[5]) || 0)
    }

    const insights: string[] = []
    const t = trans.get(anoAtual) ?? 0, v = venal.get(anoAtual) ?? 0
    if (t) {
      insights.push(`Em ${anoAtual}, ${int(t)} transmissões movimentaram ${money(v)} em valor venal (ticket médio de ${money(v / t)}).`)
    }
    const a = arr.get(anoAtual) ?? 0
    if (a) {
      insights.push(`ITBI arrecadado de ${money(a)} em ${anoAtual} — alíquota de 2% sobre o valor de transmissão.`)
    }
    if (totAtual) {
      insights.push(`Compra e Venda concentra ${pct((cvAtual / totAtual) * 100)} das transmissões; ${pct(movAtualBase ? (naofinAtualBase / movAtualBase) * 100 : 0)} do valor não é financiado.`)
    }

    return NextResponse.json({ insights, geradoEm: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
