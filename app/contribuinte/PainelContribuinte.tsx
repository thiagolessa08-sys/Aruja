'use client'

import { useState, useEffect } from 'react'

export interface FiltrosContribuinteUI { ano: number | ''; pessoa: '' | 'F' | 'J' }

interface Tip { left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string }

interface NovoAno { ano: number; pf: number; pj: number }
interface Setor { setor: string; label: string; n: number }
interface SitItem { label: string; n: number; pct: number }
interface Evol { ano: number; novos: number; pf: number; pj: number; pctPj: number }
interface Vinculo { label: string; n: number }
interface Score { adimplente: number; emCobranca: number; total: number; pctAdimplente: number }
interface Graficos {
  novosPorAno: NovoAno[]
  pfpj: { f: number; j: number }
  situacao: SitItem[]
  devedores: Setor[]
  vinculos: Vinculo[]
  score: Score
  evolucao: Evol[]
}
interface KpiCard { label: string; value: string; subLabel: string; subValue: string; pct: string; dir: 'up' | 'down' | 'flat' }

const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

const KPIS_FALLBACK: KpiCard[] = [
  { label: 'Total Contribuintes', value: '181.105', subLabel: 'Novos 2026', subValue: '13.076', pct: '-32,60%', dir: 'down' },
  { label: 'Pessoa Física', value: '129.898', subLabel: 'da base', subValue: '71,7%', pct: '71,7%', dir: 'up' },
  { label: 'Pessoa Jurídica', value: '50.894', subLabel: 'da base', subValue: '28,1%', pct: '28,1%', dir: 'flat' },
  { label: 'Cadastros Ativos', value: '175.306', subLabel: 'do total', subValue: '96,8%', pct: '96,8%', dir: 'up' },
  { label: 'Em Cobrança', value: '64.343', subLabel: 'da base', subValue: '35,5%', pct: '35,5%', dir: 'down' },
]

const FALLBACK_GRAF: Graficos = {
  novosPorAno: [
    { ano: 2018, pf: 660, pj: 453 },
    { ano: 2019, pf: 1455, pj: 1157 },
    { ano: 2020, pf: 3463, pj: 1465 },
    { ano: 2021, pf: 3400, pj: 1767 },
    { ano: 2022, pf: 7029, pj: 5673 },
    { ano: 2023, pf: 4579, pj: 3725 },
    { ano: 2024, pf: 5698, pj: 4877 },
    { ano: 2025, pf: 9929, pj: 9472 },
    { ano: 2026, pf: 7832, pj: 5244 },
  ],
  pfpj: { f: 129898, j: 50894 },
  situacao: [
    { label: 'Ativo', n: 175306, pct: 96.8 },
    { label: 'Em cadastramento', n: 1339, pct: 0.7 },
    { label: 'Sem informação', n: 4460, pct: 2.5 },
  ],
  devedores: [
    { setor: 'CobrancaAcumulada', label: 'Cobrança Acumulada', n: 64343 },
    { setor: 'Mobiliario', label: 'Mobiliário (ISS)', n: 35906 },
    { setor: 'Certidao', label: 'Certidões', n: 33666 },
    { setor: 'Imobiliario', label: 'Imobiliário (IPTU)', n: 21568 },
    { setor: 'Itbi', label: 'ITBI', n: 14202 },
    { setor: 'TaxasDiversas', label: 'Taxas Diversas', n: 12803 },
    { setor: 'Projetos', label: 'Projetos / Obras', n: 2886 },
  ],
  evolucao: [
    { ano: 2026, novos: 13076, pf: 7832, pj: 5244, pctPj: 40.1 },
    { ano: 2025, novos: 19401, pf: 9929, pj: 9472, pctPj: 48.8 },
    { ano: 2024, novos: 10575, pf: 5698, pj: 4877, pctPj: 46.1 },
    { ano: 2023, novos: 8304, pf: 4579, pj: 3725, pctPj: 44.9 },
    { ano: 2022, novos: 12702, pf: 7029, pj: 5673, pctPj: 44.7 },
    { ano: 2021, novos: 5167, pf: 3400, pj: 1767, pctPj: 34.2 },
  ],
  vinculos: [
    { label: 'Mobiliário (empresa)', n: 35924 },
    { label: 'Sócio', n: 29817 },
    { label: 'Proprietário de imóvel', n: 19053 },
    { label: 'Transmissão (ITBI)', n: 14211 },
    { label: 'Tomador de serviço', n: 2741 },
    { label: 'Responsável tributário', n: 452 },
  ],
  score: { adimplente: 116762, emCobranca: 64343, total: 181105, pctAdimplente: 64.5 },
}
const INSIGHTS_FALLBACK = [
  'A base reúne 181.105 contribuintes — 129.898 PF (71,7%) e 50.894 PJ (28,1%).',
  '13.076 novos cadastros em 2026 (-32,6% vs 2025, que teve o pico da série).',
  '64.343 contribuintes (35,5% da base) constam em cobrança acumulada.',
]

const SETOR_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#e8962e']
const SIT_CORES: Record<string, string> = { 'Ativo': '#1fa463', 'Em cadastramento': '#e8962e', 'Sem informação': '#c5ccdb' }

// ===== Barras empilhadas: PF × PJ por ano =====
function geomStacked(d: NovoAno[]) {
  const W = 900, H = 300, top = 28, bottom = 252
  const span = bottom - top - 8
  const max = Math.max(1, ...d.map(x => x.pf + x.pj))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(64, gw * 0.5)
  const sc = (v: number) => (v / max) * span
  const bars = d.map((x, i) => {
    const cx = i * gw + gw / 2
    const hPf = sc(x.pf), hPj = sc(x.pj)
    const tot = x.pf + x.pj
    return {
      cx, ano: x.ano, x: cx - bw / 2,
      pf: { y: bottom - hPf, h: hPf },
      pj: { y: bottom - hPf - hPj, h: hPj },
      topY: bottom - hPf - hPj, tot,
      tip: {
        title: String(x.ano),
        l1: `Pessoa Física: ${fmtInt(x.pf)}`, l1c: '#283e93',
        l2: `Pessoa Jurídica: ${fmtInt(x.pj)}`, l2c: '#7d8fce',
        left: `${(cx / W * 100).toFixed(1)}%`, top: `${((bottom - hPf - hPj) / H * 100).toFixed(1)}%`,
      },
    }
  })
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1000), y: bottom - sc(v) }))
  return { bars, ticks, W, H, bottom, bw }
}

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

function buildQS(f: FiltrosContribuinteUI): string {
  const p = new URLSearchParams()
  if (f.ano) p.set('ano', String(f.ano))
  if (f.pessoa) p.set('pessoa', f.pessoa)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default function PainelContribuinte({ filtros }: { filtros: FiltrosContribuinteUI }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [kpis, setKpis] = useState<KpiCard[]>(KPIS_FALLBACK)
  const [insights, setInsights] = useState<string[] | null>(null)
  const [graf, setGraf] = useState<Graficos | null>(null)

  const qs = buildQS(filtros)

  useEffect(() => {
    fetch(`/api/contribuinte/graficos${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setGraf(d) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/contribuinte/kpis${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.kpis?.length) setKpis(d.kpis) }).catch(() => {})
  }, [qs])
  useEffect(() => {
    fetch(`/api/contribuinte/insights${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => setInsights(d?.insights?.length ? d.insights : INSIGHTS_FALLBACK)).catch(() => setInsights(INSIGHTS_FALLBACK))
  }, [qs])

  const g = graf ?? FALLBACK_GRAF
  const gs = geomStacked(g.novosPorAno)

  // Donut PF × PJ
  const totPfPj = (g.pfpj.f + g.pfpj.j) || 1
  const donutC = 2 * Math.PI * 56
  const lenF = (g.pfpj.f / totPfPj) * donutC
  const pctF = (g.pfpj.f / totPfPj) * 100

  // Devedores — lollipop horizontal
  const maxDev = Math.max(1, ...g.devedores.map(d => d.n))

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
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 20a5 5 0 0 0-10 0" /><circle cx="12" cy="9" r="4" /><path d="M22 20a5 5 0 0 0-4-4.9M2 20a5 5 0 0 1 4-4.9" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h.01M15 11h.01M9 14h.01M15 14h.01" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3 8-8" /><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.3 3.3a2 2 0 0 1 3.4 0l8 13.4A2 2 0 0 1 20 20H4a2 2 0 0 1-1.7-3.3z" /><path d="M12 9v4M12 17h.01" /></svg>,
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
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1.3fr', gap: 18, marginTop: 20 }}>

        {/* BARRAS EMPILHADAS: Novos Contribuintes por Ano (PF × PJ) */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Novos Contribuintes por Ano</span>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>PF</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#7d8fce' }}></span>PJ</span>
            </div>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}>
            <svg viewBox={`0 0 ${gs.W} ${gs.H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="ctbPf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#3f5bb5" /></linearGradient>
                <linearGradient id="ctbPj" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7d8fce" /><stop offset="100%" stopColor="#aab8e3" /></linearGradient>
              </defs>
              {gs.ticks.map((t, i) => (
                <g key={i}>
                  <line x1="0" y1={t.y.toFixed(1)} x2={String(gs.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" />
                  <text x="2" y={(t.y - 3).toFixed(1)} fontSize="9" fill="#aeb6c6" style={axisFont}>{t.v}k</text>
                </g>
              ))}
              <line x1="0" y1={gs.bottom} x2={String(gs.W)} y2={gs.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gs.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x.toFixed(1)} y={b.pf.y.toFixed(1)} width={gs.bw.toFixed(1)} height={b.pf.h.toFixed(1)} fill="url(#ctbPf)" />
                  <rect x={b.x.toFixed(1)} y={b.pj.y.toFixed(1)} width={gs.bw.toFixed(1)} height={b.pj.h.toFixed(1)} rx="3" fill="url(#ctbPj)" />
                  <text x={b.cx.toFixed(1)} y={String(gs.H - 6)} fontSize="12" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
                  <text x={b.cx.toFixed(1)} y={(b.topY - 6).toFixed(1)} fontSize="10" fill="#283e93" fontWeight="700" textAnchor="middle" style={axisFont}>{fmtInt(b.tot)}</text>
                </g>
              ))}
              {gs.bars.map((b, i) => (
                <rect key={i} onMouseEnter={() => setTip(b.tip)} x={(b.cx - gs.bw).toFixed(1)} y="0" width={(gs.bw * 2).toFixed(1)} height={String(gs.H - 20)} fill="transparent" pointerEvents="all" />
              ))}
            </svg>
            {tip ? <Tooltip t={tip} /> : null}
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Contribuinte</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de Contribuinte</div>
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

        {/* DONUT: PF × PJ */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Pessoa Física × Jurídica</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 13, color: '#9098a8', marginTop: 4 }}>distribuição da base</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, position: 'relative' }}>
            <svg viewBox="0 0 200 200" width="250" height="250" style={{ maxWidth: '100%' }}>
              <g transform="rotate(-90 100 100)">
                <circle cx="100" cy="100" r="56" fill="none" stroke="#7d8fce" strokeWidth="30" strokeDasharray={`${donutC.toFixed(1)} 0`} />
                <circle cx="100" cy="100" r="56" fill="none" stroke="#283e93" strokeWidth="30" strokeDasharray={`${lenF.toFixed(1)} ${(donutC - lenF).toFixed(1)}`} />
              </g>
              <text x="100" y="94" fontSize="22" fontWeight="700" fill="#283e93" textAnchor="middle" style={axisFont}>{fmtPct(pctF)}</text>
              <text x="100" y="112" fontSize="9" fill="#9098a8" textAnchor="middle" style={axisFont}>são PF</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
            {[
              { cor: '#283e93', label: 'Pessoa Física', v: g.pfpj.f },
              { cor: '#7d8fce', label: 'Pessoa Jurídica', v: g.pfpj.j },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtInt(s.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.v / totPfPj * 100)})</span></span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 18 }}>

        {/* LOLLIPOP HORIZONTAL: Contribuintes com Pendência por Setor */}
        <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Contribuintes com Pendência por Setor</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>contribuintes distintos em cobrança (sem valor R$ na base)</div>
            </div>
            <span style={reportBadge}>Devedores</span>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {g.devedores.map((d, i) => {
              const w = (d.n / maxDev) * 100
              const cor = SETOR_CORES[i % SETOR_CORES.length]
              return (
                <div key={d.setor} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 130, flex: 'none', fontSize: 12, color: '#3a4256', textAlign: 'right' }}>{d.label}</span>
                  <div style={{ flex: 1, position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: '#eef1f7', borderRadius: 2 }} />
                    <div style={{ position: 'absolute', left: 0, width: `calc(${w.toFixed(1)}% - 7px)`, height: 3, background: cor, borderRadius: 2 }} />
                    <span style={{ position: 'absolute', left: `calc(${w.toFixed(1)}% - 14px)`, width: 14, height: 14, borderRadius: '50%', background: cor, boxShadow: '0 0 0 3px #fff' }} />
                  </div>
                  <span style={{ width: 58, flex: 'none', fontSize: 12, fontWeight: 700, color: '#1f2a44', textAlign: 'right' }}>{fmtInt(d.n)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Situação Cadastral — barra de proporção */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Situação Cadastral</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 13, color: '#9098a8', marginTop: 4 }}>{fmtInt(g.situacao.reduce((s, x) => s + x.n, 0))} contribuintes</div>
          <div style={{ display: 'flex', height: 56, borderRadius: 12, overflow: 'hidden', marginTop: 26, background: '#eef1f7' }}>
            {g.situacao.map(s => (
              <div key={s.label} title={`${s.label}: ${fmtPct(s.pct)}`} style={{ width: `${s.pct.toFixed(2)}%`, background: SIT_CORES[s.label] ?? '#c5ccdb' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 28 }}>
            {g.situacao.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: SIT_CORES[s.label] ?? '#c5ccdb', flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtInt(s.n)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== ROW 3: Vínculos + Score de Adimplência ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 18 }}>
        {/* Vínculos */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Vínculos do Contribuinte</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>papéis do contribuinte na base (um contribuinte pode ter vários)</div>
            </div>
            <span style={dots}>···</span>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {(() => { const mx = Math.max(1, ...g.vinculos.map(v => v.n)); return g.vinculos.map((v, i) => (
              <div key={v.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#3a4256' }}>{v.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2a44' }}>{fmtInt(v.n)}</span>
                </div>
                <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v.n / mx * 100).toFixed(1)}%`, background: SETOR_CORES[i % SETOR_CORES.length], borderRadius: 5 }} />
                </div>
              </div>
            )) })()}
          </div>
        </div>

        {/* Score de Adimplência */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Score de Adimplência</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 12, color: '#9098a8', marginTop: 4 }}>contribuintes sem cobrança × em cobrança acumulada</div>
          {(() => {
            const sc = g.score
            const dc = 2 * Math.PI * 56
            const lenAd = sc.total ? (sc.adimplente / sc.total) * dc : 0
            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                  <svg viewBox="0 0 200 200" width="240" height="240" style={{ maxWidth: '100%' }}>
                    <g transform="rotate(-90 100 100)">
                      <circle cx="100" cy="100" r="56" fill="none" stroke="#e8962e" strokeWidth="30" strokeDasharray={`${dc.toFixed(1)} 0`} />
                      <circle cx="100" cy="100" r="56" fill="none" stroke="#1fa463" strokeWidth="30" strokeDasharray={`${lenAd.toFixed(1)} ${(dc - lenAd).toFixed(1)}`} />
                    </g>
                    <text x="100" y="96" fontSize="24" fontWeight="700" fill="#1fa463" textAnchor="middle" style={{ fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>{fmtPct(sc.pctAdimplente)}</text>
                    <text x="100" y="113" fontSize="9" fill="#9098a8" textAnchor="middle" style={{ fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>adimplentes</text>
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: '#1fa463', flex: 'none' }}></span>
                    <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>Sem cobrança</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtInt(sc.adimplente)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e', flex: 'none' }}></span>
                    <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>Em cobrança acumulada</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtInt(sc.emCobranca)}</span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ===== Tabela: Evolução da Base por Ano ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Evolução da Base por Ano</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Exercício', 'Novos Cadastros', 'Pessoa Física', 'Pessoa Jurídica', '% PJ'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.evolucao.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.ano}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.ano}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.novos)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.pf)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtInt(row.pj)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(row.pctPj)}</td>
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
