import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

export interface NfseItem {
  cd: number; numero: string; serie: string; dtEmissao: string
  prestador: string; cpfCnpj: string
  vlServicos: number; vlImposto: number; aliquota: number
  situacao: 'normal' | 'cancelada' | ''
  dtCancelamento: string; motivoCancelamento: string
}

// Acompanhamento de NFS-e — consulta individual das notas das quais o ISS se originou
// (tb_dsod_nfse, 4,9 milhões de linhas). Por CNPJ/CPF do prestador (busca exata — a coluna
// já vem formatada) ou por número da nota (não é único globalmente, numeração reinicia por
// prestador — por isso TOP 30 já ordenado por emissão mais recente primeiro).
async function buscar(tipo: string, q: string): Promise<NfseItem[]> {
  let cond: string
  if (tipo === 'numero') {
    const nn = Number(q.replace(/\D/g, ''))
    if (!nn) return []
    cond = `no_nfse = ${nn}`
  } else {
    const qn = q.replace(/\D/g, '')
    if (qn.length < 8) return []
    cond = `no_cpf_cnpj LIKE '%${esc(qn)}%'`
  }
  const r = await agentQuery(`
    SELECT TOP 30 cd_nfse, no_nfse, no_serie, DATEFORMAT(dt_emissao,'yyyy-mm-dd') dt_emissao,
      nm_rsocial, no_cpf_cnpj, vl_servicos, vl_imposto, pc_aliquota, ic_situacao_nota_fiscal,
      DATEFORMAT(dt_cancelamento,'yyyy-mm-dd') dt_canc, ds_motivo_cancelamento
    FROM ${S}.tb_dsod_nfse
    WHERE ${cond}
    ORDER BY dt_emissao DESC`, 30)
  return r.rows.map(row => {
    const sit = String(row[9] ?? '').trim()
    return {
      cd: num(row[0]),
      numero: String(row[1] ?? '').trim(),
      serie: String(row[2] ?? '').trim(),
      dtEmissao: String(row[3] ?? '').slice(0, 10),
      prestador: String(row[4] ?? '').trim() || 'Não identificado',
      cpfCnpj: String(row[5] ?? '').trim(),
      vlServicos: num(row[6]),
      vlImposto: num(row[7]),
      aliquota: num(row[8]),
      situacao: sit === '1' ? 'normal' : sit === '2' ? 'cancelada' : '',
      dtCancelamento: String(row[10] ?? '').slice(0, 10),
      motivoCancelamento: String(row[11] ?? '').trim(),
    }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const tipo = (sp.get('tipo') || '').trim()
    const q = (sp.get('q') || '').trim()
    if (!q) return NextResponse.json({ itens: [] })
    return NextResponse.json({ itens: await buscar(tipo, q) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
