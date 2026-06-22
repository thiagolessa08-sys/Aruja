import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'

let cache: { data: unknown; at: number } | null = null
const TTL = 30 * 60 * 1000 // 30 min

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.data)
  }

  try {
    const anualR = await agentQuery(`
      SELECT d.NO_ANO AS ano,
        SUM(f.VL_SALDO_MES_EMPENHADO) AS emp,
        SUM(f.VL_SALDO_MES_PAGO) AS pago
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      GROUP BY d.NO_ANO`, 100)

    const anos = anualR.rows.map(r => Number(r[0])).sort((a, b) => a - b)
    const latestFull = anos.length ? anos[anos.length - 1] - 1 : new Date().getFullYear() - 1 // último ano provavelmente parcial
    const anosAno = [latestFull - 3, latestFull - 2, latestFull - 1, latestFull]

    const porAnoMap = new Map<number, { empenhado: number; pago: number }>()
    for (const r of anualR.rows) porAnoMap.set(Number(r[0]), { empenhado: Number(r[1]) || 0, pago: Number(r[2]) || 0 })

    const porAno = anosAno.map(ano => ({
      ano,
      empenhado: porAnoMap.get(ano)?.empenhado ?? 0,
      pago: porAnoMap.get(ano)?.pago ?? 0,
    }))

    const data = { porAno }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
