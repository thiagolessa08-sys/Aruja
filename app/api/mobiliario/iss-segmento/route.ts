import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const COD_ISS = [3, 7, 8, 33, 70, 301, 302, 303, 304, 572] // CODIGOS.iss em lib/tributos.ts

// ISS/ISSQN lançado por segmento (ds_grupo) da empresa vinculada à guia — mesma ponte
// g.cd_origem = tb_dsod_contribuinte_mobiliario.cd_contr_mob usada em tfe-segmento. Ao
// contrário do TFE (cobertura ~100%), boa parte do ISS não bate no cadastro mobiliário
// (~35%: prestadores sem vínculo/exercícios antigos) — por isso o LEFT JOIN aqui é
// essencial: sem ele a soma dos segmentos ficaria bem abaixo do lançado oficial. Guias sem
// match (ou ds_grupo em branco) caem em "Não classificado", assim como no TFE.
async function issPorSegmento(ano?: number, mes?: number): Promise<{ nome: string; valor: number }[]> {
  return cached(`iss:porSegmento:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    const filtroAno = ano ? ` AND g.no_exercicio_lancamento = ${ano}` : ''
    const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
    const r = await agentQuery(`
      SELECT m.ds_grupo grupo, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      LEFT JOIN ${S}.tb_dsod_contribuinte_mobiliario m ON m.cd_contr_mob = g.cd_origem
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${COD_ISS.join(',')}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')${filtroAno}${filtroMes}
      GROUP BY m.ds_grupo`, 200)
    return r.rows
      .map(row => ({ nome: String(row[0] ?? '').trim() || 'Não classificado', valor: num(row[1]) }))
      .filter(x => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 9)
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || undefined
    const mes = Number(sp.get('mes')) || undefined
    return NextResponse.json({ porSegmento: await issPorSegmento(ano, mes) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
