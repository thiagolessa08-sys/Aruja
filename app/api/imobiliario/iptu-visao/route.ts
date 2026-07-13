import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bucketsIptu, bucketsIptuBairro, bucketsIptuMes, dataAtualizacaoIptu, isentoIptu, type BucketsIptuAno } from '@/lib/tributo-engine'

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
    // Mês de referência p/ comparação justa entre anos (YTD): mês atual (ex.: julho).
    const mesRef = new Date().getMonth() + 1
    const [buckets, bucketsMes, dataAtualizacao] = await Promise.all([
      bairro ? bucketsIptuBairro(bairro) : bucketsIptu(),
      bairro ? Promise.resolve(null) : bucketsIptuMes(mesRef),
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
    // Arrecadado / em aberto / inadimplência: YTD (até mês de referência) p/ comparar anos.
    // Sem bairro usa bucketsMes; com bairro cai no valor anual do próprio bucket.
    const zeroM = { arrecadado: 0, emAberto: 0, inadimplente: 0 }
    const mRef = bucketsMes ? (bucketsMes.get(anoRef) ?? zeroM) : { arrecadado: bRef.arrecadado, emAberto: bRef.emAberto, inadimplente: bRef.inadimplente }
    const mAnt = bucketsMes ? (bucketsMes.get(anoAnt) ?? zeroM) : { arrecadado: bAnt.arrecadado, emAberto: bAnt.emAberto, inadimplente: bAnt.inadimplente }

    // Isento oficial (regra nova) — só na visão geral (sem bairro); fallback = bucket
    let isentoRef = bRef.isento, isentoAnt = bAnt.isento
    if (!bairro) {
      const [ir, ia] = await Promise.all([isentoIptu(anoRef), isentoIptu(anoAnt)])
      if (ir != null) isentoRef = ir
      if (ia != null) isentoAnt = ia
    }

    const cmp = (atual: number, ant: number) => ({ atual, ant, pct: ant ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : 0) })
    // Cards: Lançado/Isento/Suspenso = anual; Arrecadado/Inadimplência/Em aberto = YTD (até mês ref)
    const cards = {
      lancado: cmp(bRef.lancado, bAnt.lancado),
      arrecadado: cmp(mRef.arrecadado, mAnt.arrecadado),
      inadimplencia: cmp(mRef.inadimplente, mAnt.inadimplente),
      emAberto: cmp(mRef.emAberto, mAnt.emAberto),
      isento: cmp(isentoRef, isentoAnt),
      suspenso: cmp(bRef.suspenso, bAnt.suspenso),
    }

    // Evolução: Lançado anual; Arrecadado/Inadimplência YTD (até mês ref) p/ comparar anos.
    const arrecMes = (a: number) => bucketsMes ? (bucketsMes.get(a)?.arrecadado ?? 0) : (buckets.get(a)?.arrecadado ?? 0)
    const inadMes = (a: number) => bucketsMes ? (bucketsMes.get(a)?.inadimplente ?? 0) : (buckets.get(a)?.inadimplente ?? 0)
    const pctFn = (lanc: number, arrec: number, inad: number) => ({
      arrecPct: lanc ? (arrec / lanc) * 100 : 0,
      inadPct: lanc ? (inad / lanc) * 100 : 0,
    })
    const histAnos: number[] = []
    for (let a = anoMax - 4; a <= anoMax; a++) histAnos.push(a)
    const hist = histAnos.map(a => ({ ano: a, lancado: (buckets.get(a) ?? zero).lancado, arrecadado: arrecMes(a), inadimplencia: inadMes(a) }))
    const evolucao = hist.map(h => ({
      ano: h.ano, lancado: h.lancado, arrecadado: h.arrecadado, inadimplencia: h.inadimplencia, previsto: false, ...pctFn(h.lancado, h.arrecadado, h.inadimplencia),
    }))
    // Previsão do próximo ano
    const projL = tendencia(hist.map(h => ({ x: h.ano, y: h.lancado })))
    const projA = tendencia(hist.map(h => ({ x: h.ano, y: h.arrecadado })))
    const projI = tendencia(hist.map(h => ({ x: h.ano, y: h.inadimplencia })))
    const pl = Math.max(0, projL(proximo)), pa = Math.max(0, projA(proximo)), pi = Math.max(0, projI(proximo))
    evolucao.push({
      ano: proximo, lancado: pl, arrecadado: pa, inadimplencia: pi, previsto: true,
      arrecPct: pl ? (pa / pl) * 100 : 0, inadPct: pl ? (pi / pl) * 100 : 0,
    })

    return NextResponse.json({ dataAtualizacao, anos, anoRef, mesRef, cards, evolucao, bairro })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
