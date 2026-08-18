import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const esc = (s: string) => s.replace(/'/g, "''")

// Motivos válidos (whitelist — mesmos 6 do card "Situação na Receita Federal (RFB)").
const MOTIVOS_VALIDOS = new Set([
  'NaoCadastrado', 'TemDebito', 'CadastroNaoAtivo TemDebito', 'CadastroNaoAtivo', 'SemLicenca', 'LicencaVencida',
])
const MOTIVO_LABEL: Record<string, string> = {
  NaoCadastrado: 'Não cadastrado no município',
  TemDebito: 'Débito em aberto',
  'CadastroNaoAtivo TemDebito': 'Cadastro inativo + débito',
  CadastroNaoAtivo: 'Cadastro inativo',
  SemLicenca: 'Sem licença/alvará',
  LicencaVencida: 'Licença vencida',
}

// Drill do card "Situação na Receita Federal (RFB)": lista de CNPJs/empresas de um dos 3
// buckets (indeferidas/naoIndeferidas/semVerificacao), opcionalmente restrito a um motivo
// específico (só faz sentido dentro de "indeferidas"). rf.cd_contr_mob pode ser -1 (CNPJ
// nunca cadastrado localmente) — tb_dsod_contribuinte_mobiliario TEM uma linha sentinela
// com cd_contr_mob = -1, então sem o "AND rf.cd_contr_mob > 0" no JOIN, todo CNPJ não
// cadastrado casaria com essa linha e herdaria um nome de empresa arbitrário (bug real,
// validado ao vivo). A base tem entradas duplicadas (mesmo CNPJ/motivo repetido em
// diferentes datas de verificação) — GROUP BY deduplica.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const bucket = (sp.get('bucket') || '').trim()
    const motivoRaw = (sp.get('motivo') || '').trim()
    const motivo = MOTIVOS_VALIDOS.has(motivoRaw) ? motivoRaw : ''
    const q = (sp.get('q') || '').trim()

    let cond: string
    if (bucket === 'indeferidas') {
      cond = motivo ? `rf.ic_indeferido = 'S' AND rf.ds_tipo_indeferimento = '${esc(motivo)}'` : `rf.ic_indeferido = 'S'`
    } else if (bucket === 'naoIndeferidas') {
      cond = `rf.ic_indeferido IS NOT NULL AND rf.ic_indeferido <> 'S'`
    } else if (bucket === 'semVerificacao') {
      cond = `rf.ic_indeferido IS NULL`
    } else {
      return NextResponse.json({ error: 'bucket inválido' }, { status: 400 })
    }
    if (q) {
      const qn = q.replace(/\D/g, '')
      const escQ = esc(q.toUpperCase())
      cond += qn.length >= 3
        ? ` AND (rf.no_cnpj LIKE '%${esc(qn)}%' OR cp.nm_rsocial LIKE '%${escQ}%' OR cp.nm_fantasia LIKE '%${escQ}%')`
        : ` AND (cp.nm_rsocial LIKE '%${escQ}%' OR cp.nm_fantasia LIKE '%${escQ}%')`
    }

    const r = await agentQuery(`
      SELECT TOP 200 rf.no_cnpj, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, m.ds_situacao, rf.ds_tipo_indeferimento
      FROM ${S}.tb_dsod_contribuinte_mob_receita_federal rf
      LEFT JOIN ${S}.tb_dsod_contribuinte_mobiliario m ON m.cd_contr_mob = rf.cd_contr_mob AND rf.cd_contr_mob > 0
      LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
      WHERE ${cond}
      GROUP BY rf.no_cnpj, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, m.ds_situacao, rf.ds_tipo_indeferimento
      ORDER BY CASE WHEN cp.nm_rsocial IS NULL THEN 1 ELSE 0 END, cp.nm_rsocial`, 200)

    const itens = r.rows.map(x => {
      const nome = String(x[1] ?? '').trim() || String(x[2] ?? '').trim()
      const motivoCod = String(x[5] ?? '').trim()
      return {
        nome: nome || 'Não identificado',
        cnpj: String(x[3] ?? '').trim() || String(x[0] ?? '').trim(),
        situacao: String(x[4] ?? '').trim(),
        motivo: motivoCod ? (MOTIVO_LABEL[motivoCod] ?? motivoCod) : '',
      }
    })
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
