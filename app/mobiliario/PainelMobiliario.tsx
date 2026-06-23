'use client'

import { useState, useEffect } from 'react'

export interface FiltrosMobiliario { ano: number | ''; situacao: string }

interface Tip { chart: 'bar' | 'lollipop'; left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string }

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

// ===== Barras verticais: ISS por Ano =====
function geomBarISS(d: PorAno[]) {
  const W = 900, H = 240, top = 20, bottom = 190
  const max = Math.max(1, ...d.map(p => p.iss))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(64, gw * 0.5)
  const bars = d.map((p, i) => {
    const cx = i * gw + gw / 2
    const h = ((p.iss / max) * (bottom - top - 8))
    return {
      cx, ano: p.ano, x: cx - bw / 2, y: bottom - h, h,
      tip: {
        chart: 'bar' as const, title: String(p.ano),
        l1: `ISS Arrecadado: ${fmtMi(p.iss)}`, l1c: '#283e93',
        left: `${(cx / W * 100).toFixed(1)}%`, top: `${((bottom - h) / H * 100).toFixed(1)}%`,
      },
    }
  })
  const tickVals = [max, max / 2, 0]
  const ticks = tickVals.map(v => ({ v: Math.round(v / 1e6), y: bottom - ((v / max) * (bottom - top - 8)) }))
  return { bars, ticks, W, H, bottom, bw }
}

// ===== Gauge semicircular: % empresas ativas =====
function geomGauge(pct: number) {
  const p = Math.max(0, Math.min(99.9, pct))
  const cx = 100, cy = 108, r = 74
  const ang = Math.PI - (p / 100) * Math.PI
  const ex = (cx + r * Math.cos(ang)).toFixed(1)
  const ey = (cy - r * Math.sin(ang)).toFixed(1)
  const laf = p > 50 ? 1 : 0
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const fillPath = p < 0.5 ? '' : `M ${cx - r} ${cy} A ${r} ${r} 0 ${laf} 1 ${ex} ${ey}`
  const nLen = 56
  const nx = (cx + nLen * Math.cos(ang)).toFixed(1)
  const ny = (cy - nLen * Math.sin(ang)).toFixed(1)
  return { bgPath, fillPath, p, cx, cy, nx, ny }
}

// ===== Lollipop: saldo aberturas − encerramentos =====
function geomLollipop(d: AbEnc[]) {
  const saldos = d.map(x => ({ ano: x.ano, saldo: x.aberturas - x.encerramentos, ab: x.aberturas, enc: x.encerramentos }))
  const W = 900, H = 300, mid = 150
  const maxAbs = Math.max(1, ...saldos.map(s => Math.abs(s.saldo)))
  const scale = (v: number) => (Math.abs(v) / maxAbs) * (mid - 30)
  const n = Math.max(1, saldos.length)
  const gw = W / n
  const pts = saldos.map((s, i) => {
    const cx = i * gw + gw / 2
    const len = scale(s.saldo)
    const pos = s.saldo >= 0
    return {
      cx, ano: s.ano, saldo: s.saldo, pos,
      x1: cx, y1: mid,
      x2: cx, y2: pos ? mid - len : mid + len,
      cy: pos ? mid - len : mid + len,
      tip: {
        chart: 'lollipop' as const, title: String(s.ano),
        l1: `Saldo: ${s.saldo >= 0 ? '+' : ''}${fmtInt(s.saldo)}`, l1c: s.saldo >= 0 ? '#1fa463' : '#d64545',
        l2: `Aberturas: ${fmtInt(s.ab)}`, l2c: '#283e93',
        left: `${(cx / W * 100).toFixed(1)}%`, top: `${(Math.min(mid, pos ? mid - len : mid + len) / H * 100).toFixed(1)}%`,
      },
    }
  })
  return { pts, W, H, mid }
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

  const g = graf ?? FALLBACK_GRAF
  const gb = geomBarISS(g.porAno)
  const lp = geomLollipop(g.abVsEnc)
  const ai = g.ativInat
  const totAI = (ai.ativas + ai.inativas) || 1
  const pctAtivas = (ai.ativas / totAI) * 100
  const gg = geomGauge(pctAtivas)

  // Segmentos: barras horizontais ranqueadas
  const maxSeg = Math.max(1, ...g.segmentos.map(s => s.qt))
  const SEG_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#aab8e3', '#c5d0ee', '#e8962e']

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

        {/* BARRAS VERTICAIS: ISS Arrecadado por Ano */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS Arrecadado por Ano</span>
            <span style={reportBadge}>Anual</span>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
            <svg viewBox={`0 0 ${gb.W} ${gb.H}`} width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="issBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#283e93" />
                  <stop offset="100%" stopColor="#7d8fce" />
                </linearGradient>
              </defs>
              {gb.ticks.map((t, i) => (
                <g key={i}>
                  <line x1="0" y1={t.y.toFixed(1)} x2={String(gb.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" />
                  <text x="4" y={(t.y - 3).toFixed(1)} fontSize="9" fill="#aeb6c6" style={axisFont}>{t.v} mi</text>
                </g>
              ))}
              <line x1="0" y1={gb.bottom} x2={String(gb.W)} y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gb.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.h.toFixed(1)} rx="7" fill="url(#issBar)" />
                  <text x={b.cx.toFixed(1)} y={String(gb.H - 4)} fontSize="11" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
                  <text x={b.cx.toFixed(1)} y={(b.y - 6).toFixed(1)} fontSize="9" fill="#283e93" fontWeight="600" textAnchor="middle" style={axisFont}>{fmtMi(b.ano)}</text>
                </g>
              ))}
              {gb.bars.map((b, i) => (
                <rect key={i} onMouseEnter={() => setTip(b.tip)} x={(b.cx - gb.bw).toFixed(1)} y="0" width={(gb.bw * 2).toFixed(1)} height={String(gb.H - 20)} fill="transparent" pointerEvents="all" />
              ))}
            </svg>
            {tip?.chart === 'bar' ? <Tooltip t={tip} /> : null}
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

        {/* GAUGE: Saúde do Cadastro (% empresas ativas) */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Saúde do Cadastro</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>% empresas ativas na base</div>
          <div style={{ position: 'relative', marginTop: 4 }}>
            <svg viewBox="0 0 200 130" width="100%" style={{ display: 'block' }}>
              <path d={gg.bgPath} fill="none" stroke="#e9edf8" strokeWidth="18" strokeLinecap="round" />
              {gg.fillPath ? (
                <path d={gg.fillPath} fill="none"
                  stroke={gg.p >= 60 ? '#1fa463' : gg.p >= 40 ? '#e8962e' : '#d64545'}
                  strokeWidth="18" strokeLinecap="round" />
              ) : null}
              {/* Ticks 0% e 100% */}
              <text x="16" y="112" fontSize="7" fill="#aeb6c6" textAnchor="middle" style={axisFont}>0%</text>
              <text x="184" y="112" fontSize="7" fill="#aeb6c6" textAnchor="middle" style={axisFont}>100%</text>
              <line x1={String(gg.cx)} y1={String(gg.cy)} x2={gg.nx} y2={gg.ny} stroke="#283e93" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx={String(gg.cx)} cy={String(gg.cy)} r="5" fill="#283e93" />
              <text x={String(gg.cx)} y={String(gg.cy + 20)} fontSize="18" fontWeight="700" fill="#1f2a44" textAnchor="middle" style={axisFont}>
                {fmtPct(gg.p)}
              </text>
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1fa463' }}>{fmtInt(ai.ativas)}</div>
              <div style={{ fontSize: 10, color: '#9098a8' }}>Ativas</div>
            </div>
            <div style={{ width: 1, background: '#e3e8f1' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#d64545' }}>{fmtInt(ai.inativas)}</div>
              <div style={{ fontSize: 10, color: '#9098a8' }}>Inativas</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 18 }}>

        {/* LOLLIPOP: Saldo de Empresas (aberturas − encerramentos) */}
        <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Saldo Empresarial</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Aberturas − Encerramentos por ano</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1fa463', display: 'inline-block' }}></span>Positivo</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#d64545', display: 'inline-block' }}></span>Negativo</span>
            </div>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
            <svg viewBox={`0 0 ${lp.W} ${lp.H}`} width="100%" style={{ display: 'block' }}>
              {/* Linha zero */}
              <line x1="0" y1={lp.mid} x2={String(lp.W)} y2={lp.mid} stroke="#e3e8f1" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="4" y={lp.mid - 4} fontSize="9" fill="#9098a8" style={axisFont}>0</text>
              {lp.pts.map((p, i) => (
                <g key={i} onMouseEnter={() => setTip(p.tip)}>
                  {/* Linha (bastão) */}
                  <line x1={p.x1.toFixed(1)} y1={String(lp.mid)} x2={p.x2.toFixed(1)} y2={p.cy.toFixed(1)}
                    stroke={p.pos ? '#1fa463' : '#d64545'} strokeWidth="2.5" strokeLinecap="round" />
                  {/* Bola */}
                  <circle cx={p.cx.toFixed(1)} cy={p.cy.toFixed(1)} r="9"
                    fill={p.pos ? '#1fa463' : '#d64545'} stroke="#fff" strokeWidth="2" />
                  {/* Valor dentro da bola (apenas se couber) */}
                  {Math.abs(p.saldo) < 1000 ? (
                    <text x={p.cx.toFixed(1)} y={(p.cy + 3).toFixed(1)} fontSize="7" fill="#fff" textAnchor="middle" fontWeight="700" style={axisFont}>
                      {p.saldo >= 0 ? '+' : ''}{fmtInt(p.saldo)}
                    </text>
                  ) : null}
                  {/* Rótulo valor acima/abaixo */}
                  <text x={p.cx.toFixed(1)} y={p.pos ? (p.cy - 13).toFixed(1) : (p.cy + 20).toFixed(1)}
                    fontSize="9" fill={p.pos ? '#1fa463' : '#d64545'} textAnchor="middle" fontWeight="700" style={axisFont}>
                    {p.saldo >= 0 ? '+' : ''}{fmtInt(p.saldo)}
                  </text>
                  {/* Ano */}
                  <text x={p.cx.toFixed(1)} y={String(lp.H - 4)} fontSize="10" fill="#3a4256" textAnchor="middle" style={axisFont}>{p.ano}</text>
                </g>
              ))}
            </svg>
            {tip?.chart === 'lollipop' ? <Tooltip t={tip} /> : null}
          </div>
        </div>

        {/* Barras horizontais ranqueadas: Empresas por Segmento */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Empresas por Segmento</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {g.segmentos.map((seg, i) => {
              const w = (seg.qt / maxSeg) * 100
              return (
                <div key={seg.nome}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#3a4256', lineHeight: 1.2, flex: 1, paddingRight: 6 }}>{seg.nome}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>
                      {fmtInt(seg.qt)} <span style={{ color: '#9098a8', fontWeight: 400 }}>({fmtPct(seg.pct)})</span>
                    </span>
                  </div>
                  <div style={{ height: 14, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: SEG_CORES[i % SEG_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
