import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const ANO_MIN = 2018

// Acompanhamento de NFS-e — situação cadastral das notas (1 = Normal/válida, 2 = Cancelada;
// mesmo código usado em iss-emitidas-tomadas, que já filtra "= '1'" pro volume de ISS —
// aqui é o inverso: revela quanto do total foi excluído por cancelamento, que hoje fica
// invisível na tela. Mesmo recorte de exercícios (2018 até o corrente) e mesma convenção de
// `mes` (acumulado) do card "Volumes de NFS-e Emitidas e Tomadas".
export interface CanceladaPrestador { cpfCnpj: string; nome: string; codigo: string; qtNotas: number; vlServicos: number }
export interface SituacaoNfse { total: number; normal: number; cancelada: number; porPrestador: CanceladaPrestador[] }

// CCM (Cadastro do Contribuinte Mobiliário) do prestador, quando existe — mesmo lookup já
// usado em iss-tomador-ccm-crc-detalhe (pré-agregado por no_cpf_cnpj ANTES de juntar com as
// notas, já que tb_dsod_contribuinte não é único por no_cpf_cnpj). Aqui é LEFT JOIN (não
// INNER): ao contrário daquele endpoint, que só lista quem TEM CCM, aqui o objetivo é
// auditar TODAS as notas canceladas — CCM sem vínculo aparece em branco, não é descartado
// (cobertura real é baixa: ~2,6% dos prestadores com cancelamento têm CCM, validado ao vivo).
const CCM_LOOKUP = `SELECT cp.no_cpf_cnpj, MAX(mob.cd_contr_mob) codigo
  FROM ${S}.tb_dsod_contribuinte cp
  JOIN ${S}.tb_dsod_contribuinte_mobiliario mob ON mob.cd_contr = cp.cd_contr AND mob.cd_contr_mob > 0
  GROUP BY cp.no_cpf_cnpj`

async function situacaoNfse(mes?: number): Promise<SituacaoNfse> {
  return cached(`nfse:situacao:${mes ?? ''}`, TTL_15MIN, async () => {
    const anoAtual = new Date().getFullYear()
    const filtroMes = mes ? ` AND MONTH(dt_emissao) <= ${mes}` : ''
    const [r, rp] = await Promise.all([
      agentQuery(`
        SELECT ic_situacao_nota_fiscal AS sit, COUNT(*) AS qt
        FROM ${S}.tb_dsod_nfse
        WHERE YEAR(dt_emissao) BETWEEN ${ANO_MIN} AND ${anoAtual}${filtroMes}
        GROUP BY ic_situacao_nota_fiscal`, 10),
      agentQuery(`
        SELECT TOP 50 n.no_cpf_cnpj cpfCnpj, MAX(n.nm_rsocial) nome, MAX(lk.codigo) codigo,
            COUNT(DISTINCT n.cd_nfse) qtNotas, SUM(n.vl_servicos) vlServicos
        FROM ${S}.tb_dsod_nfse n
        LEFT JOIN (${CCM_LOOKUP}) lk ON lk.no_cpf_cnpj = n.no_cpf_cnpj
        WHERE n.ic_situacao_nota_fiscal = '2' AND n.no_cpf_cnpj IS NOT NULL AND n.no_cpf_cnpj <> ''
          AND YEAR(n.dt_emissao) BETWEEN ${ANO_MIN} AND ${anoAtual}${filtroMes}
        GROUP BY n.no_cpf_cnpj
        ORDER BY vlServicos DESC`, 50),
    ])
    let normal = 0, cancelada = 0
    for (const row of r.rows) {
      const sit = String(row[0] ?? '').trim()
      const qt = num(row[1])
      if (sit === '1') normal += qt
      else if (sit === '2') cancelada += qt
    }
    const porPrestador = rp.rows.map(row => ({
      cpfCnpj: String(row[0] ?? '').trim(),
      nome: String(row[1] ?? '').trim() || 'Não identificado',
      codigo: String(row[2] ?? '').trim(),
      qtNotas: num(row[3]),
      vlServicos: num(row[4]),
    }))
    return { total: normal + cancelada, normal, cancelada, porPrestador }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
    return NextResponse.json(await situacaoNfse(mes))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
