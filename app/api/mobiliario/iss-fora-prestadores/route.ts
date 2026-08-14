import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

export interface PrestadorForaItem { cnpj: string; nome: string; qt: number; iss: number }

// Drill de "ISS Prestador de Fora do Município" (card IssForaMunicipio) → ranking dos
// prestadores de UM município específico (item clicado em "Top municípios de fora").
// Mesma fonte/tabela de iss-fora-municipio (tb_dsod_nfse) — diferente de iss-prestadores
// (que usa o motor de guias + cadastro mobiliário local), aqui o prestador é identificado
// só pelos dados da própria NFS-e (no_cpf_cnpj/nm_rsocial), já que é uma empresa de fora do
// cadastro de Arujá. Agrupa por CNPJ com MAX(nm_rsocial) — a razão social às vezes varia
// entre notas do mesmo CNPJ (revisões/typos de quem emite).
// `municipio` deve ser o valor EXATO retornado em topFora[].nome (mesmo texto agrupado por
// iss-fora-municipio, sem normalização adicional aqui — a normalização já decidiu que essa
// grafia específica cai em "fora" antes de chegar no ranking por município).
async function prestadoresDoMunicipio(municipio: string, top: number, ano?: number, mes?: number): Promise<PrestadorForaItem[]> {
  return cached(`iss:foraPrestadores:${municipio}:${top}:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    const filtroAno = ano ? ` AND YEAR(dt_emissao) = ${ano}${mes ? ` AND MONTH(dt_emissao) <= ${mes}` : ''}` : ''
    const r = await agentQuery(`
      SELECT TOP ${top} no_cpf_cnpj cnpj, MAX(nm_rsocial) nome, COUNT(*) qt, SUM(vl_imposto) iss
      FROM ${S}.tb_dsod_nfse
      WHERE ic_situacao_nota_fiscal = '1' AND LTRIM(RTRIM(nm_mun)) = '${esc(municipio)}'${filtroAno}
      GROUP BY no_cpf_cnpj
      ORDER BY iss DESC`, top + 10)
    return r.rows
      .map(row => ({
        cnpj: String(row[0] ?? '').trim(),
        nome: String(row[1] ?? '').trim().replace(/^[^A-Za-zÀ-ÿ0-9]+/, '') || 'Prestador não identificado',
        qt: num(row[2]),
        iss: num(row[3]),
      }))
      .filter(x => x.iss > 0)
      .sort((a, b) => b.iss - a.iss)
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const municipio = sp.get('municipio')
    if (!municipio) return NextResponse.json({ error: 'municipio obrigatório' }, { status: 400 })
    const top = Math.min(50, Math.max(5, Number(sp.get('top')) || 20))
    const ano = Number(sp.get('ano')) || undefined
    const mes = Number(sp.get('mes')) || undefined
    return NextResponse.json({ itens: await prestadoresDoMunicipio(municipio, top, ano, mes) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
