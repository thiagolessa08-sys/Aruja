// Remove barra(s) final(is) para não gerar caminho com barra dupla (ex.: '//query' → 404).
const AGENT_URL = (process.env.AGENT_URL || '').replace(/\/+$/, '')
const AGENT_API_KEY = process.env.AGENT_API_KEY!
// Service token do Cloudflare Access (quando o agente está atrás do Zero Trust).
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET

function headers() {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': AGENT_API_KEY,
  }
  // Autentica no Cloudflare Access (se configurado) — senão o Access barra a requisição.
  if (CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
    h['CF-Access-Client-Id'] = CF_ACCESS_CLIENT_ID
    h['CF-Access-Client-Secret'] = CF_ACCESS_CLIENT_SECRET
  }
  return h
}

export async function agentHealth(): Promise<{ status: string; db: string }> {
  const res = await fetch(`${AGENT_URL}/health`, { headers: headers() })
  if (!res.ok) throw new Error(`Agent health check failed: ${res.status}`)
  return res.json()
}

export async function agentListTables(): Promise<string[]> {
  const res = await fetch(`${AGENT_URL}/tables`, { headers: headers() })
  if (!res.ok) throw new Error(`Failed to list tables: ${res.status}`)
  return res.json()
}

export interface ColumnDef {
  name: string
  type: string
  nullable: boolean
}

export async function agentSchema(table: string): Promise<ColumnDef[]> {
  const res = await fetch(`${AGENT_URL}/schema/${encodeURIComponent(table)}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Failed to get schema for ${table}: ${res.status}`)
  // O agente retorna { table, columns: [...] } — extrai e normaliza (nomes vêm com padding)
  const data = await res.json()
  const cols = Array.isArray(data) ? data : (data?.columns ?? [])
  return (cols as Array<{ name?: string; type?: string; nullable?: boolean }>).map(c => ({
    name: String(c.name ?? '').trim(),
    type: String(c.type ?? '').trim(),
    nullable: Boolean(c.nullable),
  }))
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  count: number
  truncated: boolean
}

export async function agentQuery(sql: string, limit = 500): Promise<QueryResult> {
  const res = await fetch(`${AGENT_URL}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ sql, limit }),
  })
  if (!res.ok) {
    const body = await res.text()
    const isHtml = /<html|<!doctype/i.test(body)
    let msg: string
    if (res.status === 524 || res.status === 504) {
      msg = 'Tempo limite excedido — a consulta demorou demais (limite ~100s). Restrinja por ano/bairro ou reduza o escopo da análise.'
    } else if (res.status === 502 || res.status === 503) {
      msg = 'Agente/banco temporariamente indisponível. Tente novamente em instantes.'
    } else if (res.status === 500 && !isHtml) {
      msg = body.slice(0, 300) // erro do próprio agente (SQL/banco) — mostra a mensagem
    } else if (isHtml) {
      msg = `gateway retornou HTTP ${res.status}.`
    } else {
      msg = body.slice(0, 300)
    }
    throw new Error(`Query failed (${res.status}): ${msg}`)
  }
  return res.json()
}

export async function listSchemaTables(schema = 'pref_aruja_sp'): Promise<string[]> {
  const result = await agentQuery(
    `SELECT table_name FROM sys.systable WHERE user_name(creator) = '${schema}' AND table_type IN ('BASE', 'VIEW') ORDER BY table_name`,
    1000
  )
  return result.rows.map(r => String(r[0]))
}
