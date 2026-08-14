import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const COD_ISS = [3, 7, 8, 33, 70, 301, 302, 303, 304, 572] // CODIGOS.iss em lib/tributos.ts
const esc = (s: string) => s.replace(/'/g, "''")

export interface PrestadorItem { cd: number; nome: string; cnpjCpf: string; qt: number; valor: number }

// Ranking dos prestadores de serviço (empresas do cadastro mobiliário) que mais geraram
// ISS/ISSQN lançado no período — mesma ponte g.cd_origem = tb_dsod_contribuinte_mobiliario
// .cd_contr_mob usada em iss-segmento, + tb_dsod_contribuinte (via cd_contr) para nome/
// CNPJ-CPF (nm_rsocial/no_cpf_cnpj), mesmo padrão do proprietário em /api/itbi/imovel.
// Ao contrário de iss-segmento, aqui o JOIN com o cadastro é intencionalmente obrigatório
// (INNER): só faz sentido rankear um prestador identificado — guias sem vínculo com o
// cadastro (mesmo gap de cobertura descrito em iss-segmento) ficam de fora do ranking.
// `segmento` (opcional) drilla o ranking para dentro de um ds_grupo específico — usado pelo
// drill "ISS por Segmento → Top Prestadores" do card IssSegmentoPrestador. O valor especial
// "Não classificado" (mesmo rótulo usado em iss-segmento) cai para ds_grupo em branco/nulo
// dos prestadores que TÊM vínculo cadastral (a parcela sem vínculo nenhum, que também compõe
// "Não classificado" em iss-segmento, não é rankeável aqui — não há prestador identificado).
function filtroSegmento(segmento?: string): string {
  if (!segmento) return ''
  if (segmento === 'Não classificado') return ` AND (m.ds_grupo IS NULL OR LTRIM(RTRIM(m.ds_grupo)) = '')`
  return ` AND LTRIM(RTRIM(m.ds_grupo)) = '${esc(segmento)}'`
}

async function topPrestadores(top: number, ano?: number, mes?: number, segmento?: string): Promise<PrestadorItem[]> {
  return cached(`iss:topPrestadores:${top}:${ano ?? ''}:${mes ?? ''}:${segmento ?? ''}`, TTL_15MIN, async () => {
    const filtroAno = ano ? ` AND g.no_exercicio_lancamento = ${ano}` : ''
    const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
    const r = await agentQuery(`
      SELECT TOP ${top} m.cd_contr_mob cd, cp.nm_rsocial nome, cp.no_cpf_cnpj cnpj,
             COUNT(DISTINCT g.cd_guia) qt, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_contribuinte_mobiliario m ON m.cd_contr_mob = g.cd_origem
      LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${COD_ISS.join(',')}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')${filtroAno}${filtroMes}${filtroSegmento(segmento)}
      GROUP BY m.cd_contr_mob, cp.nm_rsocial, cp.no_cpf_cnpj
      ORDER BY vl DESC`, top + 10)
    return r.rows
      .map(row => ({
        cd: num(row[0]),
        nome: String(row[1] ?? '').trim() || `Prestador ${num(row[0])}`,
        cnpjCpf: String(row[2] ?? '').trim(),
        qt: num(row[3]),
        valor: num(row[4]),
      }))
      .filter(x => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const top = Math.min(50, Math.max(5, Number(sp.get('top')) || 20))
    const ano = Number(sp.get('ano')) || undefined
    const mes = Number(sp.get('mes')) || undefined
    const segmento = sp.get('segmento') || undefined
    return NextResponse.json({ itens: await topPrestadores(top, ano, mes, segmento) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
