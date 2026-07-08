import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const isData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const proxDia = (s: string) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

async function diario(de: string, ate: string, bairro: string | null) {
  return cached(`iptuDiario:${de}:${ate}:${bairro ?? ''}`, TTL_15MIN, async () => {
    const jb = bairro ? `JOIN ${S}.tb_dsod_imovel_urbano iu ON g.cd_origem=iu.cd_imovel_urbano JOIN ${S}.tb_dsod_cep ce ON iu.cd_cep=ce.cd_cep AND ce.nm_bairro='${bairro.replace(/'/g, "''")}'` : ''
    const r = await agentQuery(`
      SELECT DATEFORMAT(pb.dt_baixa,'yyyy-mm-dd') AS dia, SUM(pm.vl_movimento) AS vl
      FROM ${S}.tb_dsod_guias g ${jb}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (1) AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
        AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND pb.dt_baixa >= '${de}' AND pb.dt_baixa < '${proxDia(ate)}'
      GROUP BY DATEFORMAT(pb.dt_baixa,'yyyy-mm-dd')`, 800)
    return r.rows
      .map(row => ({ dia: String(row[0] ?? '').slice(0, 10), valor: num(row[1]) }))
      .filter(x => isData(x.dia))
      .sort((a, b) => a.dia.localeCompare(b.dia))
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    let de = sp.get('de') || `${ano}-01-01`
    let ate = sp.get('ate') || `${ano}-12-31`
    if (!isData(de)) de = `${ano}-01-01`
    if (!isData(ate)) ate = `${ano}-12-31`
    const dias = await diario(de, ate, sp.get('bairro') || null)
    const total = dias.reduce((s, d) => s + d.valor, 0)
    return NextResponse.json({ de, ate, dias, total })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
