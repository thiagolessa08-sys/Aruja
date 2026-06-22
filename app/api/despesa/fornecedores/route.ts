import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereExtra, indCol } from '@/lib/despesa-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const filtros = lerFiltros(req.nextUrl.searchParams)
    const ordCol = indCol(filtros.indicador) // ordena pelo indicador escolhido
    const we = whereExtra(filtros) // mês + secretaria

    const anoR = await agentQuery(`
      SELECT MAX(d.NO_ANO) AS ano
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO`, 1)
    const ano = filtros.ano || Number(anoR.rows[0]?.[0]) || new Date().getFullYear()

    const [itensR, totalR] = await Promise.all([
      agentQuery(`
        SELECT TOP 10 fo.CD_CPF_CNPJ_FORNECEDOR AS doc, fo.DS_FORNECEDOR AS nome,
          SUM(f.VL_SALDO_MES_EMPENHADO) AS emp, SUM(f.VL_SALDO_MES_LIQUIDADO) AS liq, SUM(f.VL_SALDO_MES_PAGO) AS pago
        FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
        JOIN ${SCHEMA}.DIM_BIORC_FORNECEDOR fo ON f.SK_FORNECEDOR = fo.SK_FORNECEDOR
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO = ${ano}${we}
        GROUP BY fo.CD_CPF_CNPJ_FORNECEDOR, fo.DS_FORNECEDOR
        ORDER BY SUM(f.${ordCol}) DESC`, 10),
      agentQuery(`
        SELECT SUM(f.VL_SALDO_MES_EMPENHADO) AS emp, SUM(f.VL_SALDO_MES_LIQUIDADO) AS liq, SUM(f.VL_SALDO_MES_PAGO) AS pago
        FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO = ${ano}${we}`, 1),
    ])

    const itens = itensR.rows.map(r => ({
      doc: String(r[0] ?? ''),
      nome: String(r[1] ?? ''),
      empenhado: Number(r[2]) || 0,
      liquidado: Number(r[3]) || 0,
      pago: Number(r[4]) || 0,
    }))

    const t = totalR.rows[0] ?? []
    const total = { empenhado: Number(t[0]) || 0, liquidado: Number(t[1]) || 0, pago: Number(t[2]) || 0 }

    return NextResponse.json({ ano, itens, total })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
