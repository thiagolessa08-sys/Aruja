'use client'

import { useState, useEffect } from 'react'

interface Resumo {
  total: number; administrativa: number; judicial: number; ajuizamento: number
  porTributo: { nome: string; valor: number }[]
  porExercicio: { ano: number; valor: number }[]
}

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

const FALLBACK: Resumo = {
  total: 148123000, administrativa: 76900000, judicial: 70900000, ajuizamento: 323000,
  porTributo: [
    { nome: 'IPTU', valor: 67870000 },
    { nome: 'Taxas de Licença p/ Localização', valor: 24020000 },
    { nome: 'I.S.S.Q.N.', valor: 12200000 },
    { nome: 'ITBI', valor: 10270000 },
    { nome: 'ISS Construção Civil', valor: 5060000 },
    { nome: 'Outras Restituições', valor: 4910000 },
    { nome: 'TFE', valor: 2870000 },
    { nome: 'TFHS', valor: 2680000 },
    { nome: 'Multa', valor: 2450000 },
  ],
  porExercicio: [
    { ano: 2016, valor: 4760000 }, { ano: 2017, valor: 5100000 }, { ano: 2018, valor: 5520000 },
    { ano: 2019, valor: 7430000 }, { ano: 2020, valor: 6690000 }, { ano: 2021, valor: 7070000 },
    { ano: 2022, valor: 9220000 }, { ano: 2023, valor: 10340000 }, { ano: 2024, valor: 15890000 },
    { ano: 2025, valor: 26080000 }, { ano: 2026, valor: 3880000 },
  ],
}

const TRIB_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#c0612a']

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

// Barras verticais aging
function geomBars(d: { ano: number; valor: number }[]) {
  const W = 960, H = 300, top = 26, bottom = 250
  const span = bottom - top - 8
  const max = Math.max(1, ...d.map(x => x.valor))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(46, gw * 0.5)
  const bars = d.map((x, i) => {
    const cx = i * gw + gw / 2
    const h = (x.valor / max) * span
    return { cx, ano: x.ano, valor: x.valor, x: cx - bw / 2, y: bottom - h, h }
  })
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1e6), y: bottom - (v / max) * span }))
  return { bars, ticks, W, H, bottom, bw }
}

export default function PainelDivida() {
  const [d, setD] = useState<Resumo | null>(null)
  const [tip, setTip] = useState<{ left: string; top: string; ano: number; valor: number } | null>(null)

  useEffect(() => {
    fetch('/api/divida/resumo').then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.total === 'number') setD(x) }).catch(() => {})
  }, [])

  const g = d ?? FALLBACK
  const pctJud = g.total ? (g.judicial / g.total) * 100 : 0
  const pctAdm = g.total ? (g.administrativa / g.total) * 100 : 0
  const maxTrib = Math.max(1, ...g.porTributo.map(t => t.valor))
  const gb = geomBars(g.porExercicio)

  // Donut composição
  const comp = [
    { label: 'Administrativa', v: g.administrativa, cor: '#283e93' },
    { label: 'Judicial (ajuizada)', v: g.judicial, cor: '#e8962e' },
    { label: 'Em ajuizamento', v: g.ajuizamento, cor: '#aab8e3' },
  ].filter(x => x.v > 0)
  const totComp = comp.reduce((a, x) => a + x.v, 0) || 1
  const donutC = 2 * Math.PI * 56
  let _off = 0
  const donut = comp.map(x => { const len = (x.v / totComp) * donutC; const s = { ...x, len, off: -_off, pct: x.v / totComp * 100 }; _off += len; return s })

  const insights = [
    `Dívida ativa de ${fmtReais(g.total)} — ${fmtMoney(g.administrativa)} administrativa (${fmtPct(pctAdm)}) e ${fmtMoney(g.judicial)} já ajuizada (${fmtPct(pctJud)}).`,
    g.porTributo[0] ? `${g.porTributo[0].nome} concentra ${fmtMoney(g.porTributo[0].valor)} (${fmtPct(g.porTributo[0].valor / g.total * 100)}) do estoque inscrito.` : '',
    (() => { const r = [...g.porExercicio].sort((a, b) => b.valor - a.valor)[0]; return r ? `Os débitos de ${r.ano} são os mais pesados do estoque, com ${fmtMoney(r.valor)}.` : '' })(),
  ].filter(Boolean)

  const kpis = [
    { label: 'Dívida Ativa Total', value: fmtMoney(g.total), subLabel: 'estoque inscrito', subValue: '', pct: '', dir: 'flat' as const },
    { label: 'Administrativa', value: fmtMoney(g.administrativa), subLabel: 'do total', subValue: fmtPct(pctAdm), pct: fmtPct(pctAdm), dir: 'flat' as const },
    { label: 'Judicial (ajuizada)', value: fmtMoney(g.judicial), subLabel: 'do total', subValue: fmtPct(pctJud), pct: fmtPct(pctJud), dir: 'down' as const },
    { label: 'Em Ajuizamento', value: fmtMoney(g.ajuizamento), subLabel: 'do total', subValue: fmtPct(g.total ? g.ajuizamento / g.total * 100 : 0), pct: '', dir: 'flat' as const },
    { label: 'Maior Tributo', value: g.porTributo[0] ? fmtMoney(g.porTributo[0].valor) : '—', subLabel: g.porTributo[0]?.nome ?? '', subValue: '', pct: '', dir: 'flat' as const },
  ]

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
  const dots: React.CSSProperties = { color: '#aeb6c6', fontWeight: 700, letterSpacing: 1, fontSize: 14, flex: 'none' }
  const axisFont: React.CSSProperties = { fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontWeight: 500 }

  const kpiIcons = [
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v18M5 7l7-4 7 4M4 21h16M6 11l-2 4h4zM18 11l-2 4h4z" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>,
  ]

  return (
    <>
      {/* KPIs */}
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
                <span style={{ fontSize: 11, color: azul ? 'rgba(255,255,255,0.6)' : '#9098a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.subLabel} <span style={{ color: azul ? 'rgba(255,255,255,0.95)' : '#3a4256', fontWeight: 600 }}>{k.subValue}</span></span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(k.dir, azul), flex: 'none' }}>{k.pct}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ROW 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1.1fr', gap: 18, marginTop: 20 }}>
        {/* Ranked bars por tributo */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Dívida Ativa por Tributo</span>
            <span style={reportBadge}>Estoque</span>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {g.porTributo.map((t, i) => {
              const w = (t.valor / maxTrib) * 100
              return (
                <div key={t.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256', lineHeight: 1.2, paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtMoney(t.valor)}</span>
                  </div>
                  <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: TRIB_CORES[i % TRIB_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Dívida Ativa</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights da Dívida Ativa</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {insights.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', background: '#fff', flex: 'none' }} />
                <span style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.9)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut composição */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Administrativa × Judicial</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <svg viewBox="0 0 200 200" width="250" height="250" style={{ maxWidth: '100%' }}>
              <g transform="rotate(-90 100 100)">
                {donut.map((s, i) => (<circle key={i} cx="100" cy="100" r="56" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)} />))}
              </g>
              <text x="100" y="96" fontSize="16" fontWeight="700" fill="#283e93" textAnchor="middle" style={axisFont}>{fmtMoney(g.total)}</text>
              <text x="100" y="113" fontSize="9" fill="#9098a8" textAnchor="middle" style={axisFont}>total</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18 }}>
            {donut.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtPct(s.pct)}</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* ROW 2 — aging */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Idade dos Débitos</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>saldo em dívida ativa por exercício de origem</div>
          </div>
          <span style={reportBadge}>Aging</span>
        </div>
        <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
          <svg viewBox={`0 0 ${gb.W} ${gb.H}`} width="100%" style={{ display: 'block' }}>
            <defs><linearGradient id="divBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#7d8fce" /></linearGradient></defs>
            {gb.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(gb.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 3).toFixed(1)} fontSize="9" fill="#aeb6c6" style={axisFont}>{t.v} mi</text></g>))}
            <line x1="0" y1={gb.bottom} x2={String(gb.W)} y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
            {gb.bars.map((b, i) => (
              <g key={i}>
                <rect x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.h.toFixed(1)} rx="5" fill="url(#divBar)" />
                <text x={b.cx.toFixed(1)} y={String(gb.H - 6)} fontSize="11" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
              </g>
            ))}
            {gb.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTip({ left: `${(b.cx / gb.W * 100).toFixed(1)}%`, top: `${(b.y / gb.H * 100).toFixed(1)}%`, ano: b.ano, valor: b.valor })} x={(b.cx - gb.bw).toFixed(1)} y="0" width={(gb.bw * 2).toFixed(1)} height={String(gb.H - 20)} fill="transparent" pointerEvents="all" />))}
          </svg>
          {tip ? (
            <div style={{ position: 'absolute', left: tip.left, top: tip.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{tip.ano}</div>
              <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 3 }}>Dívida: {fmtMi(tip.valor)}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tabela por tributo */}
      <div style={{ ...card, marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Estoque por Tributo</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tributo', 'Dívida Ativa', '% do Estoque'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.porTributo.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.nome}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.nome}</td>
                    <td style={{ background: cellBg, color: '#c0612a', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.valor)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(g.total ? row.valor / g.total * 100 : 0)}</td>
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
