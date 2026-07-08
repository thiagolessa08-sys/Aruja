import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { bucketsIptu, serieMensalIptu } from '@/lib/tributo-engine'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// Regressão linear simples: retorna função de projeção y(x).
function tendencia(pts: { x: number; y: number }[]) {
  const n = pts.length
  if (n < 2) return (x: number) => (pts[0]?.y ?? 0)
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  const den = n * sxx - sx * sx
  if (!den) return (x: number) => sy / n
  const b = (n * sxy - sx * sy) / den
  const a = (sy - b * sx) / n
  return (x: number) => a + b * x
}

async function seasonalShares(anos: number[]) {
  return cached(`iptuSeasonal:${anos.join('.')}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT MONTH(pb.dt_baixa) m, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (${anos.join(',')})
        AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
        AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY MONTH(pb.dt_baixa)`, 40)
    const tot = new Array(13).fill(0)
    for (const x of r.rows) { const m = num(x[0]); if (m >= 1 && m <= 12) tot[m] = num(x[1]) }
    const soma = tot.reduce((a, b) => a + b, 0) || 1
    return tot.slice(1).map(v => v / soma) // 12 frações somando ~1
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const buckets = await bucketsIptu()
    const anosDisp = [...buckets.entries()].filter(([a, b]) => a >= 2020 && b.lancado > 0).map(([a]) => a).sort((x, y) => x - y)
    const anoMax = anosDisp.length ? anosDisp[anosDisp.length - 1] : new Date().getFullYear()
    const anoRef = Number(req.nextUrl.searchParams.get('ano')) || anoMax
    const proximo = anoMax + 1

    // Histórico (últimos 5 anos com dado) para a tendência
    const hist = anosDisp.filter(a => a <= anoMax).slice(-5).map(a => {
      const b = buckets.get(a)!
      return { ano: a, lancado: b.lancado, arrecadado: b.arrecadado, inadimplencia: b.inadimplente }
    })
    const projL = tendencia(hist.map(h => ({ x: h.ano, y: h.lancado })))
    const projA = tendencia(hist.map(h => ({ x: h.ano, y: h.arrecadado })))
    const lanc27 = Math.max(0, projL(proximo)), arr27 = Math.max(0, projA(proximo))
    const previsao = { ano: proximo, lancado: lanc27, arrecadado: arr27, inadimplencia: Math.max(0, lanc27 - arr27) }

    // Sazonalidade (5 anos) + real do ano atual → previsão mês a mês
    const anos5 = hist.map(h => h.ano)
    const [shares, real] = await Promise.all([seasonalShares(anos5), serieMensalIptu(anoRef)])
    const taxa = hist.filter(h => h.lancado > 0).reduce((s, h) => s + h.arrecadado / h.lancado, 0) / Math.max(1, hist.filter(h => h.lancado > 0).length)
    const lancRef = buckets.get(anoRef)?.lancado ?? 0
    const arrecPrevAnual = lancRef * (taxa || 0.7)
    let cumL = 0, cumAp = 0
    const mensalAtual = []
    for (let m = 1; m <= 12; m++) {
      const rm = real.find(x => x.mes === m)
      cumL += rm?.lancado ?? 0
      const arrecPrev = arrecPrevAnual * (shares[m - 1] ?? 0)
      cumAp += arrecPrev
      mensalAtual.push({ mes: m, arrecReal: rm?.arrecadado ?? 0, arrecPrev, inadPrev: Math.max(0, cumL - cumAp) })
    }

    return NextResponse.json({ anoRef, historico: hist, previsao, mensalAtual, taxaArrec: taxa })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
