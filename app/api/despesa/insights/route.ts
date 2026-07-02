import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { whereUO, ANO_MIN_DESPESA } from '@/lib/despesa-filtros'

const MESES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SCHEMA = 'pref_aruja_sp'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cache em memória por mês — regenera na 1ª visita de cada mês (dia 01)
let cache: { mes: string; insights: string[]; geradoEm: string } | null = null

function mi(v: number): string {
  return (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
}

async function gerarInsights(): Promise<string[]> {
  // 1) Empenhado/Liquidado/Pago mensal (todos os anos)
  const mensal = await agentQuery(`
    SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
      SUM(f.VL_SALDO_MES_EMPENHADO) AS emp,
      SUM(f.VL_SALDO_MES_LIQUIDADO) AS liq,
      SUM(f.VL_SALDO_MES_PAGO) AS pago
    FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
    JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
    WHERE d.NO_ANO >= ${ANO_MIN_DESPESA}${whereUO()}
    GROUP BY d.NO_ANO, d.NO_MES`, 3000)

  const emp = new Map<string, number>(), liq = new Map<string, number>(), pago = new Map<string, number>()
  let anoAtual = 0, mesAtual = 0
  for (const r of mensal.rows) {
    const ano = Number(r[0]), mes = Number(r[1])
    emp.set(`${ano}-${mes}`, Number(r[2]) || 0)
    liq.set(`${ano}-${mes}`, Number(r[3]) || 0)
    pago.set(`${ano}-${mes}`, Number(r[4]) || 0)
    if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) { anoAtual = ano; mesAtual = mes }
  }
  const anoAnt = anoAtual - 1
  const ytd = (m: Map<string, number>, ano: number) => { let s = 0; for (let i = 1; i <= mesAtual; i++) s += m.get(`${ano}-${i}`) ?? 0; return s }

  const empA = ytd(emp, anoAtual), empB = ytd(emp, anoAnt)
  const liqA = ytd(liq, anoAtual), liqB = ytd(liq, anoAnt)
  const pagoA = ytd(pago, anoAtual), pagoB = ytd(pago, anoAnt)
  const varPago = pagoB ? ((pagoA - pagoB) / pagoB) * 100 : 0

  // total ano anterior completo (pago)
  let pagoTotalAnt = 0
  for (let m = 1; m <= 12; m++) pagoTotalAnt += pago.get(`${anoAnt}-${m}`) ?? 0

  // 2) Composição por grupo de despesa no ano atual
  const grupo = await agentQuery(`
    SELECT gd.DS_GRUPO AS grupo, SUM(f.VL_SALDO_MES_PAGO) AS pago
    FROM ${SCHEMA}.FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO f
    JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_DESPESA nd ON f.SK_NATUREZA_DESPESA = nd.SK_NATUREZA_DESPESA
    JOIN ${SCHEMA}.DIM_BIORC_GRUPO_DESPESA gd ON nd.SK_GRUPO_DESPESA = gd.SK_GRUPO_DESPESA
    JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_MES = d.SK_DATA_CALENDARIO
    WHERE d.NO_ANO = ${anoAtual}${whereUO()}
    GROUP BY gd.DS_GRUPO ORDER BY pago DESC`, 50)

  const topGrupos = grupo.rows
    .filter(r => r[1] != null)
    .slice(0, 5)
    .map(r => `${String(r[0])}: ${mi(Number(r[1]) || 0)}`)
    .join('; ')

  // Série mensal do ano atual (Pago, para tendência)
  const serieAtual = []
  for (let m = 1; m <= mesAtual; m++) serieAtual.push(`${MESES[m]}: ${mi(pago.get(`${anoAtual}-${m}`) ?? 0)}`)

  const dados = `DADOS DE EXECUÇÃO DE DESPESA — Prefeitura de Arujá
Ano corrente: ${anoAtual} (dados até ${MESES[mesAtual]})
Ano anterior: ${anoAnt}

Acumulado no ano (jan–${MESES[mesAtual]}):
- Empenhado ${anoAtual}: ${mi(empA)} | ${anoAnt} (mesmo período): ${mi(empB)}
- Liquidado ${anoAtual}: ${mi(liqA)} | ${anoAnt} (mesmo período): ${mi(liqB)}
- Pago ${anoAtual}: ${mi(pagoA)} | ${anoAnt} (mesmo período): ${mi(pagoB)}
- Variação do Pago: ${varPago >= 0 ? '+' : ''}${varPago.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
- Pago total de ${anoAnt} (ano fechado): ${mi(pagoTotalAnt)}

Série mensal ${anoAtual} (Pago): ${serieAtual.join('; ')}

Composição da despesa paga por grupo em ${anoAtual} (maiores): ${topGrupos}`

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `Você é analista de finanças públicas da Prefeitura de Arujá (SP).
Gere EXATAMENTE 3 insights curtos e objetivos sobre a DESPESA/execução orçamentária municipal, com base nos dados fornecidos.
Regras:
- Cada insight = 1 frase curta (máx ~18 palavras), em português do Brasil.
- Seja específico: cite números (use "mi" para milhões) e comparações ano-a-ano quando relevante.
- Foque em ritmo de execução (empenhado vs liquidado vs pago), composição por grupo (pessoal, custeio, investimentos) e alertas (ex.: descompasso entre empenhado e pago).
- NÃO use markdown, emojis ou títulos.
- Responda APENAS um array JSON de 3 strings. Ex: ["...","...","..."]`,
    messages: [{ role: 'user', content: dados }],
  })

  const texto = resp.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()

  let insights: string[] = []
  try {
    const m = texto.match(/\[[\s\S]*\]/)
    insights = JSON.parse(m ? m[0] : texto)
  } catch {
    insights = texto.split('\n').map(l => l.replace(/^[-*\d.\s"]+/, '').replace(/"$/, '').trim()).filter(Boolean)
  }
  return insights.slice(0, 3)
}

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const agora = new Date()
  const mesKey = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`

  if (cache && cache.mes === mesKey) {
    return NextResponse.json({ insights: cache.insights, mes: cache.mes, geradoEm: cache.geradoEm })
  }

  try {
    const insights = await gerarInsights()
    cache = { mes: mesKey, insights, geradoEm: agora.toISOString() }
    return NextResponse.json({ insights, mes: mesKey, geradoEm: cache.geradoEm })
  } catch (e) {
    if (cache) return NextResponse.json({ insights: cache.insights, mes: cache.mes, geradoEm: cache.geradoEm, stale: true })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
