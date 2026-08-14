import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { detalhe } from '@/lib/mobiliario-empresa'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Busca de empresas do cadastro mobiliário por nome/fantasia ou CNPJ/CPF.
async function buscar(q: string, tipo: string) {
  const qn = q.replace(/\D/g, '')
  const escQ = esc(q.toUpperCase())
  let cond: string
  if (tipo === 'cnpj') cond = `cp.no_cpf_cnpj LIKE '%${esc(qn)}%'`
  else if (tipo === 'nome') cond = `(cp.nm_rsocial LIKE '%${escQ}%' OR cp.nm_fantasia LIKE '%${escQ}%')`
  else cond = /^\d+$/.test(q)
    ? `cp.no_cpf_cnpj LIKE '%${esc(qn)}%'`
    : `(cp.nm_rsocial LIKE '%${escQ}%' OR cp.nm_fantasia LIKE '%${escQ}%')`
  const r = await agentQuery(`SELECT TOP 20 m.cd_contr_mob, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, m.ds_situacao, m.ds_grupo
    FROM ${S}.tb_dsod_contribuinte_mobiliario m
    JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
    WHERE ${cond}`, 20)
  return r.rows.map(x => ({
    cd: num(x[0]), nome: String(x[1] ?? '').trim(), fantasia: String(x[2] ?? '').trim(),
    cnpjCpf: String(x[3] ?? '').trim(), situacao: String(x[4] ?? '').trim(),
    atividade: String(x[5] ?? '').trim() || 'Não informada',
  }))
}

// Drill do gráfico "Empresas por Segmento": lista de empresas de um segmento (ds_grupo),
// respeitando a situação selecionada na tela e uma busca opcional por nome/fantasia.
async function porSegmento(segmento: string, situacao: string, q: string) {
  let cond = `m.ds_grupo = '${esc(segmento)}'`
  if (situacao) cond += ` AND m.ds_situacao = '${esc(situacao)}'`
  const qt = q.trim()
  if (qt) cond += ` AND (cp.nm_rsocial LIKE '%${esc(qt.toUpperCase())}%' OR cp.nm_fantasia LIKE '%${esc(qt.toUpperCase())}%')`
  const r = await agentQuery(`SELECT TOP 200 m.cd_contr_mob, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, m.ds_situacao, m.ds_grupo
    FROM ${S}.tb_dsod_contribuinte_mobiliario m
    JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
    WHERE ${cond}
    ORDER BY cp.nm_rsocial`, 200)
  return r.rows.map(x => ({
    cd: num(x[0]), nome: String(x[1] ?? '').trim(), fantasia: String(x[2] ?? '').trim(),
    cnpjCpf: String(x[3] ?? '').trim(), situacao: String(x[4] ?? '').trim(),
    atividade: String(x[5] ?? '').trim() || 'Não informada',
  }))
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const id = Number(sp.get('id'))
    if (id) return NextResponse.json({ detalhe: await detalhe(id) })
    const segmento = (sp.get('segmento') || '').trim()
    if (segmento) {
      const situacao = (sp.get('situacao') || '').trim()
      const q = (sp.get('q') || '').trim()
      return NextResponse.json({ matches: await porSegmento(segmento, situacao, q) })
    }
    const q = (sp.get('q') || '').trim()
    const tipo = (sp.get('tipo') || '').trim()
    if (q.length < 2) return NextResponse.json({ matches: [] })
    return NextResponse.json({ matches: await buscar(q, tipo) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
