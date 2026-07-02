import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { ANO_MIN_DESPESA } from '@/lib/despesa-filtros'

const SCHEMA = 'pref_aruja_sp'

let cache: { data: unknown; at: number } | null = null
const TTL = 60 * 60 * 1000 // 1h

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.data)

  try {
    // Anos disponíveis
    const anosR = await agentQuery(`
      SELECT DISTINCT d.NO_ANO AS ano
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      ORDER BY ano DESC`, 50)
    const anos = anosR.rows.map(r => Number(r[0])).filter(a => a >= ANO_MIN_DESPESA)

    // Secretarias oficiais = unidades de nível .00 (02.01.00 a 02.19.00), direto da dimensão.
    // Valor do filtro = prefixo '02.XX' (seleciona todas as sub-unidades da secretaria).
    const secR = await agentQuery(`
      SELECT DISTINCT i.CD_UO AS cduo, i.DS_UO AS nome
      FROM ${SCHEMA}.DIM_BIORC_INSTITUCIONAL i
      WHERE i.CD_UO >= '02.01.00' AND i.CD_UO <= '02.19.00'
      ORDER BY i.CD_UO`, 200)

    const secretarias = secR.rows
      .map(r => ({ cduo: String(r[0] ?? '').trim(), nome: String(r[1] ?? '').trim() }))
      .filter(s => s.cduo.endsWith('.00') && s.nome)
      .map(s => ({ uo: s.cduo.slice(0, 5), nome: s.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    const data = { anos, secretarias }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
