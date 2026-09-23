import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Mesma lógica de app/api/mobiliario/iss-fora-municipio/route.ts (nm_mun é texto livre, com
// dezenas de grafias/erros de digitação pra "Arujá") — duplicada aqui em vez de compartilhada
// porque cada rota deste módulo já é auto-contida (mesmo padrão de esc/num repetidos).
function normalizarMunicipio(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}
function classificarMunicipio(raw: unknown): 'local' | 'fora' | null {
  const norm = normalizarMunicipio(raw)
  if (!norm) return null
  if (norm.includes('GUARUJA')) return 'fora'
  return norm.includes('ARUJA') ? 'local' : 'fora'
}

// Detalhe (lista de tomadores) do resumo em /api/mobiliario/iss-tomador-ccm-crc — só o
// bucket "com" (CCM ou CRC vinculado); o "sem" é o grosso da população e não tem valor de
// drill (é só "todo o resto").
async function detalhe(tipo: 'ccm' | 'crc') {
  return cached(`issTomadorCcmCrc:detalhe:${tipo}`, TTL_15MIN, async () => {
    // O lookup por no_cpf_cnpj é pré-agregado ANTES de juntar com as notas — tb_dsod_contribuinte
    // não é único por no_cpf_cnpj, e um JOIN direto multiplicaria as linhas de nfse, inflando
    // qtNotas/vlServicos (mesmo problema já corrigido no resumo).
    const lookup = tipo === 'ccm'
      ? `SELECT cp.no_cpf_cnpj, MAX(mob.cd_contr_mob) codigo
         FROM ${S}.tb_dsod_contribuinte cp
         JOIN ${S}.tb_dsod_contribuinte_mobiliario mob ON mob.cd_contr = cp.cd_contr AND mob.cd_contr_mob > 0
         GROUP BY cp.no_cpf_cnpj`
      : `SELECT cp.no_cpf_cnpj, MAX(ct.no_crc_profissional) codigo
         FROM ${S}.tb_dsod_contribuinte cp
         JOIN ${S}.tb_dsod_contadores ct ON ct.cd_contr = cp.cd_contr AND ct.no_crc_profissional IS NOT NULL
         GROUP BY cp.no_cpf_cnpj`
    const r = await agentQuery(`SELECT TOP 600 n.no_cpf_cnpj, MAX(n.nm_rsocial) nome, MAX(lk.codigo) codigo,
        COUNT(DISTINCT n.cd_nfse) qtNotas, SUM(n.vl_servicos) vlServicos
      FROM ${S}.tb_dsod_nfse n
      JOIN (${lookup}) lk ON lk.no_cpf_cnpj = n.no_cpf_cnpj
      WHERE n.ic_situacao_nota_fiscal = '1' AND n.no_cpf_cnpj IS NOT NULL AND n.no_cpf_cnpj <> ''
      GROUP BY n.no_cpf_cnpj
      ORDER BY vlServicos DESC`, 600)

    const cpfCnpjs = r.rows.map(row => String(row[0] ?? '').trim()).filter(Boolean)
    // Classifica cada tomador como "do município" ou "de fora" pelo nm_mun das próprias notas
    // (a pedido do usuário — mesma convenção/heurística de iss-fora-municipio, mas aqui é o
    // município do TOMADOR, não do prestador). Um tomador pode ter notas com grafias
    // diferentes de município (erro de digitação, mudança de endereço); decide por maioria
    // das notas classificáveis. Restrito aos 600 já selecionados acima — pra população
    // completa esse cruzamento (cpf_cnpj × nm_mun) passa das 5.000 linhas do agente.
    const municipioMap = new Map<string, { local: number; fora: number }>()
    if (cpfCnpjs.length) {
      const inList = cpfCnpjs.map(c => `'${esc(c)}'`).join(',')
      const rMun = await agentQuery(`SELECT no_cpf_cnpj, nm_mun, COUNT(*) qt
        FROM ${S}.tb_dsod_nfse
        WHERE ic_situacao_nota_fiscal = '1' AND no_cpf_cnpj IN (${inList})
        GROUP BY no_cpf_cnpj, nm_mun`, 5000)
      for (const row of rMun.rows) {
        const cpf = String(row[0] ?? '').trim()
        const cls = classificarMunicipio(row[1])
        if (cls === null) continue
        const qt = num(row[2])
        const cur = municipioMap.get(cpf) ?? { local: 0, fora: 0 }
        cur[cls] += qt
        municipioMap.set(cpf, cur)
      }
    }

    return r.rows.map(row => {
      const cpfCnpj = String(row[0] ?? '').trim()
      const mun = municipioMap.get(cpfCnpj)
      const municipio: 'local' | 'fora' | null = !mun ? null : mun.local >= mun.fora ? 'local' : 'fora'
      return {
        cpfCnpj,
        nome: String(row[1] ?? '').trim(),
        codigo: String(row[2] ?? '').trim(),
        qtNotas: num(row[3]),
        vlServicos: num(row[4]),
        municipio,
      }
    })
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const tipo = req.nextUrl.searchParams.get('tipo')
    if (tipo !== 'ccm' && tipo !== 'crc') return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
    const itens = await detalhe(tipo)
    return NextResponse.json({ tipo, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
