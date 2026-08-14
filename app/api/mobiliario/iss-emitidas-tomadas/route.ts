import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { classificarMunicipio } from '@/lib/iss-fora-previsao'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const ANO_MIN = 2018

export interface AnoVolume { ano: number; emitidas: number; tomadas: number }

// Volume (nº de notas) de NFS-e "emitidas" × "tomadas" por exercício. tb_dsod_nfse não tem
// um campo de identidade do tomador nem um indicador confiável de responsabilidade pela
// retenção (ic_responsavel_retencao veio 100% nulo na validação; ic_imposto_retido não
// correlaciona com a localidade do prestador — é um sinal jurídico à parte, tipo de serviço
// com retenção obrigatória). Por isso "emitida"/"tomada" aqui usa a mesma classificação
// aproximada de município do prestador do card ISS Prestador de Fora do Município:
//  • Emitida = prestador de Arujá (a própria empresa local emite e recolhe o ISS)
//  • Tomada  = prestador de fora do município (o tomador local retém/recolhe o ISS em nome
//    do prestador de fora — por isso a nota "é tomada" por alguém em Arujá)
async function issPorAno(ano: number, mes?: number): Promise<{ emitidas: number; tomadas: number }> {
  const filtroMes = mes ? ` AND MONTH(dt_emissao) <= ${mes}` : ''
  const r = await agentQuery(`
    SELECT nm_mun, COUNT(*) qt
    FROM ${S}.tb_dsod_nfse
    WHERE ic_situacao_nota_fiscal = '1' AND YEAR(dt_emissao) = ${ano}${filtroMes}
    GROUP BY nm_mun`, 5000)
  let emitidas = 0, tomadas = 0
  for (const row of r.rows) {
    const cls = classificarMunicipio(row[0])
    if (cls === 'local') emitidas += num(row[1])
    else if (cls === 'fora') tomadas += num(row[1])
  }
  return { emitidas, tomadas }
}

async function volumePorAno(mes?: number): Promise<AnoVolume[]> {
  return cached(`iss:volumeEmitidasTomadas:${mes ?? ''}`, TTL_15MIN, async () => {
    const anoAtual = new Date().getFullYear()
    const anos: number[] = []
    for (let a = ANO_MIN; a <= anoAtual; a++) anos.push(a)
    const serie = await Promise.all(anos.map(async ano => ({ ano, ...(await issPorAno(ano, mes)) })))
    return serie.filter(s => s.emitidas > 0 || s.tomadas > 0)
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined
    return NextResponse.json({ porAno: await volumePorAno(mes) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
