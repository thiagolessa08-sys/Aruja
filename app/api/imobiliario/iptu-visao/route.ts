import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bucketsIptu, bucketsIptuBairro, dataAtualizacaoIptu, isentoIptu, type BucketsIptuAno } from '@/lib/tributo-engine'

const ANO_MIN = 2020

// Regressão linear simples → função de projeção y(x).
function tendencia(pts: { x: number; y: number }[]) {
  const n = pts.length
  if (n < 2) return () => (pts[0]?.y ?? 0)
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  const den = n * sxx - sx * sx
  if (!den) return () => sy / n
  const b = (n * sxy - sx * sy) / den
  const a = (sy - b * sx) / n
  return (x: number) => a + b * x
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const bairro = req.nextUrl.searchParams.get('bairro') || null
    const [buckets, dataAtualizacao] = await Promise.all([
      bairro ? bucketsIptuBairro(bairro) : bucketsIptu(),
      dataAtualizacaoIptu(),
    ])

    const anos = [...buckets.entries()]
      .filter(([a, b]) => a >= ANO_MIN && b.lancado > 0)
      .map(([a]) => a).sort((x, y) => y - x)
    const anoMax = anos.length ? anos[0] : new Date().getFullYear()
    const anoRef = Number(req.nextUrl.searchParams.get('ano')) || anoMax
    const anoAnt = anoRef - 1
    const proximo = anoMax + 1

    const zero: BucketsIptuAno = { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
    const bRef = buckets.get(anoRef) ?? zero
    const bAnt = buckets.get(anoAnt) ?? zero

    // Isento oficial (regra nova) — só na visão geral (sem bairro); fallback = bucket
    let isentoRef = bRef.isento, isentoAnt = bAnt.isento
    if (!bairro) {
      const [ir, ia] = await Promise.all([isentoIptu(anoRef), isentoIptu(anoAnt)])
      if (ir != null) isentoRef = ir
      if (ia != null) isentoAnt = ia
    }

    const cmp = (atual: number, ant: number) => ({ atual, ant, pct: ant ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : 0) })
    // Cards com valor atual, ano anterior e % de variação
    const cards = {
      lancado: cmp(bRef.lancado, bAnt.lancado),
      arrecadado: cmp(bRef.arrecadado, bAnt.arrecadado),
      inadimplencia: cmp(bRef.inadimplente, bAnt.inadimplente),
      emAberto: cmp(bRef.emAberto, bAnt.emAberto),
      isento: cmp(isentoRef, isentoAnt),
      suspenso: cmp(bRef.suspenso, bAnt.suspenso),
    }

    // Evolução: últimos 5 exercícios + previsão do próximo ano (regressão dos 5)
    const pctFn = (b: BucketsIptuAno) => ({
      arrecPct: b.lancado ? (b.arrecadado / b.lancado) * 100 : 0,
      inadPct: b.lancado ? (b.inadimplente / b.lancado) * 100 : 0,
    })
    const histAnos: number[] = []
    for (let a = anoMax - 4; a <= anoMax; a++) histAnos.push(a)
    const hist = histAnos.map(a => ({ ano: a, b: buckets.get(a) ?? zero }))
    const evolucao = hist.map(({ ano, b }) => ({
      ano, lancado: b.lancado, arrecadado: b.arrecadado, inadimplencia: b.inadimplente, previsto: false, ...pctFn(b),
    }))
    // Previsão do próximo ano
    const projL = tendencia(hist.map(h => ({ x: h.ano, y: h.b.lancado })))
    const projA = tendencia(hist.map(h => ({ x: h.ano, y: h.b.arrecadado })))
    const projI = tendencia(hist.map(h => ({ x: h.ano, y: h.b.inadimplente })))
    const pl = Math.max(0, projL(proximo)), pa = Math.max(0, projA(proximo)), pi = Math.max(0, projI(proximo))
    evolucao.push({
      ano: proximo, lancado: pl, arrecadado: pa, inadimplencia: pi, previsto: true,
      arrecPct: pl ? (pa / pl) * 100 : 0, inadPct: pl ? (pi / pl) * 100 : 0,
    })

    return NextResponse.json({ dataAtualizacao, anos, anoRef, cards, evolucao, bairro })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
