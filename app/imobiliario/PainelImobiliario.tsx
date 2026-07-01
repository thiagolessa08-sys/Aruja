'use client'

import { useState, useEffect } from 'react'
import AreaSerie from '../_components/AreaSerie'

export interface FiltrosImobiliario { ano: number | ''; faixa: number | '' }

interface Tip { chart: 'linha' | 'hbar'; left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string }

interface PorAno { ano: number; arrecadado: number }
interface LancArrec { ano: number; lancado: number; arrecadado: number }
interface Faixa { id: number; label: string; qt: number }
interface Exercicio { ano: number; lancado: number; pago: number; inadPct: number; imoveis: number; aumPct: number | null; aumQtd: number | null }
interface AumentoPeriodo { qtd: number; pct: number; imoveisFim: number }
interface FormaLinha { forma: string; cor: string; v: number[] }
interface FormaPagamento { anos: number[]; linhas: FormaLinha[] }
interface Graficos {
  porAno: PorAno[]
  faixas: Faixa[]
  lancVsArrec: LancArrec[]
  venalComposicao: { terreno: number; predial: number }
  exercicios: Exercicio[]
  aumentoPeriodo: AumentoPeriodo
  formaPagamento: FormaPagamento
}
interface KpiCard { label: string; value: string; subLabel: string; subValue: string; pct: string; dir: 'up' | 'down' | 'flat' }

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

const KPIS_FALLBACK: KpiCard[] = [
  { label: 'Total Lançado', value: '67,61 mi', subLabel: 'Ano Anterior', subValue: '62,69 mi', pct: '7,85%', dir: 'up' },
  { label: 'Total Arrecadado', value: '36,60 mi', subLabel: 'do lançado', subValue: '54,1%', pct: '54,1%', dir: 'down' },
  { label: 'Total Inadimplência', value: '5,86 mi', subLabel: 'vencido · do lançado', subValue: '8,7%', pct: '8,7%', dir: 'down' },
  { label: 'Total em Aberto', value: '28,47 mi', subLabel: 'a receber · do lançado', subValue: '42,1%', pct: '42,1%', dir: 'flat' },
  { label: 'Total Isento', value: '0,49 mi', subLabel: 'do lançado', subValue: '0,7%', pct: '0,7%', dir: 'flat' },
  { label: 'Total Suspenso', value: '1,34 mi', subLabel: 'do lançado', subValue: '2,0%', pct: '2,0%', dir: 'flat' },
]
const FALLBACK_GRAF: Graficos = {
  porAno: [
    { ano: 2022, arrecadado: 42877371 },
    { ano: 2023, arrecadado: 46268836 },
    { ano: 2024, arrecadado: 48631390 },
    { ano: 2025, arrecadado: 51632637 },
    { ano: 2026, arrecadado: 36603737 },
  ],
  faixas: [
    { id: 1, label: 'Até R$ 100 mil', qt: 13453 },
    { id: 2, label: 'R$ 100 a 300 mil', qt: 12893 },
    { id: 3, label: 'R$ 300 a 500 mil', qt: 3765 },
    { id: 4, label: 'R$ 500 mil a 1 mi', qt: 2181 },
    { id: 5, label: 'Acima de R$ 1 mi', qt: 989 },
  ],
  lancVsArrec: [
    { ano: 2024, lancado: 57760167, arrecadado: 48631390 },
    { ano: 2025, lancado: 62692697, arrecadado: 51632637 },
    { ano: 2026, lancado: 67610889, arrecadado: 36603737 },
  ],
  venalComposicao: { terreno: 2696442029, predial: 6135114896 },
  exercicios: [
    { ano: 2026, lancado: 67608947.08, pago: 36216117.70, inadPct: -46.43, imoveis: 31196, aumPct: 2.75, aumQtd: 836 },
    { ano: 2025, lancado: 62675238.35, pago: 51511198.68, inadPct: -17.81, imoveis: 30360, aumPct: 2.66, aumQtd: 786 },
    { ano: 2024, lancado: 57721168.35, pago: 48529721.77, inadPct: -15.92, imoveis: 29574, aumPct: 1.24, aumQtd: 361 },
    { ano: 2023, lancado: 54279551.90, pago: 46173674.06, inadPct: -14.93, imoveis: 29213, aumPct: 2.08, aumQtd: 596 },
    { ano: 2022, lancado: 49950111.25, pago: 42707951.62, inadPct: -14.50, imoveis: 28617, aumPct: 0.81, aumQtd: 230 },
    { ano: 2021, lancado: 45473827.24, pago: 38658342.30, inadPct: -14.99, imoveis: 28387, aumPct: 0.65, aumQtd: 184 },
    { ano: 2020, lancado: 41462019.54, pago: 36038959.97, inadPct: -13.08, imoveis: 28203, aumPct: null, aumQtd: null },
  ],
  aumentoPeriodo: { qtd: 2932, pct: 10.4, imoveisFim: 31204 },
  formaPagamento: {
    anos: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
    linhas: [
      { forma: 'Cota única', cor: '#1fa463', v: [6089, 6369, 6566, 7961, 8405, 7628, 7745] },
      { forma: 'Parcelado', cor: '#283e93', v: [18373, 18107, 17941, 16724, 16523, 16893, 1257] },
      { forma: 'Pago Parcial', cor: '#e8962e', v: [374, 476, 436, 834, 572, 1150, 16476] },
      { forma: 'Em aberto', cor: '#d64545', v: [3436, 3709, 3775, 3751, 4125, 4724, 5726] },
    ],
  },
}
const INSIGHTS_FALLBACK = [
  'O cadastro imobiliário de 2026 tem 33.281 imóveis lançados, somando R$ 9,0 bi em valor venal.',
  'IPTU lançado de R$ 67,6 mi; arrecadado R$ 36,6 mi (54,1% do lançado).',
  'Inadimplência de R$ 5,9 mi (vencido) e R$ 28,5 mi ainda em aberto a receber.',
]

const FAIXA_CORES = ['#283e93', '#3f5bb5', '#7d8fce', '#aab8e3', '#e8962e']


// ===== Geometria: linha "IPTU Arrecadado por Ano" =====
function geomLinha(d: PorAno[]) {
  const mi = (v: number) => v / 1e6
  const vals = d.map(p => mi(p.arrecadado))
  const hi = Math.ceil(Math.max(1, ...vals) / 10) * 10
  const lo = 0
  const xL = 34, xR = 290, yT = 14, yB = 84, span = hi - lo || 1
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
    tip: { chart: 'linha' as const, title: String(p.ano), l1: `IPTU Arrecadado: ${fmtMi(p.arrecadado)}`, l1c: '#283e93', left: `${(X(i) / 300 * 100).toFixed(1)}%`, top: `${(Y(mi(p.arrecadado)) / 100 * 100).toFixed(1)}%` },
  }))
  return { linha, area, ticks, labels, dots, hot }
}

// ===== Geometria: GAUGE semicircular de eficiência =====
function geomGauge(pct: number | null) {
  const p = Math.max(0, Math.min(99.9, pct ?? 0))
  const cx = 100, cy = 108, r = 74
  const ang = Math.PI - (p / 100) * Math.PI
  const ex = (cx + r * Math.cos(ang)).toFixed(1)
  const ey = (cy - r * Math.sin(ang)).toFixed(1)
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const fillPath = p < 0.5 ? '' : `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`
  // Agulha
  const nLen = 56
  const nx = (cx + nLen * Math.cos(ang)).toFixed(1)
  const ny = (cy - nLen * Math.sin(ang)).toFixed(1)
  // Ticks nos 0%, 25%, 50%, 75%, 100%
  const tickPcts = [0, 25, 50, 75, 100]
  const ticks = tickPcts.map(tp => {
    const ta = Math.PI - (tp / 100) * Math.PI
    const ri = r - 18, ro = r + 8
    return {
      x1: (cx + ri * Math.cos(ta)).toFixed(1), y1: (cy - ri * Math.sin(ta)).toFixed(1),
      x2: (cx + ro * Math.cos(ta)).toFixed(1), y2: (cy - ro * Math.sin(ta)).toFixed(1),
      lx: (cx + (ro + 12) * Math.cos(ta)).toFixed(1), ly: (cy - (ro + 12) * Math.sin(ta)).toFixed(1),
      label: tp === 0 ? '0%' : tp === 100 ? '100%' : tp + '%',
    }
  })
  return { bgPath, fillPath, p, cx, cy, nx, ny, ticks }
}

// ===== Barras horizontais: Lançado × Arrecadado por exercício =====
function geomHBar(d: LancArrec[]) {
  const maxV = Math.max(1, ...d.flatMap(x => [x.lancado || 0, x.arrecadado]))
  return d.map(x => ({
    ano: x.ano,
    lancado: x.lancado,
    arrecadado: x.arrecadado,
    wL: x.lancado ? (x.lancado / maxV) * 100 : null,
    wA: (x.arrecadado / maxV) * 100,
    pct: x.lancado ? (x.arrecadado / x.lancado) * 100 : null,
  }))
}

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

function buildQS(f: FiltrosImobiliario): string {
  const p = new URLSearchParams()
  if (f.ano) p.set('ano', String(f.ano))
  if (f.faixa) p.set('faixa', String(f.faixa))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default function PainelImobiliario({ filtros }: { filtros: FiltrosImobiliario }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [kpis, setKpis] = useState<KpiCard[]>(KPIS_FALLBACK)
  const [insights, setInsights] = useState<string[] | null>(null)
  const [graf, setGraf] = useState<Graficos | null>(null)

  const qs = buildQS(filtros)

  useEffect(() => {
    fetch(`/api/imobiliario/graficos${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setGraf(d) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/imobiliario/kpis${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.kpis?.length) setKpis(d.kpis) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/imobiliario/insights${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => setInsights(d?.insights?.length ? d.insights : INSIGHTS_FALLBACK)).catch(() => setInsights(INSIGHTS_FALLBACK))
  }, [qs])

  const tipLinha = tip && tip.chart === 'linha' ? tip : null

  const g = graf ?? FALLBACK_GRAF
  const gl = geomLinha(g.porAno)
  const hbars = geomHBar(g.lancVsArrec)
  const maxFaixa = Math.max(1, ...g.faixas.map(f => f.qt))
  const totFaixa = g.faixas.reduce((s, f) => s + f.qt, 0)

  // Gauge: pct do exercício mais recente com lancado disponível
  const exAtual = g.exercicios.find(e => e.lancado > 0)
  const gaugePct = exAtual && exAtual.lancado > 0 ? (exAtual.pago / exAtual.lancado) * 100 : null
  const gaugeAno = exAtual?.ano ?? null
  const gg = geomGauge(gaugePct)

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
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M9.5 14a2.5 2.5 0 0 0 5 0c0-1.4-1-2-2.5-2.5S9.5 9.4 9.5 8a2.5 2.5 0 0 1 5 0M12 6v1.5M12 16.5V18" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>,
    <svg key="5" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></svg>,
  ]

  return (
    <>
      {/* ===== KPIs ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginTop: 20 }}>
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

        {/* Linha: IPTU Arrecadado por Ano */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>IPTU Arrecadado por Ano</span>
            <span style={reportBadge}>Anual</span>
          </div>
          <div style={{ marginTop: 16, height: 230 }}>
            <AreaSerie
              data={g.porAno.map(p => ({ ano: p.ano, valor: p.arrecadado }))}
              cor="#283e93"
              nome="Arrecadado"
              fmtValor={fmtMi}
              fmtEixoY={(v) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            />
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Imobiliário</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de Imobiliário</div>
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

        {/* GAUGE: Eficiência de Arrecadação */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Eficiência de Arrecadação</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            {gaugeAno ? `% do IPTU lançado arrecadado em ${gaugeAno}` : 'arrecadado ÷ lançado'}
          </div>
          <div style={{ position: 'relative', marginTop: 4, maxWidth: 215, marginLeft: 'auto', marginRight: 'auto', width: '100%' }}>
            <svg viewBox="0 0 200 130" width="100%" style={{ display: 'block' }}>
              {/* Fundo do gauge */}
              <path d={gg.bgPath} fill="none" stroke="#e9edf8" strokeWidth="18" strokeLinecap="round" />
              {/* Preenchimento colorido */}
              {gg.fillPath ? (
                <path d={gg.fillPath} fill="none"
                  stroke={gg.p >= 80 ? '#1fa463' : gg.p >= 50 ? '#e8962e' : '#d64545'}
                  strokeWidth="18" strokeLinecap="round" />
              ) : null}
              {/* Labels ticks extremos */}
              <text x={gg.ticks[0].lx} y={gg.ticks[0].ly} fontSize="6.5" fill="#aeb6c6" textAnchor="middle" style={axisFont}>0%</text>
              <text x={gg.ticks[4].lx} y={gg.ticks[4].ly} fontSize="6.5" fill="#aeb6c6" textAnchor="middle" style={axisFont}>100%</text>
              {/* Agulha */}
              <line x1={String(gg.cx)} y1={String(gg.cy)} x2={gg.nx} y2={gg.ny} stroke="#283e93" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx={String(gg.cx)} cy={String(gg.cy)} r="5" fill="#283e93" />
              {/* Percentual central */}
              <text x={String(gg.cx)} y={String(gg.cy + 20)} fontSize="18" fontWeight="700" fill="#1f2a44" textAnchor="middle" style={axisFont}>
                {gaugePct != null ? fmtPct(gg.p) : '—'}
              </text>
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 6 }}>
            {[{ cor: '#1fa463', label: '≥ 80%' }, { cor: '#e8962e', label: '50–79%' }, { cor: '#d64545', label: '< 50%' }].map(({ cor, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#9098a8' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: cor, flex: 'none' }} />{label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 18, marginTop: 18 }}>

        {/* Barras horizontais: Lançado × Arrecadado por Exercício */}
        <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>IPTU Lançado × Arrecadado</span>
            <div style={{ display: 'flex', gap: 22, fontSize: 12, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>IPTU Lançado</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e' }}></span>IPTU Arrecadado</span>
            </div>
          </div>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {hbars.map(row => (
              <div key={row.ano}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#283e93' }}>{row.ano}</span>
                  {row.pct != null && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: row.pct >= 80 ? '#1fa463' : row.pct >= 50 ? '#e8962e' : '#d64545', background: row.pct >= 80 ? '#e9f8f0' : row.pct >= 50 ? '#fef3e2' : '#feecec', borderRadius: 10, padding: '2px 9px' }}>
                      {fmtPct(row.pct)} arrecadado
                    </span>
                  )}
                </div>
                {row.wL != null && (
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#9098a8', width: 80, flex: 'none' }}>Lançado</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>{fmtMoney(row.lancado ?? 0)}</span>
                    </div>
                    <div style={{ height: 20, borderRadius: 6, background: '#e9edf8', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${row.wL.toFixed(1)}%`, background: 'linear-gradient(90deg,#283e93,#7d8fce)', borderRadius: 6 }} />
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: '#9098a8', width: 80, flex: 'none' }}>Arrecadado</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#c0612a' }}>{fmtMoney(row.arrecadado)}</span>
                  </div>
                  <div style={{ height: 20, borderRadius: 6, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${row.wA.toFixed(1)}%`, background: 'linear-gradient(90deg,#e8962e,#f5c47d)', borderRadius: 6 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Barras horizontais ranqueadas: Imóveis por Faixa de Venal */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Imóveis por Faixa de Venal</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>{fmtInt(totFaixa)} imóveis</div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {g.faixas.map((fx, i) => {
              const w = (fx.qt / maxFaixa) * 100
              const pct = totFaixa ? (fx.qt / totFaixa) * 100 : 0
              return (
                <div key={fx.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#3a4256', lineHeight: 1.3 }}>{fx.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1f2a44', flex: 'none', marginLeft: 8 }}>
                      {fmtInt(fx.qt)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(pct)})</span>
                    </span>
                  </div>
                  <div style={{ height: 16, borderRadius: 6, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: FAIXA_CORES[i], borderRadius: 6, transition: 'width .4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ===== Tabela: Exercícios de IPTU (planilha oficial) ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Exercícios de IPTU</span>
          <span style={{ fontSize: 12, color: '#9098a8' }}>Valor pago — posição 16/06/2026 · valor médio por parcela lançada (2026): R$ 216,72</span>
        </div>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Ano', 'Valor Lançado Total', 'Valor Pago Total', 'Inadimplência', 'Qtd Imóveis', 'Aumento %', 'Aumento Qtd'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '11px 14px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.exercicios.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.ano}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 14px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.ano}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.lancado)}</td>
                    <td style={{ background: cellBg, color: '#1fa463', fontSize: 12, fontWeight: 500, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.pago)}</td>
                    <td style={{ background: cellBg, color: '#d64545', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{row.inadPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.imoveis)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{row.aumPct == null ? '—' : row.aumPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{row.aumQtd == null ? '—' : (row.aumQtd >= 0 ? '+' : '') + fmtInt(row.aumQtd)}</td>
                  </tr>
                )
              })}
              <tr>
                <td colSpan={4} style={{ background: '#eef2fb', color: '#1f2a44', fontSize: 12, fontWeight: 700, padding: '10px 14px', borderRight: '1px solid #d6deef' }}>Aumento de imóveis no período</td>
                <td style={{ background: '#eef2fb', color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '10px 14px', textAlign: 'center', borderRight: '1px solid #eef1f7' }}>{fmtInt(g.aumentoPeriodo.imoveisFim)}</td>
                <td style={{ background: '#eef2fb', color: '#283e93', fontSize: 12, fontWeight: 700, padding: '10px 14px', textAlign: 'center', borderRight: '1px solid #eef1f7' }}>{fmtPct(g.aumentoPeriodo.pct)}</td>
                <td style={{ background: '#eef2fb', color: '#283e93', fontSize: 12, fontWeight: 700, padding: '10px 14px', textAlign: 'center' }}>+{fmtInt(g.aumentoPeriodo.qtd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Tabela: Imóveis por Forma de Pagamento ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Imóveis por Forma de Pagamento</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ background: '#283e93', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '11px 14px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.18)' }}>Forma de Pagamento</th>
                {g.formaPagamento.anos.map(a => (
                  <th key={a} style={{ background: '#283e93', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '11px 14px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.formaPagamento.linhas.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.forma}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 14px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>
                      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: row.cor, marginRight: 7 }} />{row.forma}
                    </td>
                    {row.v.map((val, ci) => (
                      <td key={ci} style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 500, padding: '9px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: ci < row.v.length - 1 ? '1px solid #eef1f7' : 'none' }}>{fmtInt(val)}</td>
                    ))}
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
