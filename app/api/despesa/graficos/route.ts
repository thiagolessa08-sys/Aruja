import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'
const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

let cache: { data: unknown; at: number } | null = null
const TTL = 30 * 60 * 1000 // 30 min

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.data)
  }

  try {
    const mensalR = await agentQuery(`
      SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
        SUM(f.VL_SALDO_MES_EMPENHADO) AS emp,
        SUM(f.VL_SALDO_MES_LIQUIDADO) AS liq,
        SUM(f.VL_SALDO_MES_PAGO) AS pago
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      GROUP BY d.NO_ANO, d.NO_MES`, 2000)

    const emp = new Map<string, number>(), liq = new Map<string, number>(), pago = new Map<string, number>()
    const totaisAno = new Map<number, { emp: number; pago: number }>()
    let anoAtual = 0, mesAtual = 0
    for (const r of mensalR.rows) {
      const ano = Number(r[0]), mes = Number(r[1])
      emp.set(`${ano}-${mes}`, Number(r[2]) || 0)
      liq.set(`${ano}-${mes}`, Number(r[3]) || 0)
      pago.set(`${ano}-${mes}`, Number(r[4]) || 0)
      const acc = totaisAno.get(ano) ?? { emp: 0, pago: 0 }
      acc.emp += Number(r[2]) || 0
      acc.pago += Number(r[4]) || 0
      totaisAno.set(ano, acc)
      if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) { anoAtual = ano; mesAtual = mes }
    }
    const anoAnt = anoAtual - 1

    const anos = [...totaisAno.keys()].sort((a, b) => a - b)
    const latestFull = anos.length ? anos[anos.length - 1] - 1 : new Date().getFullYear() - 1 // último ano provavelmente parcial
    const anosAno = [latestFull - 3, latestFull - 2, latestFull - 1, latestFull]

    const porAno = anosAno.map(ano => ({
      ano,
      empenhado: totaisAno.get(ano)?.emp ?? 0,
      pago: totaisAno.get(ano)?.pago ?? 0,
    }))

    const porMes = []
    for (let m = 1; m <= 12; m++) {
      const ant = liq.get(`${anoAnt}-${m}`) ?? 0
      const atu = liq.get(`${anoAtual}-${m}`) ?? 0
      const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
      porMes.push({ mes: m, nome: MESES[m], anoAnterior: ant, anoAtual: atu, pct })
    }

    const data = { porAno, porMes }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
