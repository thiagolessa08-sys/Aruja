import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

const FAIXAS_OK = new Set(['um', 'dois', 'tresCinco', 'seisMais', 'abaixoVenal'])

// Detalhe (lista de imóveis) de uma faixa do card "Imóveis mais transmitidos" — a agregação
// original (/api/itbi/ranking-imovel) só devolve contagens por faixa, sem a identidade dos
// imóveis; esta rota reaproveita a mesma base (tb_dsod_itbi + tb_dsod_itbi_imovel_urbano)
// filtrando por faixa, pra alimentar o painel de drill ao clicar num KPI da faixa.
async function transmissoesFaixa(faixa: string, ano: number | null, mes: number | null) {
  const filtroData = ano ? ` AND YEAR(it.dt_lancamento) = ${ano}${mes ? ` AND MONTH(it.dt_lancamento) <= ${mes}` : ''}` : ''
  return cached(`itbiFaixa:${faixa}:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    if (faixa === 'abaixoVenal') {
      // Mesma condição da contagem oficial (abaixoVenal) em ranking-imovel: agrupa por
      // imóvel (COUNT DISTINCT ali, GROUP BY aqui) pra não duplicar quando o mesmo imóvel
      // tem mais de uma transmissão qualificando.
      const r = await agentQuery(`SELECT TOP 600 iiu.cd_imovel_urbano, MAX(it.vl_venal) venal, MAX(it.vl_aquisicao_original) aquisicao,
          i.no_inscricao_imovel, c.ds_endereco, c.nm_bairro, MAX(it.cd_itbi) idItbi
        FROM ${S}.tb_dsod_itbi it
        JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
        LEFT JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = iiu.cd_imovel_urbano
        LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
        WHERE it.vl_total > 0 AND it.vl_venal > 0 AND it.vl_aquisicao_original <= it.vl_venal${filtroData}
        GROUP BY iiu.cd_imovel_urbano, i.no_inscricao_imovel, c.ds_endereco, c.nm_bairro
        ORDER BY venal DESC`, 600)
      return r.rows.map(row => ({
        cd: num(row[0]), venal: num(row[1]), aquisicao: num(row[2]),
        inscricao: String(row[3] ?? '').trim(),
        endereco: `${String(row[4] ?? '').trim()}${String(row[5] ?? '').trim() ? ' — ' + String(row[5]).trim() : ''}`,
        idItbi: num(row[6]),
      }))
    }
    const having = faixa === 'um' ? '= 1' : faixa === 'dois' ? '= 2' : faixa === 'tresCinco' ? 'BETWEEN 3 AND 5' : '>= 6'
    const r = await agentQuery(`SELECT TOP 600 iiu.cd_imovel_urbano, COUNT(DISTINCT it.cd_itbi) qt, SUM(it.vl_venal) venal,
        i.no_inscricao_imovel, c.ds_endereco, c.nm_bairro, MAX(it.cd_itbi) idItbi
      FROM ${S}.tb_dsod_itbi it
      JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
      LEFT JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = iiu.cd_imovel_urbano
      LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
      WHERE it.vl_total > 0${filtroData}
      GROUP BY iiu.cd_imovel_urbano, i.no_inscricao_imovel, c.ds_endereco, c.nm_bairro
      HAVING COUNT(DISTINCT it.cd_itbi) ${having}
      ORDER BY qt DESC`, 600)
    return r.rows.map(row => ({
      cd: num(row[0]), qt: num(row[1]), venal: num(row[2]),
      inscricao: String(row[3] ?? '').trim(),
      endereco: `${String(row[4] ?? '').trim()}${String(row[5] ?? '').trim() ? ' — ' + String(row[5]).trim() : ''}`,
      idItbi: num(row[6]),
    }))
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const faixa = req.nextUrl.searchParams.get('faixa') || ''
    if (!FAIXAS_OK.has(faixa)) return NextResponse.json({ error: 'faixa inválida' }, { status: 400 })
    const ano = Number(req.nextUrl.searchParams.get('ano')) || null
    const mes = Number(req.nextUrl.searchParams.get('mes')) || null
    const itens = await transmissoesFaixa(faixa, ano, mes)
    return NextResponse.json({ faixa, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
