import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { bucketsIptu, bucketsIptuBairro, bucketsIptuAteMes, dataAtualizacaoIptu, isentoIptu, type BucketsIptuAno } from '@/lib/tributo-engine'

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
    // Mês selecionado (acumulado). Sem seleção: usa o mês atual como referência (YTD) só p/ arrecadado.
    const mesSel = Number(req.nextUrl.searchParams.get('mes')) || null
    const mesRef = mesSel ?? (new Date().getMonth() + 1)
    const usaAteMes = !!mesSel && !bairro // mês selecionado → toda a visão acumulada até o mês
    const [buckets, ateMes, dataAtualizacao] = await Promise.all([
      bairro ? bucketsIptuBairro(bairro) : bucketsIptu(),
      usaAteMes ? bucketsIptuAteMes(mesSel) : Promise.resolve(null),
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
    // Seletores por ano — quando um mês é selecionado (usaAteMes), tudo vem da posição
    // acumulada até o mês (ateMes); senão: lançado/em aberto/inadimplência anuais e
    // arrecadado YTD até o mês atual (arrecMesMap).
    const lancMes = (a: number) => usaAteMes ? (ateMes!.get(a)?.lancado ?? 0) : (buckets.get(a)?.lancado ?? 0)
    // "Ano Todo" (sem mês) = ano cheio (Jan→Dez) — item 1. Com mês = acumulado até o mês.
    const arrecMes = (a: number) => usaAteMes ? (ateMes!.get(a)?.arrecadado ?? 0) : (buckets.get(a)?.arrecadado ?? 0)
    const abertoMes = (a: number) => usaAteMes ? (ateMes!.get(a)?.emAberto ?? 0) : (buckets.get(a)?.emAberto ?? 0)
    const inadMes = (a: number) => usaAteMes ? (ateMes!.get(a)?.inadimplente ?? 0) : (buckets.get(a)?.inadimplente ?? 0)

    // Isento oficial (regra nova) — só na visão geral (sem bairro); fallback = bucket
    let isentoRef = bRef.isento, isentoAnt = bAnt.isento
    if (!bairro) {
      const [ir, ia] = await Promise.all([isentoIptu(anoRef), isentoIptu(anoAnt)])
      if (ir != null) isentoRef = ir
      if (ia != null) isentoAnt = ia
    }

    const cmp = (atual: number, ant: number) => ({ atual, ant, pct: ant ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : 0) })
    // Cards. Sem mês: Lançado/Isento/Suspenso anuais, Arrecadado YTD, Inadimplência/Em aberto posição atual.
    // Com mês: Lançado/Arrecadado/Em aberto/Inadimplência acumulados até o mês; Isento/Suspenso anuais.
    const cards = {
      lancado: cmp(lancMes(anoRef), lancMes(anoAnt)),
      arrecadado: cmp(arrecMes(anoRef), arrecMes(anoAnt)),
      inadimplencia: cmp(inadMes(anoRef), inadMes(anoAnt)),
      emAberto: cmp(abertoMes(anoRef), abertoMes(anoAnt)),
      isento: cmp(isentoRef, isentoAnt),
      suspenso: cmp(bRef.suspenso, bAnt.suspenso),
    }

    // Evolução (5 anos): mesmos seletores (acumulado até o mês quando selecionado).
    const pctFn = (lanc: number, arrec: number, inad: number) => ({
      arrecPct: lanc ? (arrec / lanc) * 100 : 0,
      inadPct: lanc ? (inad / lanc) * 100 : 0,
    })
    const histAnos: number[] = []
    for (let a = anoMax - 4; a <= anoMax; a++) histAnos.push(a)
    const hist = histAnos.map(a => ({ ano: a, lancado: lancMes(a), arrecadado: arrecMes(a), emAberto: abertoMes(a), inadimplencia: inadMes(a) }))
    const evolucao = hist.map(h => ({
      ano: h.ano, lancado: h.lancado, arrecadado: h.arrecadado, emAberto: h.emAberto, inadimplencia: h.inadimplencia, previsto: false, ...pctFn(h.lancado, h.arrecadado, h.inadimplencia),
    }))
    // Previsão do próximo ano
    const projL = tendencia(hist.map(h => ({ x: h.ano, y: h.lancado })))
    const projA = tendencia(hist.map(h => ({ x: h.ano, y: h.arrecadado })))
    const projE = tendencia(hist.map(h => ({ x: h.ano, y: h.emAberto })))
    const projI = tendencia(hist.map(h => ({ x: h.ano, y: h.inadimplencia })))
    const pl = Math.max(0, projL(proximo)), pa = Math.max(0, projA(proximo)), pe = Math.max(0, projE(proximo)), pi = Math.max(0, projI(proximo))
    evolucao.push({
      ano: proximo, lancado: pl, arrecadado: pa, emAberto: pe, inadimplencia: pi, previsto: true,
      arrecPct: pl ? (pa / pl) * 100 : 0, inadPct: pl ? (pi / pl) * 100 : 0,
    })

    return NextResponse.json({ dataAtualizacao, anos, anoRef, mesRef, cards, evolucao, bairro })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
