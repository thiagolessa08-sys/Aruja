import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bucketsIptu, bucketsIptuBairro, dataAtualizacaoIptu, type BucketsIptuAno } from '@/lib/tributo-engine'

const ANO_MIN = 2020

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const bairro = req.nextUrl.searchParams.get('bairro') || null
    const [buckets, dataAtualizacao] = await Promise.all([
      bairro ? bucketsIptuBairro(bairro) : bucketsIptu(),
      dataAtualizacaoIptu(),
    ])

    // Anos disponíveis (a partir de 2020, com lançado > 0)
    const anos = [...buckets.entries()]
      .filter(([a, b]) => a >= ANO_MIN && b.lancado > 0)
      .map(([a]) => a).sort((x, y) => y - x)
    const anoMax = anos.length ? anos[0] : new Date().getFullYear()
    const anoRef = Number(req.nextUrl.searchParams.get('ano')) || anoMax
    const anoAnt = anoRef - 1

    const zero: BucketsIptuAno = { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
    const bRef = buckets.get(anoRef) ?? zero
    const bAnt = buckets.get(anoAnt) ?? zero

    const cards = {
      lancado: bRef.lancado, arrecadado: bRef.arrecadado, inadimplencia: bRef.inadimplente,
      emAberto: bRef.emAberto, isento: bRef.isento, suspenso: bRef.suspenso,
    }

    const cmp = (atual: number, ant: number) => ({ atual, ant, pct: ant ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : 0) })
    const comparativo = {
      anoRef, anoAnt,
      lancado: cmp(bRef.lancado, bAnt.lancado),
      arrecadado: cmp(bRef.arrecadado, bAnt.arrecadado),
      inadimplencia: cmp(bRef.inadimplente, bAnt.inadimplente),
    }

    // Evolução: últimos 5 exercícios até o ano selecionado
    const evolucao = []
    for (let a = anoRef - 4; a <= anoRef; a++) {
      const b = buckets.get(a) ?? zero
      evolucao.push({ ano: a, lancado: b.lancado, arrecadado: b.arrecadado, inadimplencia: b.inadimplente })
    }

    return NextResponse.json({ dataAtualizacao, anos, anoRef, cards, comparativo, evolucao, bairro })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
