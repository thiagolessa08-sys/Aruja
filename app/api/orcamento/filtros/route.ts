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
    const [anosR, espR] = await Promise.all([
      agentQuery(`
        SELECT DISTINCT d.NO_ANO AS ano
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        ORDER BY ano DESC`, 50),
      agentQuery(`
        SELECT nr.DS_ESPECIE_RECEITA AS especie, SUM(f.VL_ARRECADACAO_RECEITA) AS v
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE 1=1${WHERE_RECEITA_OFICIAL}
        GROUP BY nr.DS_ESPECIE_RECEITA ORDER BY v DESC`, 100),
    ])

    const anos = anosR.rows.map(r => Number(r[0])).filter(a => a >= ANO_MIN_RECEITA)
    const especies = espR.rows
      .map(r => String(r[0] ?? '').trim())
      .filter(e => e && e.toLowerCase() !== 'não informado')

    const data = { anos, especies }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
