import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { WHERE_RECEITA_OFICIAL, ANO_MIN_RECEITA } from '@/lib/receita-filtros'

const SCHEMA = 'pref_aruja_sp'

let cache: { data: unknown; at: number } | null = null
const TTL = 60 * 60 * 1000 // 1h

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.data)

  try {
    const [anosR, hierR] = await Promise.all([
      agentQuery(`
        SELECT DISTINCT d.NO_ANO AS ano
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        ORDER BY ano DESC`, 50),
      // Filtro "Impostos e Taxas" — 2 níveis (Alínea → Natureza), na base oficial
      agentQuery(`
        SELECT DISTINCT nr.DS_ALINEA_RECEITA AS alinea, nr.DS_NATUREZA_RECEITA AS natureza
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE 1=1${WHERE_RECEITA_OFICIAL}
        ORDER BY nr.DS_ALINEA_RECEITA, nr.DS_NATUREZA_RECEITA`, 500),
    ])

    const anos = anosR.rows.map(r => Number(r[0])).filter(a => a >= ANO_MIN_RECEITA)

    // Agrupa em [{ alinea, naturezas: [...] }] preservando a ordem alfabética
    const mapa = new Map<string, string[]>()
    for (const r of hierR.rows) {
      const ali = String(r[0] ?? '').trim()
      const nat = String(r[1] ?? '').trim()
      if (!ali || !nat) continue
      if (!mapa.has(ali)) mapa.set(ali, [])
      mapa.get(ali)!.push(nat)
    }
    const impostosTaxas = [...mapa.entries()].map(([alinea, naturezas]) => ({ alinea, naturezas }))

    const data = { anos, impostosTaxas }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
