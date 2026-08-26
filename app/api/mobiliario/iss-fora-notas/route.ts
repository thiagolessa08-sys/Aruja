import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")
const LOCAL_LABEL = 'Arujá' // mesmo rótulo especial de iss-fora-prestadores/IssForaMunicipio

export interface NotaFiscalItem {
  cd: number; numero: string; serie: string; dtEmissao: string
  vlServicos: number; vlImposto: number; aliquota: number
}

// Mesma normalização/classificação de município usada em iss-fora-prestadores/iss-fora-municipio.
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

// Drill de "notas" dentro do card ISS Prestador de Fora do Município: dado um prestador já
// listado por /api/mobiliario/iss-fora-prestadores para um município (mesmo cnpj/município/
// período), lista as NFS-e individuais que compõem aquele qt/iss — TOP N mais recentes
// primeiro, mesmo teto de app/api/mobiliario/nfse-consulta. Reaplica exatamente o mesmo
// filtro de município (inclusive o caso especial "Arujá", que usa as variantes de nm_mun que
// normalizam para local, já que não há grafia única pra igualdade direta) para que a soma das
// notas devolvidas bata com o qt/iss já mostrados no ranking — validado ao vivo: CNPJ
// 04052108000189 em "São Paulo" = 8539 notas / R$10.048.479,68, idêntico ao ranking.
async function notasDoPrestador(cnpj: string, municipio: string, top: number, ano?: number, mes?: number): Promise<NotaFiscalItem[]> {
  return cached(`iss:foraNotas:${municipio}:${cnpj}:${top}:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    let filtroMun: string
    if (municipio === LOCAL_LABEL) {
      const rMun = await agentQuery(`
        SELECT nm_mun
        FROM ${S}.tb_dsod_nfse
        WHERE ic_situacao_nota_fiscal = '1' AND no_cpf_cnpj = '${esc(cnpj)}'${filtroData(ano, mes)}
        GROUP BY nm_mun`, 5000)
      const variantes = rMun.rows
        .map(r => String(r[0] ?? '').trim())
        .filter(nm => nm && classificar(nm) === 'local')
      if (!variantes.length) return []
      filtroMun = `LTRIM(RTRIM(nm_mun)) IN (${variantes.map(v => `'${esc(v)}'`).join(',')})`
    } else {
      filtroMun = `LTRIM(RTRIM(nm_mun)) = '${esc(municipio)}'`
    }
    const r = await agentQuery(`
      SELECT TOP ${top} cd_nfse, no_nfse, no_serie, DATEFORMAT(dt_emissao,'yyyy-mm-dd') dt_emissao,
        vl_servicos, vl_imposto, pc_aliquota
      FROM ${S}.tb_dsod_nfse
      WHERE ic_situacao_nota_fiscal = '1' AND no_cpf_cnpj = '${esc(cnpj)}' AND ${filtroMun}${filtroData(ano, mes)}
      ORDER BY dt_emissao DESC`, top)
    return r.rows.map(row => ({
      cd: num(row[0]),
      numero: String(row[1] ?? '').trim(),
      serie: String(row[2] ?? '').trim(),
      dtEmissao: String(row[3] ?? '').slice(0, 10),
      vlServicos: num(row[4]),
      vlImposto: num(row[5]),
      aliquota: num(row[6]),
    }))
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const cnpj = (sp.get('cnpj') || '').trim()
    const municipio = sp.get('municipio')
    if (!cnpj) return NextResponse.json({ error: 'cnpj obrigatório' }, { status: 400 })
    if (!municipio) return NextResponse.json({ error: 'municipio obrigatório' }, { status: 400 })
    const top = Math.min(150, Math.max(5, Number(sp.get('top')) || 50))
    const ano = Number(sp.get('ano')) || undefined
    const mes = Number(sp.get('mes')) || undefined
    return NextResponse.json({ itens: await notasDoPrestador(cnpj, municipio, top, ano, mes) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
