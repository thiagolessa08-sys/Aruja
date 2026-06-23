'use client'

import { useState, useEffect } from 'react'

export interface FiltrosMobiliario { ano: number | ''; situacao: string }

interface Tip { chart: 'linha' | 'bar'; left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string }

interface PorAno { ano: number; iss: number }
interface AbEnc { ano: number; aberturas: number; encerramentos: number }
interface Porte { label: string; qt: number }
interface Segmento { nome: string; qt: number; pct: number }
interface Graficos {
  porAno: PorAno[]
  portes: Porte[]
  ativInat: { ativas: number; inativas: number }
  abVsEnc: AbEnc[]
  segmentos: Segmento[]
}
interface KpiCard { label: string; value: string; subLabel: string; subValue: string; pct: string; dir: 'up' | 'down' | 'flat' }

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

// ===== Fallbacks (valores reais validados no IQ) =====
const KPIS_CAD: KpiCard[] = [
  { label: 'Empresas Cadastradas', value: '37.066', subLabel: 'Ativas', subValue: '18.384', pct: '49,6%', dir: 'up' },
  { label: 'Empresas Ativas', value: '18.384', subLabel: 'Inativas', subValue: '18.682', pct: '49,6%', dir: 'down' },
  { label: 'Aberturas no Exercício', value: '484', subLabel: 'Ano Anterior', subValue: '3.211', pct: '-84,93%', dir: 'down' },
  { label: 'Encerramentos no Exercício', value: '623', subLabel: 'Ano Anterior', subValue: '2.864', pct: '-78,25%', dir: 'down' },
  { label: 'ISS Arrecadado', value: '43,50 mi', subLabel: 'Ano Anterior', subValue: '74,00 mi', pct: '-41,22%', dir: 'down' },
]
const KPIS_ARREC: KpiCard[] = [KPIS_CAD[4], KPIS_CAD[1], KPIS_CAD[0], KPIS_CAD[2], KPIS_CAD[3]]

const FALLBACK_GRAF: Graficos = {
  porAno: [
    { ano: 2022, iss: 46015133 },
    { ano: 2023, iss: 53413442 },
    { ano: 2024, iss: 56463649 },
    { ano: 2025, iss: 74004379 },
    { ano: 2026, iss: 43497076 },
  ],
  portes: [
    { label: 'Microempresa (ME)', qt: 18573 },
    { label: 'Pequeno Porte (EPP)', qt: 942 },
    { label: 'Demais portes', qt: 1300 },
  ],
  ativInat: { ativas: 18384, inativas: 18682 },
  abVsEnc: [
    { ano: 2019, aberturas: 1914, encerramentos: 594 },
    { ano: 2020, aberturas: 2126, encerramentos: 896 },
    { ano: 2021, aberturas: 3081, encerramentos: 929 },
    { ano: 2022, aberturas: 2611, encerramentos: 919 },
    { ano: 2023, aberturas: 2967, encerramentos: 683 },
    { ano: 2024, aberturas: 2933, encerramentos: 2731 },
    { ano: 2025, aberturas: 3211, encerramentos: 2864 },
    { ano: 2026, aberturas: 484, encerramentos: 623 },
  ],
  segmentos: [
    { nome: 'PRESTADOR DE SERVIÇOS', qt: 8020, pct: 53.7 },
    { nome: 'COMERCIO', qt: 3110, pct: 20.8 },
    { nome: 'GERAL', qt: 947, pct: 6.3 },
    { nome: 'COMÉRCIO E PRESTAÇÃO DE SERVIÇOS', qt: 915, pct: 6.1 },
    { nome: 'FEIRA', qt: 758, pct: 5.1 },
    { nome: 'PUBLICIDADE', qt: 401, pct: 2.7 },
    { nome: 'CONSERVATÓRIO MUSICAL', qt: 341, pct: 2.3 },
    { nome: 'INDUSTRIA', qt: 196, pct: 1.3 },
  ],
}
const INSIGHTS_CAD = [
  'O cadastro mobiliário tem 37.066 empresas, sendo 18.384 ativas (49,6% da base).',
  '484 empresas abertas em 2026 (-84,9% vs 2025).',
  'ISS arrecadado de R$ 43,5 mi em 2026 — o principal tributo do cadastro mobiliário.',
]

const PORTE_CORES = ['#283e93', '#5870c4', '#aab8e3', '#e8962e']

function geomLinha(d: PorAno[]) {
  const mi = (v: number) => v / 1e6
  const vals = d.map(p => mi(p.iss))
  const hi = Math.ceil(Math.max(1, ...vals) / 10) * 10
  const lo = 0
  const xL = 34, xR = 290, yT = 20, yB = 112, span = hi - lo || 1
  const n = d.length
  const X = (i: number) => n <= 1 ? (xL + xR) / 2 : xL + (i * (xR - xL)) / (n - 1)
  const Y = (vMi: number) => yT + ((hi - vMi) / span) * (yB - yT)
  const linha = d.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(mi(p.iss)).toFixed(1)}`).join(' ')
  const area = n ? `${linha} L${X(n - 1).toFixed(1)} ${yB} L${X(0).toFixed(1)} ${yB} Z` : ''
  const ticks = [hi, (hi + lo) / 2, lo].map(t => ({ v: Math.round(t), y: Y(t) }))
  const labels = d.map((p, i) => ({ ano: p.ano, x: X(i) }))
  const dots = d.map((p, i) => ({ x: X(i), y: Y(mi(p.iss)) }))
  const half = n > 1 ? (xR - xL) / (n - 1) / 2 : 40
  const hot = d.map((p, i) => ({
    x: X(i) - half, w: half * 2,
    tip: { chart: 'linha' as const, title: String(p.ano), l1: `ISS Arrecadado: ${fmtMi(p.iss)}`, l1c: '#283e93', left: `${(X(i) / 300 * 100).toFixed(1)}%`, top: `${(Y(mi(p.iss)) / 130 * 100).toFixed(1)}%` },
  }))
  return { linha, area, ticks, labels, dots, hot }
}

function geomBar(d: AbEnc[]) {
  const W = 1080, H = 380, top = 40, bottom = 300
  const max = Math.max(1, ...d.flatMap(m => [m.aberturas, m.encerramentos]))
  const sc = (v: number) => (v / max) * (bottom - top - 10)
  const n = Math.max(1, d.length)
  const gw = W / n
  const bars = d.map((m, i) => {
    const cx = i * gw + gw / 2
    const hA = sc(m.aberturas), hE = sc(m.encerramentos)
    return {
      cx, ano: m.ano,
      ab: { x: cx - 60, y: bottom - hA, h: hA },
      en: { x: cx + 8, y: bottom - hE, h: hE },
      tip: { chart: 'bar' as const, title: String(m.ano), l1: `Aberturas: ${fmtInt(m.aberturas)}`, l1c: '#283e93', l2: `Encerramentos: ${fmtInt(m.encerramentos)}`, l2c: '#e8962e', left: `${(cx / W * 100).toFixed(1)}%`, top: `${((bottom - Math.max(hA, hE)) / H * 100).toFixed(1)}%` },
    }
  })
  return { bars, W, H, bottom }
}

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

function buildQS(f: FiltrosMobiliario, foco: string): string {
  const p = new URLSearchParams()
  if (f.ano) p.set('ano', String(f.ano))
  if (f.situacao) p.set('situacao', f.situacao)
  if (foco === 'arrecadacao') p.set('foco', 'arrecadacao')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default function PainelMobiliario({ filtros, foco = 'cadastro' }: { filtros: FiltrosMobiliario; foco?: 'cadastro' | 'arrecadacao' }) {
  const arrec = foco === 'arrecadacao'
  const [tip, setTip] = useState<Tip | null>(null)
  const [kpis, setKpis] = useState<KpiCard[]>(arrec ? KPIS_ARREC : KPIS_CAD)
  const [insights, setInsights] = useState<string[] | null>(null)
  const [graf, setGraf] = useState<Graficos | null>(null)

  const qs = buildQS(filtros, foco)

  useEffect(() => {
    fetch(`/api/mobiliario/graficos${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setGraf(d) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/mobiliario/kpis${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.kpis?.length) setKpis(d.kpis) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/mobiliario/insights${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => setInsights(d?.insights?.length ? d.insights : INSIGHTS_CAD)).catch(() => setInsights(INSIGHTS_CAD))
  }, [qs])

  const tipLinha = tip && tip.chart === 'linha' ? tip : null
  const tipBar = tip && tip.chart === 'bar' ? tip : null

  const g = graf ?? FALLBACK_GRAF
  const gl = geomLinha(g.porAno)
  const gb = geomBar(g.abVsEnc)

  // Donut — empresas por porte (classificadas)
  const totPorte = g.portes.reduce((s, p) => s + p.qt, 0)
  const donutC = 2 * Math.PI * 66
  let _off = 0
  const donut = g.portes.map((p, i) => {
    const len = totPorte ? (p.qt / totPorte) * donutC : 0
    const seg = { nome: p.label, v: p.qt, cor: PORTE_CORES[i % PORTE_CORES.length], len, off: -_off, pct: totPorte ? (p.qt / totPorte) * 100 : 0 }
    _off += len
    return seg
  })

  const ai = g.ativInat
  const totAI = Math.max(ai.ativas, ai.inativas) || 1

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
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3 8-8" /><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  ]

  return (
    <>
      {/* ===== KPIs ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 20 }}>
        {kpis.map((k, i) => {
          const azul = i === 0
          return (
            <div key={k.label + i} style={azul
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

        {/* ISS Arrecadado por Ano */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS Arrecadado por Ano</span>
            <span style={reportBadge}>Anual</span>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 18, cursor: 'pointer' }}>
            <div style={{ position: 'absolute', left: 30, top: -2, display: 'flex', gap: 10, zIndex: 2 }}>
              <span style={{ background: '#283e93', color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: 14, padding: '4px 11px' }}>Arrecadado</span>
            </div>
            <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="areaIss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#283e93" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#283e93" stopOpacity="0" />
                </linearGradient>
              </defs>
              {gl.ticks.map((t, i) => (<text key={i} x="4" y={(t.y + 3).toFixed(1)} fontSize="6.5" fill="#aeb6c6" style={axisFont}>{t.v}</text>))}
              <path d={gl.area} fill="url(#areaIss)" stroke="none" />
              <path d={gl.linha} fill="none" stroke="#283e93" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {gl.dots.map((p, i) => (<circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="#283e93" stroke="#fff" strokeWidth="2" />))}
              {gl.labels.map((l, i) => (<text key={i} x={l.x.toFixed(1)} y="126" fontSize="6.5" fill="#aeb6c6" textAnchor="middle" style={axisFont}>{l.ano}</text>))}
              {gl.hot.map((r, i) => (<rect key={i} onMouseEnter={() => setTip(r.tip)} x={r.x.toFixed(1)} y="0" width={r.w.toFixed(1)} height="120" fill="transparent" pointerEvents="all" />))}
            </svg>
            {tipLinha ? <Tooltip t={tipLinha} /> : null}
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>{arrec ? 'ISS' : 'Mobiliário'}</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>{arrec ? 'Insights de ISS' : 'Insights de Mobiliário'}</div>
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

        {/* Composição do Cadastro */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Situação do Cadastro</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 30 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>EMPRESAS ATIVAS</div>
              <div style={{ height: 70, width: `${Math.max(8, 90 * ai.ativas / totAI).toFixed(1)}%`, borderRadius: 12, marginTop: 12, background: 'linear-gradient(90deg,#283e93 0%,#8094d6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, boxSizing: 'border-box' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{fmtInt(ai.ativas)}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>INATIVAS / CANCELADAS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12 }}>
                <div style={{ height: 70, width: `${Math.max(8, 90 * ai.inativas / totAI).toFixed(1)}%`, minWidth: 18, borderRadius: 12, background: 'linear-gradient(90deg,#283e93 0%,#5870c4 100%)', flex: 'none' }}></div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#283e93' }}>{fmtInt(ai.inativas)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.75fr 1fr', gap: 18, marginTop: 18 }}>

        {/* Aberturas × Encerramentos */}
        <div style={{ position: 'relative', background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Aberturas × Encerramentos</span>
            <div style={{ display: 'flex', gap: 22, fontSize: 12, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Aberturas</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e' }}></span>Encerramentos</span>
            </div>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 16, cursor: 'pointer' }}>
            <svg viewBox="0 0 1080 380" width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="mobAb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#b9c4e8" /></linearGradient>
                <linearGradient id="mobEn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8962e" /><stop offset="100%" stopColor="#f5d7a6" /></linearGradient>
              </defs>
              <line x1="8" y1={gb.bottom} x2="1072" y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gb.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.ab.x.toFixed(1)} y={b.ab.y.toFixed(1)} width="52" height={b.ab.h.toFixed(1)} rx="7" fill="url(#mobAb)" />
                  <rect x={b.en.x.toFixed(1)} y={b.en.y.toFixed(1)} width="52" height={b.en.h.toFixed(1)} rx="7" fill="url(#mobEn)" />
                  <text x={b.cx.toFixed(1)} y="326" fontSize="15" fill="#3a4256" style={axisFont} textAnchor="middle">{b.ano}</text>
                </g>
              ))}
              {gb.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTip(b.tip)} x={(b.cx - 80).toFixed(1)} y="40" width="160" height="260" fill="transparent" pointerEvents="all" />))}
            </svg>
            {tipBar ? <Tooltip t={tipBar} /> : null}
          </div>
        </div>

        {/* Empresas por Porte */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Empresas por Porte</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>{fmtInt(totPorte)} classificadas</div>
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

      {/* ===== Tabela: Empresas por Segmento ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Empresas por Segmento</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Segmento', 'Empresas', '% das Classificadas'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.segmentos.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.nome}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.nome}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.qt)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(row.pct)}</td>
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
