import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// TFE (cd_tributo 2002) lançado por segmento (ds_grupo) da empresa — ponte g.cd_origem =
// tb_dsod_contribuinte_mobiliario.cd_contr_mob (validada: cd_origem = cd_devedor p/ TFE).
async function tfePorSegmento(): Promise<{ nome: string; valor: number }[]> {
  return cached('tfe:porSegmento', TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT m.ds_grupo grupo, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_contribuinte_mobiliario m ON m.cd_contr_mob = g.cd_origem
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = 2002 AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY m.ds_grupo`, 200)
    return r.rows
      .map(row => ({ nome: String(row[0] ?? '').trim() || 'Não classificado', valor: num(row[1]) }))
      .filter(x => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 9)
  })
}

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    return NextResponse.json({ porSegmento: await tfePorSegmento() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
