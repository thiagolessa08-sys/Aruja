import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { WHERE_RECEITA_OFICIAL } from '@/lib/receita-filtros'

const MESES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SCHEMA = 'pref_aruja_sp'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cache em memória por mês — regenera na 1ª visita de cada mês (dia 01)
let cache: { mes: string; insights: string[]; geradoEm: string } | null = null

function mi(v: number): string {
  return (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
}

async function gerarInsights(): Promise<string[]> {
  // 1) Arrecadação oficial mensal (regra Ronaldo — bruta, ficha<5000, categorias válidas, >=2023)
  const mensal = await agentQuery(`
    SELECT d.NO_ANO AS ano, d.NO_MES AS mes,
      SUM(f.VL_ARRECADACAO_RECEITA) AS liq
    FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
    JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
    JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
    JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
    WHERE 1=1${WHERE_RECEITA_OFICIAL}
    GROUP BY d.NO_ANO, d.NO_MES`, 3000)

  const arrec = new Map<string, number>()
  let anoAtual = 0, mesAtual = 0
  for (const r of mensal.rows) {
    const ano = Number(r[0]), mes = Number(r[1]), v = Number(r[2]) || 0
    arrec.set(`${ano}-${mes}`, v)
    if (ano > anoAtual || (ano === anoAtual && mes > mesAtual)) { anoAtual = ano; mesAtual = mes }
  }
  const anoAnt = anoAtual - 1
  const ytd = (ano: number) => { let s = 0; for (let m = 1; m <= mesAtual; m++) s += arrec.get(`${ano}-${m}`) ?? 0; return s }
  const ytdAtual = ytd(anoAtual), ytdAnt = ytd(anoAnt)
  const varYtd = ytdAnt ? ((ytdAtual - ytdAnt) / ytdAnt) * 100 : 0

  // total ano anterior completo
  let totalAnt = 0
  for (let m = 1; m <= 12; m++) totalAnt += arrec.get(`${anoAnt}-${m}`) ?? 0

  // 2) Composição por espécie no ano atual
  const especie = await agentQuery(`
    SELECT nr.DS_ESPECIE_RECEITA AS especie,
      SUM(f.VL_ARRECADACAO_RECEITA) AS liq
    FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA f
    JOIN ${SCHEMA}.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
    JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON f.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
    JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
    WHERE d.NO_ANO = ${anoAtual}${WHERE_RECEITA_OFICIAL}
    GROUP BY nr.DS_ESPECIE_RECEITA ORDER BY liq DESC`, 50)

  const topEspecies = especie.rows.slice(0, 6).map(r => `${String(r[0])}: ${mi(Number(r[1]) || 0)}`).join('; ')

  // Série mensal do ano atual (para tendência)
  const serieAtual = []
  for (let m = 1; m <= mesAtual; m++) serieAtual.push(`${MESES[m]}: ${mi(arrec.get(`${anoAtual}-${m}`) ?? 0)}`)

  const dados = `DADOS DE ARRECADAÇÃO (RECEITA LÍQUIDA) — Prefeitura de Arujá
Ano corrente: ${anoAtual} (dados até ${MESES[mesAtual]})
Ano anterior: ${anoAnt}

Acumulado no ano (jan–${MESES[mesAtual]}):
- ${anoAtual}: ${mi(ytdAtual)}
- ${anoAnt} (mesmo período): ${mi(ytdAnt)}
- Variação: ${varYtd >= 0 ? '+' : ''}${varYtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
- Arrecadação total de ${anoAnt} (ano fechado): ${mi(totalAnt)}

Série mensal ${anoAtual}: ${serieAtual.join('; ')}

Composição por espécie em ${anoAtual} (maiores): ${topEspecies}`

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `Você é analista de finanças públicas da Prefeitura de Arujá (SP).
Gere EXATAMENTE 3 insights curtos e objetivos sobre a RECEITA/arrecadação municipal, com base nos dados fornecidos.
Regras:
- Cada insight = 1 frase curta (máx ~18 palavras), em português do Brasil.
- Seja específico: cite números (use "mi" para milhões) e comparações ano-a-ano quando relevante.
- Foque em tendências, ritmo de arrecadação, composição (impostos/transferências) e alertas.
- NÃO use markdown, emojis ou títulos.
- Responda APENAS um array JSON de 3 strings. Ex: ["...","...","..."]`,
    messages: [{ role: 'user', content: dados }],
  })

  const texto = resp.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()

  // Tenta JSON; se falhar, quebra por linhas
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
    // se já houver cache antigo, devolve ele; senão erro
    if (cache) return NextResponse.json({ insights: cache.insights, mes: cache.mes, geradoEm: cache.geradoEm, stale: true })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
