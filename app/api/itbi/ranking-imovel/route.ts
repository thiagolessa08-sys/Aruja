import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// Item 6 — Quantidade de ITBI por imóvel. Ranking dos imóveis mais transmitidos.
// qt = COUNT(DISTINCT cd_itbi) por imóvel; venalTotal = SUM(vl_venal). Enriquecido com
// inscrição/endereço/bairro do imóvel. Distribuição = quantos imóveis têm 1, 2, 3+ ITBIs.
// Respeita o filtro de ano/mês da tela: conta só transmissões com dt_lancamento no
// exercício selecionado (e até o mês, se selecionado) — mesma coluna usada no KPI oficial.
async function ranking(top: number, ano: number | null, mes: number | null) {
  const filtroData = ano ? ` AND YEAR(it.dt_lancamento) = ${ano}${mes ? ` AND MONTH(it.dt_lancamento) <= ${mes}` : ''}` : ''
  return cached(`itbiRankImovel:${top}:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    const [rankR, distR] = await Promise.all([
      agentQuery(`SELECT TOP ${top} iiu.cd_imovel_urbano, COUNT(DISTINCT it.cd_itbi) qt, SUM(it.vl_venal) venal,
          i.no_inscricao_imovel, c.ds_endereco, c.nm_bairro
        FROM ${S}.tb_dsod_itbi it
        JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
        LEFT JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = iiu.cd_imovel_urbano
        LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
        WHERE it.vl_total > 0${filtroData}
        GROUP BY iiu.cd_imovel_urbano, i.no_inscricao_imovel, c.ds_endereco, c.nm_bairro
        ORDER BY qt DESC`, top + 10),
      // Distribuição: nº de imóveis por faixa de transmissões (1, 2, 3-5, 6+)
      agentQuery(`SELECT qt, COUNT(*) imoveis FROM (
          SELECT iiu.cd_imovel_urbano, COUNT(DISTINCT it.cd_itbi) qt
          FROM ${S}.tb_dsod_itbi it
          JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
          WHERE it.vl_total > 0${filtroData}
          GROUP BY iiu.cd_imovel_urbano
        ) t GROUP BY qt`, 200),
    ])

    const itens = rankR.rows.map(r => ({
      cd: num(r[0]), qt: num(r[1]), venal: num(r[2]),
      inscricao: String(r[3] ?? '').trim(),
      endereco: `${String(r[4] ?? '').trim()}${String(r[5] ?? '').trim() ? ' — ' + String(r[5]).trim() : ''}`,
    }))

    // Faixas de distribuição
    const faixas = { um: 0, dois: 0, tresCinco: 0, seisMais: 0 }
    for (const r of distR.rows) {
      const qt = num(r[0]), n = num(r[1])
      if (qt === 1) faixas.um += n
      else if (qt === 2) faixas.dois += n
      else if (qt <= 5) faixas.tresCinco += n
      else faixas.seisMais += n
    }
    return { itens, faixas }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const top = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get('top')) || 20))
    const ano = Number(req.nextUrl.searchParams.get('ano')) || null
    const mes = Number(req.nextUrl.searchParams.get('mes')) || null
    return NextResponse.json(await ranking(top, ano, mes))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
