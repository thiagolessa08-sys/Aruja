import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const COD_ISS = [3, 7, 8, 33, 70, 301, 302, 303, 304, 572] // CODIGOS.iss em lib/tributos.ts

export interface AnoIss { ano: number; lancado: number }

// Drill do ranking "Top Prestadores de ISS" (item cd_contr_mob) — ISS/ISSQN lançado do
// prestador, ano a ano. Mesma ponte/regras de lançado oficial de iss-prestadores (guia →
// parcela → movimento, cd_tipo_movimento 1/2/3, no_parcela<>0, fora de Recalculo/Validacao).
// `mes` (opcional) acumula até aquele mês em todos os anos, mesma convenção do PainelTributo.
async function serieDoPrestador(cd: number, mes?: number): Promise<AnoIss[]> {
  return cached(`iss:prestadorSerie:${cd}:${mes ?? ''}`, TTL_15MIN, async () => {
    const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
    const r = await agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_contribuinte_mobiliario m ON m.cd_contr_mob = g.cd_origem
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${COD_ISS.join(',')}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND m.cd_contr_mob = ${cd}${filtroMes}
      GROUP BY g.no_exercicio_lancamento
      ORDER BY ex`, 60)
    return r.rows
      .map(row => ({ ano: num(row[0]), lancado: num(row[1]) }))
      .filter(x => x.ano >= 2005 && x.ano <= 2035 && x.lancado > 0)
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const cd = Number(sp.get('cd'))
    if (!cd) return NextResponse.json({ error: 'cd obrigatório' }, { status: 400 })
    const mes = Number(sp.get('mes')) || undefined
    return NextResponse.json({ serie: await serieDoPrestador(cd, mes) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
