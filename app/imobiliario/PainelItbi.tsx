'use client'

import { useState, useEffect } from 'react'

export interface FiltrosItbiUI { ano: number | ''; natureza: string }

interface Tip { chart: 'linha' | 'bar'; left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string }

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

// ===== Fallbacks (valores reais validados no IQ) =====
const KPIS_FALLBACK: KpiCard[] = [
  { label: 'ITBI Arrecadado', value: 'R$ 9,22 mi', subLabel: 'Ano Anterior', subValue: 'R$ 26,01 mi', pct: '-64,56%', dir: 'down' },
  { label: 'Transmissões', value: '528', subLabel: 'Ano Anterior', subValue: '1.430', pct: '-63,08%', dir: 'down' },
  { label: 'Valor Movimentado', value: 'R$ 132,02 mi', subLabel: 'Ano Anterior', subValue: 'R$ 342,97 mi', pct: '-61,51%', dir: 'down' },
  { label: 'Ticket Médio', value: 'R$ 250,0 mil', subLabel: 'Ano Anterior', subValue: 'R$ 239,8 mil', pct: '4,25%', dir: 'up' },
  { label: 'Não Financiado', value: '83,2%', subLabel: 'do movimentado', subValue: 'R$ 614,93 mi', pct: '-4,12%', dir: 'down' },
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

// ===== Geometria: linha "ITBI Arrecadado por Ano" =====
function geomLinha(d: PorAno[]) {
  const mi = (v: number) => v / 1e6
  const vals = d.map(p => mi(p.arrecadado))
  const hi = Math.ceil(Math.max(1, ...vals) / 5) * 5
  const lo = 0
  const xL = 34, xR = 290, yT = 20, yB = 112, span = hi - lo || 1
  const n = d.length
  const X = (i: number) => n <= 1 ? (xL + xR) / 2 : xL + (i * (xR - xL)) / (n - 1)
  const Y = (vMi: number) => yT + ((hi - vMi) / span) * (yB - yT)
  const linha = d.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(mi(p.arrecadado)).toFixed(1)}`).join(' ')
  const area = n ? `${linha} L${X(n - 1).toFixed(1)} ${yB} L${X(0).toFixed(1)} ${yB} Z` : ''
  const ticks = [hi, (hi + lo) / 2, lo].map(t => ({ v: Math.round(t), y: Y(t) }))
  const labels = d.map((p, i) => ({ ano: p.ano, x: X(i) }))
  const dots = d.map((p, i) => ({ x: X(i), y: Y(mi(p.arrecadado)) }))
  const half = n > 1 ? (xR - xL) / (n - 1) / 2 : 40
  const hot = d.map((p, i) => ({
    x: X(i) - half, w: half * 2,
    tip: { chart: 'linha' as const, title: String(p.ano), l1: `ITBI Arrecadado: ${fmtMi(p.arrecadado)}`, l1c: '#283e93', left: `${(X(i) / 300 * 100).toFixed(1)}%`, top: `${(Y(mi(p.arrecadado)) / 130 * 100).toFixed(1)}%` },
  }))
  return { linha, area, ticks, labels, dots, hot }
}

// ===== Geometria: barras simples "Transmissões por Ano" =====
function geomBar(d: Transm[]) {
  const W = 1080, H = 380, top = 40, bottom = 300
  const max = Math.max(1, ...d.map(m => m.qt))
  const sc = (v: number) => (v / max) * (bottom - top - 10)
  const n = Math.max(1, d.length)
  const gw = W / n
  const bars = d.map((m, i) => {
    const cx = i * gw + gw / 2
    const h = sc(m.qt)
    return {
      cx, ano: m.ano, x: cx - 34, y: bottom - h, h,
      tip: { chart: 'bar' as const, title: String(m.ano), l1: `Transmissões: ${fmtInt(m.qt)}`, l1c: '#283e93', left: `${(cx / W * 100).toFixed(1)}%`, top: `${((bottom - h) / H * 100).toFixed(1)}%` },
    }
  })
  return { bars, W, H, bottom }
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

  const tipLinha = tip && tip.chart === 'linha' ? tip : null
  const tipBar = tip && tip.chart === 'bar' ? tip : null

  const g = graf ?? FALLBACK_GRAF
  const gl = geomLinha(g.porAno)
  const gb = geomBar(g.transmissoes)

  // Donut — natureza da transação
  const totNat = g.naturezas.reduce((s, n) => s + n.qt, 0)
  const donutC = 2 * Math.PI * 66
  let _off = 0
  const donut = g.naturezas.map((nt, i) => {
    const len = totNat ? (nt.qt / totNat) * donutC : 0
    const seg = { nome: nt.label, v: nt.qt, cor: NAT_CORES[i % NAT_CORES.length], len, off: -_off, pct: totNat ? (nt.qt / totNat) * 100 : 0 }
    _off += len
    return seg
  })

  const fc = g.financiamento
  const finMax = Math.max(fc.financiado, fc.naoFinanciado) || 1

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
        {t.l2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l2c }}></span>{t.l2}
          </div>
        ) : null}
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
      <div style={{ display: 'grid', gridTemplateColumns: '1.68fr 1fr 1.32fr', gap: 18, marginTop: 20 }}>

        {/* ITBI Arrecadado por Ano */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ITBI Arrecadado por Ano</span>
            <span style={reportBadge}>Anual</span>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 18, cursor: 'pointer' }}>
            <div style={{ position: 'absolute', left: 30, top: -2, display: 'flex', gap: 10, zIndex: 2 }}>
              <span style={{ background: '#283e93', color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: 14, padding: '4px 11px' }}>Arrecadado</span>
            </div>
            <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="areaItbi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#283e93" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#283e93" stopOpacity="0" />
                </linearGradient>
              </defs>
              {gl.ticks.map((t, i) => (<text key={i} x="4" y={(t.y + 3).toFixed(1)} fontSize="6.5" fill="#aeb6c6" style={axisFont}>{t.v}</text>))}
              <path d={gl.area} fill="url(#areaItbi)" stroke="none" />
              <path d={gl.linha} fill="none" stroke="#283e93" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {gl.dots.map((p, i) => (<circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="#283e93" stroke="#fff" strokeWidth="2" />))}
              {gl.labels.map((l, i) => (<text key={i} x={l.x.toFixed(1)} y="126" fontSize="6.5" fill="#aeb6c6" textAnchor="middle" style={axisFont}>{l.ano}</text>))}
              {gl.hot.map((r, i) => (<rect key={i} onMouseEnter={() => setTip(r.tip)} x={r.x.toFixed(1)} y="0" width={r.w.toFixed(1)} height="120" fill="transparent" pointerEvents="all" />))}
            </svg>
            {tipLinha ? <Tooltip t={tipLinha} /> : null}
          </div>
        </div>

        {/* Insights de ITBI */}
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

        {/* Composição do Financiamento */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Financiamento da Aquisição</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 30 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>NÃO FINANCIADO</div>
              <div style={{ height: 70, width: `${Math.max(8, 90 * fc.naoFinanciado / finMax).toFixed(1)}%`, borderRadius: 12, marginTop: 12, background: 'linear-gradient(90deg,#283e93 0%,#8094d6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, boxSizing: 'border-box' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{fmtMoney(fc.naoFinanciado)}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>FINANCIADO</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12 }}>
                <div style={{ height: 70, width: `${Math.max(8, 90 * fc.financiado / finMax).toFixed(1)}%`, minWidth: 18, borderRadius: 12, background: 'linear-gradient(90deg,#283e93 0%,#5870c4 100%)', flex: 'none' }}></div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#283e93' }}>{fmtMoney(fc.financiado)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.75fr 1fr', gap: 18, marginTop: 18 }}>

        {/* Transmissões por Ano */}
        <div style={{ position: 'relative', background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Transmissões por Ano</span>
            <div style={{ display: 'flex', gap: 22, fontSize: 12, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Nº de transmissões</span>
            </div>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 16, cursor: 'pointer' }}>
            <svg viewBox="0 0 1080 380" width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="itbiBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#b9c4e8" /></linearGradient>
              </defs>
              <line x1="8" y1={gb.bottom} x2="1072" y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gb.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x.toFixed(1)} y={b.y.toFixed(1)} width="68" height={b.h.toFixed(1)} rx="7" fill="url(#itbiBar)" />
                  <text x={b.cx.toFixed(1)} y="326" fontSize="15" fill="#3a4256" style={axisFont} textAnchor="middle">{b.ano}</text>
                </g>
              ))}
              {gb.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTip(b.tip)} x={(b.cx - 60).toFixed(1)} y="40" width="120" height="260" fill="transparent" pointerEvents="all" />))}
            </svg>
            {tipBar ? <Tooltip t={tipBar} /> : null}
          </div>
        </div>

        {/* Natureza da Transação */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Natureza da Transação</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>{fmtInt(totNat)} transações</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
            <svg viewBox="0 0 200 200" width="210" height="210">
              <g transform="rotate(-90 100 100)">
                {donut.map((s, i) => (
                  <circle key={i} cx="100" cy="100" r="66" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)} />
                ))}
              </g>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
            {donut.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.nome}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtInt(s.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Tabela: Exercícios de ITBI ===== */}
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
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.transmissoes)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.movimentado)}</td>
                    <td style={{ background: cellBg, color: row.arrecadado ? '#c0612a' : '#9098a8', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{row.arrecadado ? fmtReais(row.arrecadado) : '—'}</td>
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
