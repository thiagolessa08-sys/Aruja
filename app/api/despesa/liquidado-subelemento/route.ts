import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereExtra, indCol } from '@/lib/despesa-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const sp = req.nextUrl.searchParams
    const filtros = lerFiltros(sp)
    const col = indCol(filtros.indicador)
    const we = whereExtra(filtros) // mês + secretaria

    // ano (filtro ou mais recente)
    const anoR = await agentQuery(`
      SELECT MAX(d.NO_ANO) AS ano
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO`, 1)
    const ano = filtros.ano || Number(anoR.rows[0]?.[0]) || new Date().getFullYear()

    // Sempre traz todos os subelementos (com o elemento de cada um já junto) — o front
    // agrega por elemento (nível 0 do drill) e filtra por elemento ao descer (nível 1).
    // TOP 200 cobre folgadamente o total de subelementos distintos (128 em 2026).
    const itensR = await agentQuery(`
      SELECT TOP 200 nd.DS_SUB_ELEMENTO AS subelemento, el.DS_ELEMENTO_DESPESA AS elemento,
        SUM(f.${col}) AS v
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_DESPESA nd ON f.SK_NATUREZA_DESPESA = nd.SK_NATUREZA_DESPESA
      JOIN ${SCHEMA}.DIM_BIORC_ELEMENTO_DESPESA el ON nd.SK_ELEMENTO_DESPESA = el.SK_ELEMENTO_DESPESA
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      WHERE d.NO_ANO = ${ano}
        AND nd.DS_SUB_ELEMENTO IS NOT NULL
        AND el.DS_ELEMENTO_DESPESA IS NOT NULL
        AND f.${col} <> 0
        ${we}
      GROUP BY nd.DS_SUB_ELEMENTO, el.DS_ELEMENTO_DESPESA
      ORDER BY v DESC`, 200)

    const itens = itensR.rows.map(r => ({
      subelemento: String(r[0]),
      elemento: String(r[1]),
      liquidado: Number(r[2]) || 0,
    }))

    return NextResponse.json({ ano, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
