import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// Vínculos mobiliários (empresa no endereço) e imobiliários (proprietário PJ) dos imóveis
// com lançamento de ISSCC no exercício. 3 consultas simples (padrão do Resumo do IPTU).
// mes: acumulado até o mês (YTD) — mesma convenção do bucketsIssccAteMes, via
// MONTH(p.dt_vencimento) <= mes (join com tb_dsod_parcelas; COUNT(DISTINCT) evita fan-out).
async function vinculos(ano: number, mes: number | null) {
  return cached(`issccVinculos:${ano}:${mes ?? ''}`, TTL_15MIN, async () => {
    const joinMes = mes ? `JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia` : ''
    const mesW = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
    const base = `FROM ${S}.tb_dsod_guias g ${joinMes} WHERE g.cd_tributo IN (40,17,18) AND g.no_exercicio_lancamento = ${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')${mesW}`
    const [imR, mobR, pjR] = await Promise.all([
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) ${base}`, 1),
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) ${base} AND g.cd_origem IN (SELECT mf.cd_imovel_urbano FROM ${S}.tb_dsod_contribuinte_mob_fisico mf)`, 1),
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${joinMes}
        JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = g.cd_origem
        JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
        WHERE g.cd_tributo IN (40,17,18) AND g.no_exercicio_lancamento = ${ano}
          AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND cp.ic_pessoa = 'J'${mesW}`, 1),
    ])
    return {
      imoveis: num(imR.rows[0]?.[0]),
      comMobiliario: num(mobR.rows[0]?.[0]),
      proprietarioPJ: num(pjR.rows[0]?.[0]),
    }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || new Date().getFullYear()
    const mes = Number(req.nextUrl.searchParams.get('mes')) || null
    return NextResponse.json(await vinculos(ano, mes))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
