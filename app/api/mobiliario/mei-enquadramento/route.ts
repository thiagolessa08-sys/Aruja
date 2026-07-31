import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

interface MeiEnquadramento {
  totalCadastrados: number
  porExercicio: { exercicio: number; lancado: number }[]
}

// Compara o cadastro (empresas enquadradas como MEI, situação Ativo) com o efetivamente
// lançado de TFE (cd_tributo 2002) por exercício — ponte g.cd_origem = cd_contr_mob,
// mesma validada em tfe-segmento. `mes` (opcional) acumula as parcelas com vencimento até
// aquele mês, mesma convenção do PainelTributo — permite comparar o exercício em curso de
// forma justa com exercícios fechados.
async function meiEnquadramento(mes?: number): Promise<MeiEnquadramento> {
  return cached(`mei:enquadramento:${mes ?? ''}`, TTL_15MIN, async () => {
    const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
    const [rCad, rLanc] = await Promise.all([
      agentQuery(`
        SELECT COUNT(*) qt FROM ${S}.tb_dsod_contribuinte_mobiliario
        WHERE ds_tipo_empresa = 'MEI' AND ds_situacao = 'Ativo'`, 5),
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, COUNT(DISTINCT m.cd_contr_mob) qt
        FROM ${S}.tb_dsod_contribuinte_mobiliario m
        JOIN ${S}.tb_dsod_guias g ON g.cd_origem = m.cd_contr_mob
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE m.ds_tipo_empresa = 'MEI' AND g.cd_tributo = 2002 AND pm.cd_tipo_movimento IN (1,2,3)
          AND p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')${filtroMes}
        GROUP BY g.no_exercicio_lancamento
        ORDER BY ex DESC`, 20),
    ])
    const totalCadastrados = num(rCad.rows[0]?.[0])
    const porExercicio = rLanc.rows
      .map(row => ({ exercicio: num(row[0]), lancado: num(row[1]) }))
      .filter(x => x.exercicio > 0)
      .slice(0, 5)
      .sort((a, b) => a.exercicio - b.exercicio)
    return { totalCadastrados, porExercicio }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
    return NextResponse.json(await meiEnquadramento(mes))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
