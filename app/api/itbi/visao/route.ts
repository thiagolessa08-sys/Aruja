import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bucketsItbi, qtdTransmissoesItbi, dataAtualizacaoItbi, type BucketsItbiAno } from '@/lib/itbi-engine'

const ANO_MIN = 2018

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
    const [buckets, transm, dataAtualizacao] = await Promise.all([
      bucketsItbi(),
      qtdTransmissoesItbi(),
      dataAtualizacaoItbi(),
    ])

    const anos = [...buckets.entries()]
      .filter(([a, b]) => a >= ANO_MIN && b.lancado > 0)
      .map(([a]) => a).sort((x, y) => y - x)
    const anoMax = anos.length ? anos[0] : new Date().getFullYear()
    const anoRef = Number(req.nextUrl.searchParams.get('ano')) || anoMax
    const anoAnt = anoRef - 1
    const proximo = anoMax + 1

    const zero: BucketsItbiAno = { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
    const bRef = buckets.get(anoRef) ?? zero
    const bAnt = buckets.get(anoAnt) ?? zero

    const cmp = (atual: number, ant: number) => ({ atual, ant, pct: ant ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : 0) })
    const cards = {
      lancado: cmp(bRef.lancado, bAnt.lancado),
      arrecadado: cmp(bRef.arrecadado, bAnt.arrecadado),
      inadimplencia: cmp(bRef.inadimplente, bAnt.inadimplente),
      emAberto: cmp(bRef.emAberto, bAnt.emAberto),
      isento: cmp(bRef.isento, bAnt.isento),
      suspenso: cmp(bRef.suspenso, bAnt.suspenso),
      transmissoes: cmp(transm.get(anoRef) ?? 0, transm.get(anoAnt) ?? 0),
    }

    // Evolução (5 anos) + previsão do próximo
    const pctFn = (lanc: number, arrec: number, inad: number) => ({
      arrecPct: lanc ? (arrec / lanc) * 100 : 0,
      inadPct: lanc ? (inad / lanc) * 100 : 0,
    })
    const histAnos: number[] = []
    for (let a = anoMax - 4; a <= anoMax; a++) histAnos.push(a)
    const hist = histAnos.map(a => {
      const b = buckets.get(a) ?? zero
      return { ano: a, lancado: b.lancado, arrecadado: b.arrecadado, emAberto: b.emAberto, inadimplencia: b.inadimplente }
    })
    const evolucao = hist.map(h => ({
      ano: h.ano, lancado: h.lancado, arrecadado: h.arrecadado, emAberto: h.emAberto, inadimplencia: h.inadimplencia, previsto: false, ...pctFn(h.lancado, h.arrecadado, h.inadimplencia),
    }))
    const projL = tendencia(hist.map(h => ({ x: h.ano, y: h.lancado })))
    const projA = tendencia(hist.map(h => ({ x: h.ano, y: h.arrecadado })))
    const projE = tendencia(hist.map(h => ({ x: h.ano, y: h.emAberto })))
    const projI = tendencia(hist.map(h => ({ x: h.ano, y: h.inadimplencia })))
    const pl = Math.max(0, projL(proximo)), pa = Math.max(0, projA(proximo)), pe = Math.max(0, projE(proximo)), pi = Math.max(0, projI(proximo))
    evolucao.push({
      ano: proximo, lancado: pl, arrecadado: pa, emAberto: pe, inadimplencia: pi, previsto: true,
      arrecPct: pl ? (pa / pl) * 100 : 0, inadPct: pl ? (pi / pl) * 100 : 0,
    })

    return NextResponse.json({ dataAtualizacao, anos, anoRef, cards, evolucao })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
