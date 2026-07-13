import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'

let cache: { data: unknown; at: number } | null = null
const TTL = 60 * 60 * 1000 // 1h

// Data da última carga do BI do orçamento (receita e despesa compartilham o mesmo
// DT_ULTIMA_ALTERACAO_BI). Retorna 'YYYY-MM-DD' (parte da data do maior timestamp).
export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.data)

  try {
    const r = await agentQuery(
      `SELECT MAX(DT_ULTIMA_ALTERACAO_BI) FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA`, 1)
    const raw = String(r.rows?.[0]?.[0] ?? '')
    const dataAtualizacao = raw ? raw.slice(0, 10) : null // 'YYYY-MM-DD'
    const data = { dataAtualizacao }
    cache = { data, at: Date.now() }
    return NextResponse.json(data)
  } catch (e) {
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
