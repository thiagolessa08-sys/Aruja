import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { formaPagamentoIptu } from '@/lib/tributo-engine'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

async function resumo(ano: number) {
  return cached(`iptuResumo:${ano}`, TTL_15MIN, async () => {
    const [sitR, tcaR, itbiR, empR, semTcaR, semIptuR, forma] = await Promise.all([
      // Situação da guia + total de imóveis com IPTU no ano
      agentQuery(`SELECT ds_situacao, COUNT(DISTINCT cd_origem) FROM ${S}.tb_dsod_guias WHERE cd_tributo IN (1,25) AND no_exercicio_lancamento=${ano} GROUP BY ds_situacao`, 20),
      agentQuery(`SELECT COUNT(DISTINCT cd_origem) FROM ${S}.tb_dsod_guias WHERE cd_tributo=67 AND no_exercicio_lancamento=${ano}`, 1),
      agentQuery(`SELECT COUNT(DISTINCT cd_imovel_urbano) FROM ${S}.tb_dsod_itbi_imovel_urbano`, 1),
      agentQuery(`SELECT COUNT(DISTINCT cd_imovel_urbano) FROM ${S}.tb_dsod_contribuinte_mob_fisico`, 1),
      // IPTU sem TCA (imóveis com IPTU no ano que não têm TCA no ano)
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g WHERE g.cd_tributo IN (1,25) AND g.no_exercicio_lancamento=${ano} AND g.cd_origem NOT IN (SELECT t.cd_origem FROM ${S}.tb_dsod_guias t WHERE t.cd_tributo=67 AND t.no_exercicio_lancamento=${ano})`, 1),
      // TCA sem IPTU
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g WHERE g.cd_tributo=67 AND g.no_exercicio_lancamento=${ano} AND g.cd_origem NOT IN (SELECT t.cd_origem FROM ${S}.tb_dsod_guias t WHERE t.cd_tributo IN (1,25) AND t.no_exercicio_lancamento=${ano})`, 1),
      formaPagamentoIptu(),
    ])

    const situacao = sitR.rows.map(r => ({ situacao: String(r[0] ?? '').trim() || '—', qt: num(r[1]) })).sort((a, b) => b.qt - a.qt)
    const comIptu = situacao.reduce((s, x) => s + x.qt, 0)
    const fp = forma.get(ano) ?? { cotaUnica: 0, parcelado: 0, pagoParcial: 0, emAberto: 0 }
    const pagamento = [
      { status: 'Cota única', qt: fp.cotaUnica, cor: '#1fa463' },
      { status: 'Parcelado', qt: fp.parcelado, cor: '#283e93' },
      { status: 'Pago parcial', qt: fp.pagoParcial, cor: '#e8962e' },
      { status: 'Em aberto', qt: fp.emAberto, cor: '#d64545' },
    ]

    return {
      resumo: {
        comIptu,
        comItbi: num(itbiR.rows[0]?.[0]),
        comTca: num(tcaR.rows[0]?.[0]),
        comEmpresa: num(empR.rows[0]?.[0]),
        iptuSemTca: num(semTcaR.rows[0]?.[0]),
        tcaSemIptu: num(semIptuR.rows[0]?.[0]),
      },
      situacao,
      pagamento,
    }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ano = Number(req.nextUrl.searchParams.get('ano')) || new Date().getFullYear()
    return NextResponse.json(await resumo(ano))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
