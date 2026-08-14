import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

export interface Contagem { nome: string; qt: number }
export interface EnquadramentoResp { total: number; porTipo: Contagem[]; porSituacao: Contagem[] }

// NULL e string vazia caem em grupos SQL separados, mas os dois viram o mesmo rótulo
// "Não informado" — soma antes de ordenar pra não duplicar a linha na lista.
function agregarPorNome(rows: unknown[][]): Contagem[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const nome = String(r[0] ?? '').trim() || 'Não informado'
    map.set(nome, (map.get(nome) ?? 0) + num(r[1]))
  }
  return [...map.entries()]
    .map(([nome, qt]) => ({ nome, qt }))
    .filter(x => x.qt > 0)
    .sort((a, b) => b.qt - a.qt)
}

// Mesmo filtro de segmento usado em /api/mobiliario/iss-prestadores — "Não classificado"
// cai pra ds_grupo em branco/nulo (mesmo rótulo do card ISS por Segmento).
function filtroSegmento(segmento: string): string {
  if (segmento === 'Não classificado') return `(ds_grupo IS NULL OR LTRIM(RTRIM(ds_grupo)) = '')`
  return `LTRIM(RTRIM(ds_grupo)) = '${esc(segmento)}'`
}

// Painel "Análise de Enquadramento" — companion do drill de segmento em ISS por Segmento
// (IssSegmentoPrestador): dado um segmento (ds_grupo), quebra as empresas cadastradas
// naquele segmento por tipo de empresa (ds_tipo_empresa: EMPRESA, MEI, AUTÔNOMO, ME, LTDA,
// EPP, EIRELI, SA, ENTIDADES...) e por situação cadastral (ds_situacao: Ativo, Cancelado,
// Suspenso...). É um retrato do CADASTRO atual (tb_dsod_contribuinte_mobiliario), não do
// financeiro — por isso não usa ano/mês (mesma convenção da aba cadastral "Mobiliário",
// que filtra por situação em vez de exercício).
async function enquadramentoDoSegmento(segmento: string): Promise<EnquadramentoResp> {
  return cached(`iss:segEnquadramento:${segmento}`, TTL_15MIN, async () => {
    const cond = filtroSegmento(segmento)
    const [rTipo, rSit] = await Promise.all([
      agentQuery(`SELECT ds_tipo_empresa, COUNT(*) n FROM ${S}.tb_dsod_contribuinte_mobiliario WHERE ${cond} GROUP BY ds_tipo_empresa`, 30),
      agentQuery(`SELECT ds_situacao, COUNT(*) n FROM ${S}.tb_dsod_contribuinte_mobiliario WHERE ${cond} GROUP BY ds_situacao`, 30),
    ])
    const porTipo = agregarPorNome(rTipo.rows)
    const porSituacao = agregarPorNome(rSit.rows)
    const total = porTipo.reduce((s, t) => s + t.qt, 0)
    return { total, porTipo, porSituacao }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const segmento = (req.nextUrl.searchParams.get('segmento') || '').trim()
    if (!segmento) return NextResponse.json({ error: 'segmento obrigatório' }, { status: 400 })
    return NextResponse.json(await enquadramentoDoSegmento(segmento))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
