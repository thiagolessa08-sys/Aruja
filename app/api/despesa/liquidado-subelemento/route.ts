import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereExtra, indCol } from '@/lib/despesa-filtros'

const SCHEMA = 'pref_aruja_sp'

interface ElementoOpt { sk: number; nome: string }

let elementosCache: { lista: ElementoOpt[]; at: number } | null = null
const ELEMENTOS_TTL = 60 * 60 * 1000 // 1h

// O agente quebra (500) com string literal em WHERE — filtro de elemento usa SK numérico.
async function getElementos(): Promise<ElementoOpt[]> {
  if (elementosCache && Date.now() - elementosCache.at < ELEMENTOS_TTL) return elementosCache.lista
  const r = await agentQuery(`
    SELECT DISTINCT SK_ELEMENTO_DESPESA AS sk, DS_ELEMENTO_DESPESA AS elemento
    FROM ${SCHEMA}.DIM_BIORC_ELEMENTO_DESPESA
    WHERE DS_ELEMENTO_DESPESA IS NOT NULL
    ORDER BY elemento`, 200)
  const lista = r.rows.map(row => ({ sk: Number(row[0]), nome: String(row[1]) }))
  elementosCache = { lista, at: Date.now() }
  return lista
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const sp = req.nextUrl.searchParams
    const filtros = lerFiltros(sp)
    const col = indCol(filtros.indicador)
    const we = whereExtra(filtros) // mês + secretaria

    const elementos = await getElementos()
    const elementoParam = sp.get('elemento')
    const opt = elementoParam ? elementos.find(e => e.nome === elementoParam) : undefined
    const filtroElemento = opt ? `AND nd.SK_ELEMENTO_DESPESA = ${opt.sk}` : ''

    // ano (filtro ou mais recente)
    const anoR = await agentQuery(`
      SELECT MAX(d.NO_ANO) AS ano
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO`, 1)
    const ano = filtros.ano || Number(anoR.rows[0]?.[0]) || new Date().getFullYear()

    const itensR = await agentQuery(`
      SELECT TOP 10 nd.DS_SUB_ELEMENTO AS subelemento, el.DS_ELEMENTO_DESPESA AS elemento,
        SUM(f.${col}) AS v
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_DESPESA nd ON f.SK_NATUREZA_DESPESA = nd.SK_NATUREZA_DESPESA
      JOIN ${SCHEMA}.DIM_BIORC_ELEMENTO_DESPESA el ON nd.SK_ELEMENTO_DESPESA = el.SK_ELEMENTO_DESPESA
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      WHERE d.NO_ANO = ${ano}
        AND nd.DS_SUB_ELEMENTO IS NOT NULL
        AND el.DS_ELEMENTO_DESPESA IS NOT NULL
        ${filtroElemento}${we}
      GROUP BY nd.DS_SUB_ELEMENTO, el.DS_ELEMENTO_DESPESA
      ORDER BY v DESC`, 10)

    const itens = itensR.rows.map(r => ({
      subelemento: String(r[0]),
      elemento: String(r[1]),
      liquidado: Number(r[2]) || 0,
    }))

    return NextResponse.json({
      ano,
      elemento: opt?.nome ?? 'TODOS',
      elementos: elementos.map(e => e.nome),
      itens,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
