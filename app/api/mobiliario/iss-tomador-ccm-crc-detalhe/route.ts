import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

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
    return r.rows.map(row => ({
      cpfCnpj: String(row[0] ?? '').trim(),
      nome: String(row[1] ?? '').trim(),
      codigo: String(row[2] ?? '').trim(),
      qtNotas: num(row[3]),
      vlServicos: num(row[4]),
    }))
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
