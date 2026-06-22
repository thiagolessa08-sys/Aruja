import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, whereExtra, indCol } from '@/lib/despesa-filtros'

const SCHEMA = 'pref_aruja_sp'
const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const col = indCol(f.indicador)
    const weSecMes = whereExtra({ ...f }) // mês + secretaria
    const weSec = whereExtra({ ...f, mes: null }) // só secretaria (para séries que ignoram mês)

    // Série mensal por ano (sem restringir mês — gráficos por ano/mês usam todos os meses)
    const mensalR = await agentQuery(`
      SELECT d.NO_ANO AS ano, d.NO_MES AS mes, SUM(f.${col}) AS v
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      WHERE 1=1${weSec}
      GROUP BY d.NO_ANO, d.NO_MES`, 3000)

    const val = new Map<string, number>()
    const totalAno = new Map<number, number>()
    let anoMax = 0
    for (const r of mensalR.rows) {
      const ano = Number(r[0]), mes = Number(r[1]), v = Number(r[2]) || 0
      val.set(`${ano}-${mes}`, v)
      totalAno.set(ano, (totalAno.get(ano) ?? 0) + v)
      if (ano > anoMax) anoMax = ano
    }
    const ano = f.ano || anoMax
    const anoAnt = ano - 1

    const anosAno = [ano - 3, ano - 2, ano - 1, ano]
    const porAno = anosAno.map(a => ({ ano: a, pago: totalAno.get(a) ?? 0 }))

    const porMes = []
    for (let m = 1; m <= 12; m++) {
      const ant = val.get(`${anoAnt}-${m}`) ?? 0
      const atu = val.get(`${ano}-${m}`) ?? 0
      const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
      porMes.push({ mes: m, nome: MESES[m], anoAnterior: ant, anoAtual: atu, pct })
    }

    // Categoria econômica (Correntes x Capital) — respeita ano + mês + secretaria
    const categoriaR = await agentQuery(`
      SELECT gd.DS_CATEGORIA AS categoria, SUM(f.${col}) AS v
      FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
      JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_DESPESA nd ON f.SK_NATUREZA_DESPESA = nd.SK_NATUREZA_DESPESA
      JOIN ${SCHEMA}.DIM_BIORC_GRUPO_DESPESA gd ON nd.SK_GRUPO_DESPESA = gd.SK_GRUPO_DESPESA
      JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
      WHERE d.NO_ANO = ${ano}${weSecMes}
      GROUP BY gd.DS_CATEGORIA`, 50)

    let correntes = 0, capital = 0
    for (const r of categoriaR.rows) {
      const cat = String(r[0] ?? '').trim().toUpperCase()
      const v = Number(r[1]) || 0
      if (cat.includes('CORRENTE')) correntes += v
      else if (cat.includes('CAPITAL')) capital += v
    }

    return NextResponse.json({ porAno, porMes, categoria: { correntes, capital } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
