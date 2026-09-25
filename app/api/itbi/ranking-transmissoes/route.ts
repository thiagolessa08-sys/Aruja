import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

interface TransmissaoItem { cdItbi: number; data: string; dtVencimento: string; natureza: string; valorVenal: number; valorTransacao: number; imposto: number }

// Drill de 2º nível do relatório de ITBI (a pedido do usuário, mesmo padrão do drill de
// imóveis no relatório de IPTU) — pro ranking "Imóveis mais transmitidos", imóveis com mais de
// 1 transmissão (qt > 1) ganham a lista de CADA transmissão individual. Busca em lote pra
// todos os ids pedidos de uma vez (não 1 query por imóvel). Respeita o mesmo filtro de ano/mês
// do ranking (ranking-imovel/route.ts) pra a soma das transmissões bater com o `qt` do pai.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const idsRaw = req.nextUrl.searchParams.get('ids') ?? ''
    const ids = idsRaw.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
    if (!ids.length) return NextResponse.json({ itens: {} })
    const ano = Number(req.nextUrl.searchParams.get('ano')) || null
    const mes = Number(req.nextUrl.searchParams.get('mes')) || null
    const filtroData = ano ? ` AND YEAR(it.dt_lancamento) = ${ano}${mes ? ` AND MONTH(it.dt_lancamento) <= ${mes}` : ''}` : ''
    const idsIn = ids.join(',')

    const [itbisR, impR] = await Promise.all([
      agentQuery(`SELECT iiu.cd_imovel_urbano, it.cd_itbi, DATEFORMAT(it.dt_transacao,'yyyy-mm-dd') dt,
          DATEFORMAT(it.dt_vencimento,'yyyy-mm-dd') dt_venc, it.ds_natureza_transacao nat,
          it.vl_venal, it.vl_aquisicao_original valor_transacao
        FROM ${S}.tb_dsod_itbi it
        JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
        WHERE it.vl_total > 0${filtroData} AND iiu.cd_imovel_urbano IN (${idsIn})`, 3000),
      agentQuery(`SELECT g.cd_origem cd_itbi, SUM(pm.vl_movimento) imposto
        FROM ${S}.tb_dsod_guias g
        JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = g.cd_origem
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo = 10 AND iiu.cd_imovel_urbano IN (${idsIn})
          AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
          AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        GROUP BY g.cd_origem`, 3000),
    ])

    const impMap = new Map<number, number>()
    for (const r of impR.rows) impMap.set(num(r[0]), num(r[1]))

    const porImovel = new Map<number, TransmissaoItem[]>()
    for (const r of itbisR.rows) {
      const cd = num(r[0])
      const cdItbi = num(r[1])
      const item = {
        cdItbi,
        data: String(r[2] ?? '').slice(0, 10),
        dtVencimento: String(r[3] ?? '').slice(0, 10),
        natureza: String(r[4] ?? '').trim(),
        valorVenal: num(r[5]),
        valorTransacao: num(r[6]),
        imposto: impMap.get(cdItbi) ?? 0,
      }
      const lista = porImovel.get(cd) ?? []
      lista.push(item)
      porImovel.set(cd, lista)
    }

    const itens: Record<string, TransmissaoItem[]> = {}
    for (const [cd, lista] of porImovel) {
      itens[String(cd)] = lista.sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : 0)) // mais recente primeiro, igual ao Consultar Imóvel
    }
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
