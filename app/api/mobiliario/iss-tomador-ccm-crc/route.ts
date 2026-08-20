import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// ISS Tomador por CCM/CRC — a pedido do usuário, tentado a partir de tb_dsod_nfse (não das
// tabelas oficiais tb_aux_iss_geral_tomador_CCM/CRC, permission denied -121, ver memória).
// Cruza o tomador da NFS-e (no_cpf_cnpj, que é DISTINTO do prestador — confirmado ao vivo
// comparando nm_rsocial da nota com o nome do prestador via cd_contr_mob_prestador) contra:
// - CCM: tb_dsod_contribuinte_mobiliario (o tomador tem cadastro de contribuinte mobiliário
//   nesta prefeitura, i.e., é também um contribuinte local — não só um cliente de fora).
// - CRC: tb_dsod_contadores (o tomador tem contador com CRC vinculado no cadastro).
// Cadastral, sem filtro de ano/mês (mesmo padrão da Situação na RFB desta mesma tela).
// ⚠️ Cobertura baixa por natureza: a maioria dos tomadores de serviço não são eles mesmos
// contribuintes cadastrados no município (empresas de fora, pessoas físicas avulsas) — não é
// um bug, é o esperado para "quem toma serviço" vs "quem presta/reside" aqui.
async function resumo() {
  return cached('issTomadorCcmCrc:resumo', TTL_15MIN, async () => {
    // O lookup por no_cpf_cnpj é pré-agregado (GROUP BY) ANTES de juntar com os tomadores —
    // tb_dsod_contribuinte não é único por no_cpf_cnpj (há cd_contr duplicados pro mesmo
    // documento), e um JOIN direto multiplicava linhas, inflando total/com_ccm/com_crc.
    const r = await agentQuery(`SELECT COUNT(*) total,
        SUM(CASE WHEN lk.tem_ccm = 1 THEN 1 ELSE 0 END) com_ccm,
        SUM(CASE WHEN lk.tem_crc = 1 THEN 1 ELSE 0 END) com_crc
      FROM (SELECT DISTINCT no_cpf_cnpj FROM ${S}.tb_dsod_nfse WHERE ic_situacao_nota_fiscal = '1' AND no_cpf_cnpj IS NOT NULL AND no_cpf_cnpj <> '') n
      LEFT JOIN (
        SELECT cp.no_cpf_cnpj,
          MAX(CASE WHEN mob.cd_contr_mob > 0 THEN 1 ELSE 0 END) tem_ccm,
          MAX(CASE WHEN ct.no_crc_profissional IS NOT NULL THEN 1 ELSE 0 END) tem_crc
        FROM ${S}.tb_dsod_contribuinte cp
        LEFT JOIN ${S}.tb_dsod_contribuinte_mobiliario mob ON mob.cd_contr = cp.cd_contr AND mob.cd_contr_mob > 0
        LEFT JOIN ${S}.tb_dsod_contadores ct ON ct.cd_contr = cp.cd_contr AND ct.no_crc_profissional IS NOT NULL
        GROUP BY cp.no_cpf_cnpj
      ) lk ON lk.no_cpf_cnpj = n.no_cpf_cnpj`, 1)
    const row = r.rows[0] ?? []
    const total = num(row[0]), comCcm = num(row[1]), comCrc = num(row[2])
    return { total, ccm: { com: comCcm, sem: total - comCcm }, crc: { com: comCrc, sem: total - comCrc } }
  })
}

export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    return NextResponse.json(await resumo())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
