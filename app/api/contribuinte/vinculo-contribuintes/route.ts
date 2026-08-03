import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'

// Colunas 0/1 de tb_dsod_contribuinte_pessoa por vínculo (mesma origem do gráfico
// "Vínculos do Contribuinte" em /api/contribuinte/graficos) — whitelist p/ evitar
// injeção, já que o nome da coluna vai direto no WHERE.
const CAMPOS_VALIDOS = new Set([
  'ic_pessoa_contribuinte_mobiliario',
  'ic_pessoa_proprietario',
  'ic_pessoa_itbi',
  'ic_pessoa_socio',
  'ic_tomador_servico',
  'ic_pessoa_responsavel_tributario',
])

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const campo = sp.get('campo') ?? ''
    if (!CAMPOS_VALIDOS.has(campo)) return NextResponse.json({ error: 'campo inválido' }, { status: 400 })
    const q = (sp.get('q') || '').trim().toUpperCase().replace(/'/g, "''")

    const filtroQ = q ? ` AND (c.nm_rsocial LIKE '%${q}%' OR c.no_cpf_cnpj LIKE '%${q}%')` : ''
    const r = await agentQuery(`
      SELECT TOP 200 c.cd_contr, c.nm_rsocial, c.no_cpf_cnpj
      FROM ${SCHEMA}.tb_dsod_contribuinte_pessoa cp
      JOIN ${SCHEMA}.tb_dsod_contribuinte c ON c.cd_contr = cp.cd_contr
      WHERE cp.${campo} = 1${filtroQ}
      ORDER BY c.nm_rsocial`, 200)

    const itens = r.rows.map(row => ({
      cd: Number(row[0]) || 0,
      nome: String(row[1] ?? '').trim(),
      doc: String(row[2] ?? '').trim(),
    }))
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
