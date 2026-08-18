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
export interface SituacaoNfse { total: number; normal: number; cancelada: number }

async function situacaoNfse(mes?: number): Promise<SituacaoNfse> {
  return cached(`nfse:situacao:${mes ?? ''}`, TTL_15MIN, async () => {
    const anoAtual = new Date().getFullYear()
    const filtroMes = mes ? ` AND MONTH(dt_emissao) <= ${mes}` : ''
    const r = await agentQuery(`
      SELECT ic_situacao_nota_fiscal AS sit, COUNT(*) AS qt
      FROM ${S}.tb_dsod_nfse
      WHERE YEAR(dt_emissao) BETWEEN ${ANO_MIN} AND ${anoAtual}${filtroMes}
      GROUP BY ic_situacao_nota_fiscal`, 10)
    let normal = 0, cancelada = 0
    for (const row of r.rows) {
      const sit = String(row[0] ?? '').trim()
      const qt = num(row[1])
      if (sit === '1') normal += qt
      else if (sit === '2') cancelada += qt
    }
    return { total: normal + cancelada, normal, cancelada }
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
