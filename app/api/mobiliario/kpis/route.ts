import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, SITUACOES_ATIVAS } from '@/lib/mobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_ISS = /IMPOSTOS SOBRE SERVI/i

interface Kpi {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtMoney = (v: number) =>
  Math.abs(v) >= 1e9
    ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
    : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtPct1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

function variacao(atual: number, anterior: number): { pct: string; dir: 'up' | 'down' | 'flat' } {
  if (!anterior) return { pct: '0,00%', dir: 'flat' }
  const r = ((atual - anterior) / Math.abs(anterior)) * 100
  const dir = r > 0.005 ? 'up' : r < -0.005 ? 'down' : 'flat'
  return { pct: r.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%', dir }
}

const yearMap = (rows: unknown[][]): { keyAno: number; sit: string; n: number }[] =>
  rows.map(r => ({ keyAno: Number(r[0]), sit: String(r[1] ?? '').trim(), n: Number(r[2]) || 0 }))

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const foco = req.nextUrl.searchParams.get('foco') === 'arrecadacao' ? 'arrecadacao' : 'cadastro'
    const semSit = !f.situacao
    const matchSit = (sit: string) => semSit || sit === f.situacao

    const [sitRows, abRows, encRows, receita] = await Promise.all([
      agentQuery(`
        SELECT ds_situacao AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY ds_situacao`, 50),
      agentQuery(`
        SELECT YEAR(dt_inicio_atividade) AS ano, ds_situacao AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY YEAR(dt_inicio_atividade), ds_situacao`, 800),
      agentQuery(`
        SELECT YEAR(dt_enc_atividade) AS ano, ds_situacao AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY YEAR(dt_enc_atividade), ds_situacao`, 800),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea, SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
    ])

    // Snapshot de situação (base completa — KPIs 1 e 2 são sempre referência total)
    let total = 0, ativas = 0
    for (const r of sitRows.rows) {
      const sit = String(r[0] ?? '').trim(), n = Number(r[1]) || 0
      total += n
      if (SITUACOES_ATIVAS.has(sit)) ativas += n
    }
    const inativas = total - ativas

    // Aberturas / Encerramentos por ano (restritos pela situação se houver filtro)
    const ab = new Map<number, number>()
    for (const x of yearMap(abRows.rows)) {
      if (x.keyAno < 2000 || x.keyAno > 2030 || !matchSit(x.sit)) continue
      ab.set(x.keyAno, (ab.get(x.keyAno) ?? 0) + x.n)
    }
    const enc = new Map<number, number>()
    for (const x of yearMap(encRows.rows)) {
      if (x.keyAno < 2000 || x.keyAno > 2030 || !matchSit(x.sit)) continue
      enc.set(x.keyAno, (enc.get(x.keyAno) ?? 0) + x.n)
    }

    // ISS arrecadado por ano (receita — não decomponível por situação)
    const iss = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_ISS.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0])
      iss.set(ano, (iss.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    const anoMax = Math.max(...Array.from(ab.keys()), ...Array.from(iss.keys()), 0)
    const anoAtual = f.ano || anoMax
    const anoAnt = anoAtual - 1

    const abA = ab.get(anoAtual) ?? 0, abP = ab.get(anoAnt) ?? 0
    const encA = enc.get(anoAtual) ?? 0, encP = enc.get(anoAnt) ?? 0
    const issA = iss.get(anoAtual) ?? 0, issP = iss.get(anoAnt) ?? 0

    const pctAtivas = total ? (ativas / total) * 100 : 0

    const kpis: Kpi[] = [
      { label: 'Empresas Cadastradas', value: fmtInt(total), subLabel: 'Ativas', subValue: fmtInt(ativas), pct: fmtPct1(pctAtivas), dir: 'up' },
      { label: 'Empresas Ativas', value: fmtInt(ativas), subLabel: 'Inativas', subValue: fmtInt(inativas), pct: fmtPct1(pctAtivas), dir: pctAtivas >= 50 ? 'up' : 'down' },
      { label: 'Aberturas no Exercício', value: fmtInt(abA), subLabel: 'Ano Anterior', subValue: fmtInt(abP), ...variacao(abA, abP) },
      { label: 'Encerramentos no Exercício', value: fmtInt(encA), subLabel: 'Ano Anterior', subValue: fmtInt(encP), ...variacao(encA, encP) },
      semSit
        ? { label: 'ISS Arrecadado', value: fmtMoney(issA), subLabel: 'Ano Anterior', subValue: fmtMoney(issP), ...variacao(issA, issP) }
        : { label: 'ISS Arrecadado', value: '—', subLabel: 'não filtrável por situação', subValue: '—', pct: '', dir: 'flat' },
    ]

    // Foco arrecadação (toggle ISS no Imobiliário): ISS em destaque (card azul)
    const ordenados = foco === 'arrecadacao' ? [kpis[4], kpis[1], kpis[0], kpis[2], kpis[3]] : kpis

    return NextResponse.json({ kpis: ordenados, referencia: { ano: anoAtual } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
