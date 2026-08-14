import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")
const LOCAL_LABEL = 'Arujá' // rótulo usado no gráfico único do card IssForaMunicipio

export interface PrestadorForaItem { cnpj: string; nome: string; qt: number; iss: number }

// Mesma normalização/classificação de município do prestador usada em iss-fora-municipio.
function normalizarMunicipio(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}
function classificar(raw: unknown): 'local' | 'fora' | null {
  const norm = normalizarMunicipio(raw)
  if (!norm) return null
  if (norm.includes('GUARUJA')) return 'fora'
  return norm.includes('ARUJA') ? 'local' : 'fora'
}

function filtroData(ano?: number, mes?: number): string {
  return ano ? ` AND YEAR(dt_emissao) = ${ano}${mes ? ` AND MONTH(dt_emissao) <= ${mes}` : ''}` : ''
}

function montarItens(rows: unknown[][]): PrestadorForaItem[] {
  return rows
    .map(row => ({
      cnpj: String(row[0] ?? '').trim(),
      nome: String(row[1] ?? '').trim().replace(/^[^A-Za-zÀ-ÿ0-9]+/, '') || 'Prestador não identificado',
      qt: num(row[2]),
      iss: num(row[3]),
    }))
    .filter(x => x.iss > 0)
    .sort((a, b) => b.iss - a.iss)
}

// Drill do gráfico único "ISS Prestador de Fora do Município" (card IssForaMunicipio) →
// ranking dos prestadores de UM item clicado (um município "de fora", ou "Arujá" — o local).
// Mesma fonte/tabela de iss-fora-municipio (tb_dsod_nfse) — diferente de iss-prestadores
// (que usa o motor de guias + cadastro mobiliário local), aqui o prestador é identificado só
// pelos dados da própria NFS-e (no_cpf_cnpj/nm_rsocial). Agrupa por CNPJ com MAX(nm_rsocial)
// — a razão social às vezes varia entre notas do mesmo CNPJ (revisões/typos de quem emite).
async function prestadoresDoMunicipio(municipio: string, top: number, ano?: number, mes?: number): Promise<PrestadorForaItem[]> {
  return cached(`iss:foraPrestadores:${municipio}:${top}:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    // Caso "Arujá" (local): nm_mun é texto livre com várias grafias (mesmo problema descrito
    // em iss-fora-municipio) — não dá pra filtrar por igualdade direta. 2 passos: 1) pega as
    // grafias de nm_mun do período que normalizam para "local"; 2) filtra por elas com IN(),
    // que fica bem menor que o total de municípios distintos (evita o teto de 5000 linhas do
    // agente na consulta agrupada por CNPJ).
    if (municipio === LOCAL_LABEL) {
      const rMun = await agentQuery(`
        SELECT nm_mun
        FROM ${S}.tb_dsod_nfse
        WHERE ic_situacao_nota_fiscal = '1'${filtroData(ano, mes)}
        GROUP BY nm_mun`, 5000)
      const variantes = rMun.rows
        .map(r => String(r[0] ?? '').trim())
        .filter(nm => nm && classificar(nm) === 'local')
      if (!variantes.length) return []
      const inList = variantes.map(v => `'${esc(v)}'`).join(',')
      const r = await agentQuery(`
        SELECT TOP ${top} no_cpf_cnpj cnpj, MAX(nm_rsocial) nome, COUNT(*) qt, SUM(vl_imposto) iss
        FROM ${S}.tb_dsod_nfse
        WHERE ic_situacao_nota_fiscal = '1' AND LTRIM(RTRIM(nm_mun)) IN (${inList})${filtroData(ano, mes)}
        GROUP BY no_cpf_cnpj
        ORDER BY iss DESC`, top + 10)
      return montarItens(r.rows)
    }

    const r = await agentQuery(`
      SELECT TOP ${top} no_cpf_cnpj cnpj, MAX(nm_rsocial) nome, COUNT(*) qt, SUM(vl_imposto) iss
      FROM ${S}.tb_dsod_nfse
      WHERE ic_situacao_nota_fiscal = '1' AND LTRIM(RTRIM(nm_mun)) = '${esc(municipio)}'${filtroData(ano, mes)}
      GROUP BY no_cpf_cnpj
      ORDER BY iss DESC`, top + 10)
    return montarItens(r.rows)
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
