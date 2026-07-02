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

    // Secretarias que realmente têm execução no fato (poder executivo, CD_ORGAO=1).
    // O filtro CD_ORGAO='1' é feito em JS porque o agente do IQ quebra com string em WHERE.
    const secR = await agentQuery(`
      SELECT i.SK_INSTITUCIONAL AS sk, i.CD_ORGAO AS orgao, i.DS_UO AS uo, i.DS_ORGAO AS dsorgao, i.CD_UO AS cduo
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_INSTITUCIONAL i ON f.SK_INSTITUCIONAL = i.SK_INSTITUCIONAL
      GROUP BY i.SK_INSTITUCIONAL, i.CD_ORGAO, i.DS_UO, i.DS_ORGAO, i.CD_UO`, 500)

    // Só unidades orçamentárias oficiais (02.01.00 a 02.19.00 — órgão executivo, exclui raiz/legislativo)
    const secretarias = secR.rows
      .filter(r => {
        const cduo = String(r[4] ?? '').trim()
        return cduo >= '02.01.00' && cduo <= '02.19.99' && String(r[2] ?? '').trim() !== String(r[3] ?? '').trim()
      })
      .map(r => ({ sk: Number(r[0]), nome: String(r[2] ?? '').trim() }))
      .filter(s => s.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    const data = { anos, secretarias }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
