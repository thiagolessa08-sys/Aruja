import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { ANO_MIN_RECEITA } from '@/lib/receita-filtros'
import { RECEITA_FILTRO_TREE } from '@/lib/receita-filtro-tree'

const SCHEMA = 'pref_aruja_sp'

let cache: { data: unknown; at: number } | null = null
const TTL = 60 * 60 * 1000 // 1h

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.data)

  try {
    // Anos vêm do banco (execução). O filtro "Impostos e Taxas" (Grupo → Natureza) vem
    // ESTÁTICO da planilha do BO — assim mostra exatamente os grupos/naturezas da planilha,
    // inclusive naturezas ainda sem execução (que não apareceriam numa consulta ao FATO).
    const anosR = await agentQuery(`
        SELECT DISTINCT d.NO_ANO AS ano
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        ORDER BY ano DESC`, 50)

    const anos = anosR.rows.map(r => Number(r[0])).filter(a => a >= ANO_MIN_RECEITA)
    const impostosTaxas = RECEITA_FILTRO_TREE

    const data = { anos, impostosTaxas }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
