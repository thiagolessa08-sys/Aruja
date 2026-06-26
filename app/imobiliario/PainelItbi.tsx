'use client'

import { useState, useEffect } from 'react'

export interface FiltrosItbiUI { ano: number | ''; natureza: string }

interface Tip { chart: 'linha' | 'scatter'; left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string; l3?: string }

interface PorAno { ano: number; arrecadado: number }
interface Transm { ano: number; qt: number }
interface Natureza { id: string; label: string; qt: number }
interface Exercicio { ano: number; transmissoes: number; movimentado: number; arrecadado: number; ticket: number }
interface Graficos {
  porAno: PorAno[]
  transmissoes: Transm[]
  naturezas: Natureza[]
  financiamento: { financiado: number; naoFinanciado: number }
  exercicios: Exercicio[]
}
interface KpiCard { label: string; value: string; subLabel: string; subValue: string; pct: string; dir: 'up' | 'down' | 'flat' }

const fmtMoney = (v: number) =>
  Math.abs(v) >= 1e9 ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
    : Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
      : (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

const KPIS_FALLBACK: KpiCard[] = [
  { label: 'ITBI Arrecadado', value: 'R$ 9,22 mi', subLabel: 'Ano Anterior', subValue: 'R$ 26,01 mi', pct: '-64,56%', dir: 'down' },
  { label: 'Transmissões', value: '528', subLabel: 'Ano Anterior', subValue: '1.430', pct: '-63,08%', dir: 'down' },
  { label: 'Valor Movimentado', value: 'R$ 132,02 mi', subLabel: 'Ano Anterior', subValue: 'R$ 342,97 mi', pct: '-61,51%', dir: 'down' },
  { label: 'Ticket Médio', value: 'R$ 250,0 mil', subLabel: 'Ano Anterior', subValue: 'R$ 239,8 mil', pct: '4,25%', dir: 'up' },
  { label: 'Inadimplência', value: 'R$ 414,2 mil', subLabel: 'Ano Anterior', subValue: 'R$ 7,40 mi', pct: '-94,40%', dir: 'down' },
]
const FALLBACK_GRAF: Graficos = {
  porAno: [
    { ano: 2022, arrecadado: 11183382 },
    { ano: 2023, arrecadado: 15870106 },
    { ano: 2024, arrecadado: 24740703 },
    { ano: 2025, arrecadado: 26005481 },
    { ano: 2026, arrecadado: 9217141 },
  ],
  transmissoes: [
    { ano: 2019, qt: 981 }, { ano: 2020, qt: 1030 }, { ano: 2021, qt: 1446 }, { ano: 2022, qt: 1326 },
    { ano: 2023, qt: 1775 }, { ano: 2024, qt: 1670 }, { ano: 2025, qt: 1430 }, { ano: 2026, qt: 528 },
  ],
  naturezas: [
    { id: 'compra_venda', label: 'Compra e Venda', qt: 468 },
    { id: 'dacao', label: 'Dação em Pagamento', qt: 19 },
    { id: 'outros', label: 'Demais atos', qt: 18 },
    { id: 'permuta', label: 'Permuta', qt: 14 },
    { id: 'cessao', label: 'Cessão de Direitos', qt: 5 },
    { id: 'arrematacao', label: 'Arrematação/Adjudicação', qt: 3 },
  ],
  financiamento: { financiado: 124608524, naoFinanciado: 614925435 },
  exercicios: [
    { ano: 2026, transmissoes: 528, movimentado: 132024816, arrecadado: 9217141, ticket: 250047 },
    { ano: 2025, transmissoes: 1430, movimentado: 342973792, arrecadado: 26005481, ticket: 239842 },
    { ano: 2024, transmissoes: 1670, movimentado: 339408980, arrecadado: 24740703, ticket: 203239 },
    { ano: 2023, transmissoes: 1775, movimentado: 357371143, arrecadado: 15870106, ticket: 201336 },
    { ano: 2022, transmissoes: 1326, movimentado: 268999066, arrecadado: 11183382, ticket: 202865 },
    { ano: 2021, transmissoes: 1446, movimentado: 498101481, arrecadado: 0, ticket: 344469 },
  ],
}
const INSIGHTS_FALLBACK = [
  'Em 2026, 528 transmissões movimentaram R$ 132,0 mi em valor venal (ticket médio de R$ 250 mil).',
  'ITBI arrecadado de R$ 9,2 mi em 2026 — alíquota de 2% sobre o valor de transmissão.',
  'Compra e Venda concentra 88,6% das transmissões; 83,2% do valor não é financiado.',
]

const NAT_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#aab8e3', '#e8962e', '#c0612a']

// ===== Linha dupla: ITBI Arrecadado + Valor Movimentado (escala secundária) =====
function geomLinhaDupla(porAno: PorAno[], exercicios: Exercicio[]) {
  const xL = 38, xR = 590, yT = 26, yB = 205, n = porAno.length
  if (!n) return null
  const X = (i: number) => n <= 1 ? (xL + xR) / 2 : xL + (i * (xR - xL)) / (n - 1)

  // Escala arrecadado (eixo esquerdo)
  const arrVals = porAno.map(p => p.arrecadado / 1e6)
  const hiA = Math.ceil(Math.max(1, ...arrVals) / 5) * 5
  const YA = (v: number) => yT + ((hiA - v) / (hiA || 1)) * (yB - yT)

  // Escala movimentado (eixo direito) — mesmos pontos temporais
  const movByAno = new Map(exercicios.map(e => [e.ano, e.movimentado / 1e6]))
  const movVals = porAno.map(p => movByAno.get(p.ano) ?? 0)
  const hiM = Math.ceil(Math.max(1, ...movVals) / 50) * 50
  const YM = (v: number) => yT + ((hiM - v) / (hiM || 1)) * (yB - yT)

  const linhaA = porAno.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${YA(p.arrecadado / 1e6).toFixed(1)}`).join(' ')
  const areaA = `${linhaA} L${X(n - 1).toFixed(1)} ${yB} L${X(0).toFixed(1)} ${yB} Z`
  const linhaM = porAno.map((p, i) => {
    const mv = movByAno.get(p.ano) ?? 0
    return `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${YM(mv).toFixed(1)}`
  }).join(' ')

  const dotsA = porAno.map((p, i) => ({ x: X(i), y: YA(p.arrecadado / 1e6) }))
  const dotsM = porAno.map((p, i) => ({ x: X(i), y: YM(movByAno.get(p.ano) ?? 0) }))
  const ticksA = [hiA, hiA / 2, 0].map(t => ({ v: Math.round(t), y: YA(t) }))
  const ticksM = [hiM, hiM / 2, 0].map(t => ({ v: Math.round(t), y: YM(t) }))
  const labels = porAno.map((p, i) => ({ ano: p.ano, x: X(i) }))
  const half = n > 1 ? (xR - xL) / (n - 1) / 2 : 60
  const hot = porAno.map((p, i) => {
    const mv = movByAno.get(p.ano) ?? 0
    return {
      x: X(i) - half, w: half * 2,
      tip: {
        chart: 'linha' as const, title: String(p.ano),
        l1: `ITBI Arrecadado: ${fmtMi(p.arrecadado)}`, l1c: '#283e93',
        l2: `Valor Movimentado: ${fmtMi(mv * 1e6)}`, l2c: '#e8962e',
        left: `${(X(i) / 630 * 100).toFixed(1)}%`, top: `${(Math.min(YA(p.arrecadado / 1e6), YM(mv)) / 230 * 100).toFixed(1)}%`,
      },
    }
  })
  return { linhaA, areaA, linhaM, dotsA, dotsM, ticksA, ticksM, labels, hot, W: 630, H: 230, yB, xL, xR }
}

// ===== Scatter/bolha: transmissões × ticket × arrecadado =====
function geomScatter(exercicios: Exercicio[]) {
  const validos = exercicios.filter(e => e.transmissoes > 0 && e.ticket > 0)
  if (!validos.length) return null
  const xL = 50, xR = 560, yT = 20, yB = 220
  const maxT = Math.max(...validos.map(e => e.transmissoes))
  const maxK = Math.max(...validos.map(e => e.ticket))
  const maxA = Math.max(1, ...validos.map(e => e.arrecadado))
  const minA = Math.min(...validos.map(e => e.arrecadado))
  const X = (t: number) => xL + (t / maxT) * (xR - xL)
  const Y = (k: number) => yT + ((maxK - k) / maxK) * (yB - yT)
  const R = (a: number) => 8 + ((a - minA) / (maxA - minA || 1)) * 18
  const ticksX = [0, Math.round(maxT / 2), maxT].map(v => ({ v, x: X(v) }))
  const ticksY = [0, Math.round(maxK / 2), maxK].map(v => ({ v: (v / 1000).toFixed(0) + 'k', y: Y(v) }))
  const pts = validos.map(e => ({
    ano: e.ano, x: X(e.transmissoes), y: Y(e.ticket), r: R(e.arrecadado),
    arrec: e.arrecadado, ticket: e.ticket, transm: e.transmissoes,
    tip: {
      chart: 'scatter' as const, title: String(e.ano),
      l1: `Transmissões: ${fmtInt(e.transmissoes)}`, l1c: '#283e93',
      l2: `Ticket Médio: ${fmtMoney(e.ticket)}`, l2c: '#5870c4',
      l3: e.arrecadado ? `ITBI Arrecadado: ${fmtMi(e.arrecadado)}` : undefined,
      left: `${(X(e.transmissoes) / 600 * 100).toFixed(1)}%`,
      top: `${(Y(e.ticket) / 240 * 100).toFixed(1)}%`,
    },
  }))
  return { pts, ticksX, ticksY, W: 600, H: 240, xL, yT, yB, xR }
}

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

function buildQS(f: FiltrosItbiUI): string {
  const p = new URLSearchParams()
  if (f.ano) p.set('ano', String(f.ano))
  if (f.natureza) p.set('natureza', f.natureza)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default function PainelItbi({ filtros }: { filtros: FiltrosItbiUI }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [kpis, setKpis] = useState<KpiCard[]>(KPIS_FALLBACK)
  const [insights, setInsights] = useState<string[] | null>(null)
  const [graf, setGraf] = useState<Graficos | null>(null)

  const qs = buildQS(filtros)

  useEffect(() => {
    fetch(`/api/itbi/graficos${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setGraf(d) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/itbi/kpis${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.kpis?.length) setKpis(d.kpis) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/itbi/insights${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => setInsights(d?.insights?.length ? d.insights : INSIGHTS_FALLBACK)).catch(() => setInsights(INSIGHTS_FALLBACK))
  }, [qs])

  const g = graf ?? FALLBACK_GRAF
  const ld = geomLinhaDupla(g.porAno, g.exercicios)
  const sc = geomScatter(g.exercicios)

  // Natureza — barras horizontais ranqueadas
  const totNat = g.naturezas.reduce((s, n) => s + n.qt, 0)
  const maxNat = Math.max(1, ...g.naturezas.map(n => n.qt))

  // Financiamento — donut
  const fc = g.financiamento
  const totFin = (fc.financiado + fc.naoFinanciado) || 1
  const donutC = 2 * Math.PI * 52
  const pctNF = fc.naoFinanciado / totFin
  const lenNF = pctNF * donutC

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
  const dots: React.CSSProperties = { color: '#aeb6c6', fontWeight: 700, letterSpacing: 1, fontSize: 14, flex: 'none' }
  const axisFont: React.CSSProperties = { fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontWeight: 500 }

  function Tooltip({ t }: { t: Tip }) {
    return (
      <div style={{ position: 'absolute', left: t.left, top: t.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '9px 12px', boxShadow: '0 8px 18px rgba(20,40,90,0.25)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l1c }}></span>{t.l1}
        </div>
        {t.l2 ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l2c }}></span>{t.l2}
        </div> : null}
        {t.l3 ? <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>{t.l3}</div> : null}
      </div>
    )
  }

  const kpiIcons = [
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M9.5 14a2.5 2.5 0 0 0 5 0c0-1.4-1-2-2.5-2.5S9.5 9.4 9.5 8a2.5 2.5 0 0 1 5 0M12 6v1.5M12 16.5V18" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 7l3-3M20 17H4m16 0l-3 3" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 7-7" /><path d="M14 7h6v6" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.4" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  ]

  return (
    <>
      {/* ===== KPIs ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 20 }}>
        {kpis.map((k, i) => {
          const azul = i === 0
          return (
            <div key={k.label} style={azul
              ? { background: '#283e93', borderRadius: 16, padding: '12px 14px', boxShadow: '0 8px 20px rgba(40,62,147,0.22)' }
              : { background: '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: azul ? 'rgba(255,255,255,0.88)' : '#1f2a44', lineHeight: 1.25, display: 'block' }}>{k.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: azul ? 'rgba(255,255,255,0.14)' : '#e9edf8', color: azul ? '#fff' : '#283e93', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{kpiIcons[i]}</div>
                <span style={{ fontSize: 19, fontWeight: 700, color: azul ? '#fff' : '#1f2a44', letterSpacing: '-.5px', whiteSpace: 'nowrap' }}>{k.value}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: azul ? 'rgba(255,255,255,0.6)' : '#9098a8' }}>{k.subLabel} <span style={{ color: azul ? 'rgba(255,255,255,0.95)' : '#3a4256', fontWeight: 600 }}>{k.subValue}</span></span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(k.dir, azul), flex: 'none' }}>{k.pct}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== ROW 1 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.2fr', gap: 18, marginTop: 20 }}>

        {/* LINHA DUPLA: ITBI Arrecadado + Valor Movimentado */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ITBI Arrecadado vs Mercado</span>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 3, background: '#283e93', display: 'inline-block', borderRadius: 2 }}></span>Arrecadado</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 3, background: '#e8962e', display: 'inline-block', borderRadius: 2 }}></span>Movimentado</span>
            </div>
          </div>
          {ld ? (
            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}>
              <svg viewBox={`0 0 ${ld.W} ${ld.H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="areaItbiA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#283e93" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#283e93" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {ld.ticksA.map((t, i) => (
                  <g key={i}>
                    <line x1={ld.xL} y1={t.y.toFixed(1)} x2={ld.xR} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" />
                    <text x="4" y={(t.y + 3).toFixed(1)} fontSize="10" fill="#aeb6c6" style={axisFont}>{t.v}</text>
                  </g>
                ))}
                {/* Eixo direito (movimentado) */}
                {ld.ticksM.map((t, i) => (
                  <text key={i} x={String(ld.W - 2)} y={(t.y + 3).toFixed(1)} fontSize="10" fill="#e8962e" textAnchor="end" style={axisFont}>{t.v}</text>
                ))}
                {/* Área e linha arrecadado */}
                <path d={ld.areaA} fill="url(#areaItbiA)" />
                <path d={ld.linhaA} fill="none" stroke="#283e93" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {ld.dotsA.map((p, i) => <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="#283e93" stroke="#fff" strokeWidth="2" />)}
                {/* Linha movimentado (tracejada, laranja) */}
                <path d={ld.linhaM} fill="none" stroke="#e8962e" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
                {ld.dotsM.map((p, i) => <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3" fill="#e8962e" stroke="#fff" strokeWidth="1.5" />)}
                {/* Labels eixo X */}
                {ld.labels.map((l, i) => <text key={i} x={l.x.toFixed(1)} y={String(ld.H - 4)} fontSize="12" fill="#aeb6c6" textAnchor="middle" style={axisFont}>{l.ano}</text>)}
                {/* Hit areas */}
                {ld.hot.map((r, i) => <rect key={i} onMouseEnter={() => setTip(r.tip)} x={r.x.toFixed(1)} y="0" width={r.w.toFixed(1)} height={String(ld.H)} fill="transparent" pointerEvents="all" />)}
              </svg>
              {tip?.chart === 'linha' ? <Tooltip t={tip} /> : null}
            </div>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9098a8', fontSize: 13 }}>Sem dados</div>
          )}
          <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 4, textAlign: 'right' }}>
            Eixo esq.: ITBI arrecadado (R$ mi) · Eixo dir.: valor movimentado (R$ mi)
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>ITBI</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de ITBI</div>
          {insights === null ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2].map(i => (<div key={i} style={{ height: 9, borderRadius: 5, width: i === 1 ? '85%' : '95%', background: 'rgba(255,255,255,0.18)' }} />))}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {insights.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', background: '#fff', flex: 'none' }} />
                  <span style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.9)' }}>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Barras horizontais ranqueadas: Natureza da Transação */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Natureza da Transação</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>{fmtInt(totNat)} transações</div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {g.naturezas.map((nt, i) => {
              const w = (nt.qt / maxNat) * 100
              const pct = totNat ? (nt.qt / totNat) * 100 : 0
              return (
                <div key={nt.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#3a4256', lineHeight: 1.2 }}>{nt.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1f2a44', flex: 'none', marginLeft: 6 }}>
                      {fmtInt(nt.qt)} <span style={{ color: '#9098a8', fontWeight: 400 }}>({fmtPct(pct)})</span>
                    </span>
                  </div>
                  <div style={{ height: 14, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: NAT_CORES[i % NAT_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr', gap: 18, marginTop: 18 }}>

        {/* SCATTER: Transmissões × Ticket Médio (tamanho = ITBI arrecadado) */}
        <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Mercado Imobiliário por Exercício</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
                Eixo X: nº de transmissões · Eixo Y: ticket médio · Tamanho: ITBI arrecadado
              </div>
            </div>
            <span style={reportBadge}>Scatter</span>
          </div>
          {sc ? (
            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
              <svg viewBox={`0 0 ${sc.W} ${sc.H}`} width="100%" style={{ display: 'block' }}>
                <defs>
                  <radialGradient id="bubbleGrad" cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#5870c4" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#283e93" stopOpacity="0.7" />
                  </radialGradient>
                </defs>
                {/* Grid */}
                {sc.ticksY.map((t, i) => (
                  <g key={i}>
                    <line x1={sc.xL} y1={t.y.toFixed(1)} x2={sc.xR} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" />
                    <text x="4" y={(t.y + 3).toFixed(1)} fontSize="7" fill="#aeb6c6" style={axisFont}>{t.v}</text>
                  </g>
                ))}
                <line x1={sc.xL} y1={sc.yT} x2={sc.xL} y2={sc.yB} stroke="#e3e8f1" strokeWidth="1" />
                <line x1={sc.xL} y1={sc.yB} x2={sc.xR} y2={sc.yB} stroke="#e3e8f1" strokeWidth="1" />
                {sc.ticksX.map((t, i) => (
                  <text key={i} x={t.x.toFixed(1)} y={String(sc.H - 4)} fontSize="7" fill="#aeb6c6" textAnchor="middle" style={axisFont}>{fmtInt(t.v)}</text>
                ))}
                {/* Bolhas */}
                {sc.pts.map((p, i) => (
                  <g key={i} onMouseEnter={() => setTip(p.tip)} style={{ cursor: 'pointer' }}>
                    <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={p.r.toFixed(1)} fill="url(#bubbleGrad)" stroke="#fff" strokeWidth="2" />
                    <text x={p.x.toFixed(1)} y={(p.y - p.r - 4).toFixed(1)} fontSize="7.5" fill="#283e93" textAnchor="middle" fontWeight="600" style={axisFont}>{p.ano}</text>
                  </g>
                ))}
              </svg>
              {tip?.chart === 'scatter' ? <Tooltip t={tip} /> : null}
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9098a8' }}>Sem dados</div>
          )}
        </div>

        {/* DONUT: Financiamento */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Forma de Aquisição</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 13, color: '#9098a8', marginTop: 4 }}>% do valor movimentado</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, position: 'relative' }}>
            <svg viewBox="0 0 200 200" width="250" height="250" style={{ maxWidth: '100%' }}>
              <g transform="rotate(-90 100 100)">
                <circle cx="100" cy="100" r="52" fill="none" stroke="#e8962e" strokeWidth="30"
                  strokeDasharray={`${donutC.toFixed(1)} 0`} />
                <circle cx="100" cy="100" r="52" fill="none" stroke="#283e93" strokeWidth="30"
                  strokeDasharray={`${lenNF.toFixed(1)} ${(donutC - lenNF).toFixed(1)}`} />
              </g>
              <text x="100" y="92" fontSize="17" fontWeight="700" fill="#283e93" textAnchor="middle" style={axisFont}>
                {fmtPct(pctNF * 100)}
              </text>
              <text x="100" y="110" fontSize="9" fill="#9098a8" textAnchor="middle" style={axisFont}>não financiado</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
            {[
              { cor: '#283e93', label: 'Não Financiado', v: fc.naoFinanciado },
              { cor: '#e8962e', label: 'Financiado', v: fc.financiado },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtMoney(s.v)}</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* ===== Tabela ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Exercícios de ITBI</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Exercício', 'Transmissões', 'Valor Movimentado', 'ITBI Arrecadado', 'Ticket Médio'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.exercicios.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.ano}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.ano}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.transmissoes)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.movimentado)}</td>
                    <td style={{ background: cellBg, color: row.arrecadado ? '#c0612a' : '#9098a8', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{row.arrecadado ? fmtReais(row.arrecadado) : '—'}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtReais(row.ticket)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
