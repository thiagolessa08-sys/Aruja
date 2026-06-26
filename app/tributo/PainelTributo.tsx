'use client'

import { useState, useEffect } from 'react'

// Painel genérico movido pelo motor de tributos (/api/tributo/serie?grupo=).
// Reutilizado por ISSCC, TFE, TFHS e Outros Tributos.

interface SerieItem { ano: number; lancado: number; arrecadado: number; saldo: number; isencao: number; suspenso: number }

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

interface Tip { chart: 'bar' | 'area'; left: string; top: string; title: string; l1: string; l1c: string; l2?: string; l2c?: string }

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}
function variacao(a: number, b: number): { pct: string; dir: 'up' | 'down' | 'flat' } {
  if (!b) return { pct: '—', dir: 'flat' }
  const r = ((a - b) / Math.abs(b)) * 100
  return { pct: (r >= 0 ? '+' : '') + fmtPct(r), dir: r > 0.05 ? 'up' : r < -0.05 ? 'down' : 'flat' }
}

// Barras agrupadas Lançado × Arrecadado por ano
function geomBars(d: SerieItem[]) {
  const W = 960, H = 320, top = 30, bottom = 268
  const span = bottom - top - 8
  const max = Math.max(1, ...d.flatMap(x => [x.lancado, x.arrecadado]))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(34, gw * 0.26)
  const sc = (v: number) => (v / max) * span
  const bars = d.map((x, i) => {
    const cx = i * gw + gw / 2
    const hL = sc(x.lancado), hA = sc(x.arrecadado)
    return {
      cx, ano: x.ano,
      lanc: { x: cx - bw - 3, y: bottom - hL, h: hL },
      arr: { x: cx + 3, y: bottom - hA, h: hA },
      topY: bottom - Math.max(hL, hA),
      tip: {
        chart: 'bar' as const, title: String(x.ano),
        l1: `Lançado: ${fmtMi(x.lancado)}`, l1c: '#283e93',
        l2: `Arrecadado: ${fmtMi(x.arrecadado)}`, l2c: '#e8962e',
        left: `${(cx / W * 100).toFixed(1)}%`, top: `${((bottom - Math.max(hL, hA)) / H * 100).toFixed(1)}%`,
      },
    }
  })
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1e6), y: bottom - sc(v) }))
  return { bars, ticks, W, H, bottom, bw }
}

// Área de inadimplência por ano
function geomArea(d: SerieItem[]) {
  const W = 300, H = 100, xL = 34, xR = 290, yT = 14, yB = 84
  const max = Math.max(1, ...d.map(x => x.saldo))
  const n = d.length
  const X = (i: number) => n <= 1 ? (xL + xR) / 2 : xL + (i * (xR - xL)) / (n - 1)
  const Y = (v: number) => yT + ((max - v) / max) * (yB - yT)
  const linha = d.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.saldo).toFixed(1)}`).join(' ')
  const area = n ? `${linha} L${X(n - 1).toFixed(1)} ${yB} L${X(0).toFixed(1)} ${yB} Z` : ''
  const dots = d.map((x, i) => ({ x: X(i), y: Y(x.saldo) }))
  const labels = d.map((x, i) => ({ ano: x.ano, x: X(i) }))
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1e6), y: Y(v) }))
  const half = n > 1 ? (xR - xL) / (n - 1) / 2 : 40
  const hot = d.map((x, i) => ({
    x: X(i) - half, w: half * 2,
    tip: { chart: 'area' as const, title: String(x.ano), l1: `Inadimplência: ${fmtMi(x.saldo)}`, l1c: '#d64545', left: `${(X(i) / 300 * 100).toFixed(1)}%`, top: `${(Y(x.saldo) / 100 * 100).toFixed(1)}%` },
  }))
  return { area, linha, dots, labels, ticks, hot }
}

// Gauge semicircular de % arrecadação
function geomGauge(pct: number) {
  const p = Math.max(0, Math.min(99.9, pct))
  const cx = 100, cy = 108, r = 74
  const ang = Math.PI - (p / 100) * Math.PI
  const ex = (cx + r * Math.cos(ang)).toFixed(1)
  const ey = (cy - r * Math.sin(ang)).toFixed(1)
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const fillPath = p < 0.5 ? '' : `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`
  const nx = (cx + 56 * Math.cos(ang)).toFixed(1)
  const ny = (cy - 56 * Math.sin(ang)).toFixed(1)
  return { bgPath, fillPath, p, cx, cy, nx, ny }
}

export default function PainelTributo({ grupo, titulo }: { grupo: string; titulo: string }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [serie, setSerie] = useState<SerieItem[] | null>(null)

  useEffect(() => {
    setSerie(null)
    fetch(`/api/tributo/serie?grupo=${grupo}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.serie)) setSerie(d.serie) }).catch(() => {})
  }, [grupo])

  const carregando = serie === null
  if (carregando) {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 20 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ background: i === 0 ? '#283e93' : '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)', height: 92 }}>
              <div style={{ height: 10, width: '60%', borderRadius: 5, background: i === 0 ? 'rgba(255,255,255,0.25)' : '#eef1f7' }} />
              <div style={{ height: 18, width: '45%', borderRadius: 5, background: i === 0 ? 'rgba(255,255,255,0.35)' : '#e3e8f1', marginTop: 16 }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, background: '#fff', borderRadius: 22, padding: '46px 24px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)', textAlign: 'center', color: '#5b6477' }}>
          <div style={{ width: 38, height: 38, border: '3px solid #e3e8f1', borderTopColor: '#283e93', borderRadius: '50%', margin: '0 auto', animation: 'pt-spin 0.9s linear infinite' }} />
          <div style={{ marginTop: 14, fontSize: 14, fontWeight: 600, color: '#1f2a44' }}>Carregando dados de {titulo}…</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>consultando o motor de arrecadação (pode levar alguns segundos na primeira carga)</div>
          <style>{`@keyframes pt-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </>
    )
  }

  const s = serie ?? []
  const ult = s[s.length - 1]
  const ant = s[s.length - 2]
  const ano = ult?.ano ?? new Date().getFullYear()

  const lancado = ult?.lancado ?? 0
  const arrecadado = ult?.arrecadado ?? 0
  const saldo = ult?.saldo ?? 0
  const isencao = ult?.isencao ?? 0
  const pctArr = lancado ? (arrecadado / lancado) * 100 : 0
  const pctInad = lancado ? (saldo / lancado) * 100 : 0
  const pctIsen = lancado ? (isencao / lancado) * 100 : 0
  const accArr = s.reduce((a, x) => a + x.arrecadado, 0)
  const accLanc = s.reduce((a, x) => a + x.lancado, 0)

  const suspenso = ult?.suspenso ?? 0
  const naoCob = Math.max(0, lancado - arrecadado - saldo - isencao - suspenso)

  const gb = geomBars(s.length ? s : [{ ano, lancado: 0, arrecadado: 0, saldo: 0, isencao: 0, suspenso: 0 }])
  const ga = geomArea(s.length ? s : [{ ano, lancado: 0, arrecadado: 0, saldo: 0, isencao: 0, suspenso: 0 }])
  const gg = geomGauge(pctArr)

  // Donut composição do exercício
  const comp = [
    { label: 'Arrecadado', v: arrecadado, cor: '#1fa463' },
    { label: 'Inadimplência', v: saldo, cor: '#d64545' },
    { label: 'Isenção', v: isencao, cor: '#e8962e' },
    { label: 'Suspenso/Outros', v: suspenso + naoCob, cor: '#aab8e3' },
  ].filter(x => x.v > 0)
  const totComp = comp.reduce((a, x) => a + x.v, 0) || 1
  const donutC = 2 * Math.PI * 56
  let _off = 0
  const donut = comp.map(x => {
    const len = (x.v / totComp) * donutC
    const seg = { ...x, len, off: -_off, pct: (x.v / totComp) * 100 }
    _off += len
    return seg
  })

  const insights = ult ? [
    `Em ${ano}, ${titulo} lançou ${fmtReais(lancado)} e arrecadou ${fmtReais(arrecadado)} (${fmtPct(pctArr)} do lançado).`,
    `Inadimplência de ${fmtReais(saldo)} em ${ano} — ${fmtPct(pctInad)} do que foi lançado.`,
    ant ? `Arrecadação ${arrecadado >= ant.arrecadado ? 'cresceu' : 'caiu'} ${variacao(arrecadado, ant.arrecadado).pct} vs ${ant.ano}; acumulado de ${fmtReais(accArr)} no período.`
      : `Arrecadação acumulada de ${fmtReais(accArr)} no período analisado.`,
  ] : null

  const kpis = [
    { label: `Lançado ${ano}`, value: fmtMoney(lancado), subLabel: ant ? `${ant.ano}` : '—', subValue: ant ? fmtMoney(ant.lancado) : '—', ...variacao(lancado, ant?.lancado ?? 0) },
    { label: 'Arrecadado', value: fmtMoney(arrecadado), subLabel: 'do lançado', subValue: fmtPct(pctArr), pct: fmtPct(pctArr), dir: (pctArr >= 60 ? 'up' : 'down') as 'up' | 'down' },
    { label: 'Inadimplência', value: fmtMoney(saldo), subLabel: 'do lançado', subValue: fmtPct(pctInad), pct: fmtPct(pctInad), dir: 'down' as const },
    { label: 'Isenção', value: fmtMoney(isencao), subLabel: 'do lançado', subValue: fmtPct(pctIsen), pct: fmtPct(pctIsen), dir: 'flat' as const },
    { label: 'Arrecadado (período)', value: fmtMoney(accArr), subLabel: 'lançado', subValue: fmtMoney(accLanc), pct: fmtPct(accLanc ? accArr / accLanc * 100 : 0), dir: 'flat' as const },
  ]

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
  const dots: React.CSSProperties = { color: '#aeb6c6', fontWeight: 700, letterSpacing: 1, fontSize: 14, flex: 'none' }
  const axisFont: React.CSSProperties = { fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontWeight: 500 }

  function Tooltip({ t }: { t: Tip }) {
    return (
      <div style={{ position: 'absolute', left: t.left, top: t.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '9px 12px', boxShadow: '0 8px 18px rgba(20,40,90,0.25)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l1c }}></span>{t.l1}</div>
        {t.l2 ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l2c }}></span>{t.l2}</div> : null}
      </div>
    )
  }

  const kpiIcons = [
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.3 3.3a2 2 0 0 1 3.4 0l8 13.4A2 2 0 0 1 20 20H4a2 2 0 0 1-1.7-3.3z" /><path d="M12 9v4M12 17h.01" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 7-7" /><path d="M14 7h6v6" /></svg>,
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

        {/* Barras Lançado × Arrecadado */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Lançado × Arrecadado</span>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Lançado</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e' }}></span>Arrecadado</span>
            </div>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}>
            <svg viewBox={`0 0 ${gb.W} ${gb.H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="tbLanc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#b9c4e8" /></linearGradient>
                <linearGradient id="tbArr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8962e" /><stop offset="100%" stopColor="#f5d7a6" /></linearGradient>
              </defs>
              {gb.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(gb.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 3).toFixed(1)} fontSize="9" fill="#aeb6c6" style={axisFont}>{t.v} mi</text></g>))}
              <line x1="0" y1={gb.bottom} x2={String(gb.W)} y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gb.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.lanc.x.toFixed(1)} y={b.lanc.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.lanc.h.toFixed(1)} rx="4" fill="url(#tbLanc)" />
                  <rect x={b.arr.x.toFixed(1)} y={b.arr.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.arr.h.toFixed(1)} rx="4" fill="url(#tbArr)" />
                  <text x={b.cx.toFixed(1)} y={String(gb.H - 6)} fontSize="12" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
                </g>
              ))}
              {gb.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTip(b.tip)} x={(b.cx - gb.bw - 6).toFixed(1)} y="0" width={(gb.bw * 2 + 12).toFixed(1)} height={String(gb.H - 22)} fill="transparent" pointerEvents="all" />))}
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
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>{titulo}</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de {titulo}</div>
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

        {/* Gauge % Arrecadação */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Eficiência de Arrecadação</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>% do lançado arrecadado em {ano}</div>
          <div style={{ position: 'relative', marginTop: 4, maxWidth: 215, marginLeft: 'auto', marginRight: 'auto', width: '100%' }}>
            <svg viewBox="0 0 200 130" width="100%" style={{ display: 'block' }}>
              <path d={gg.bgPath} fill="none" stroke="#e9edf8" strokeWidth="18" strokeLinecap="round" />
              {gg.fillPath ? <path d={gg.fillPath} fill="none" stroke={gg.p >= 70 ? '#1fa463' : gg.p >= 45 ? '#e8962e' : '#d64545'} strokeWidth="18" strokeLinecap="round" /> : null}
              <text x="16" y="112" fontSize="7" fill="#aeb6c6" textAnchor="middle" style={axisFont}>0%</text>
              <text x="184" y="112" fontSize="7" fill="#aeb6c6" textAnchor="middle" style={axisFont}>100%</text>
              <line x1={String(gg.cx)} y1={String(gg.cy)} x2={gg.nx} y2={gg.ny} stroke="#283e93" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx={String(gg.cx)} cy={String(gg.cy)} r="5" fill="#283e93" />
              <text x={String(gg.cx)} y={String(gg.cy + 20)} fontSize="18" fontWeight="700" fill="#1f2a44" textAnchor="middle" style={axisFont}>{fmtPct(gg.p)}</text>
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 4 }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: '#1fa463' }}>{fmtMoney(arrecadado)}</div><div style={{ fontSize: 10, color: '#9098a8' }}>Arrecadado</div></div>
            <div style={{ width: 1, background: '#e3e8f1' }} />
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: '#d64545' }}>{fmtMoney(saldo)}</div><div style={{ fontSize: 10, color: '#9098a8' }}>Inadimplência</div></div>
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.68fr 1.32fr', gap: 18, marginTop: 18 }}>

        {/* Área inadimplência por ano */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Inadimplência por Exercício</span>
            <span style={reportBadge}>Saldo devedor</span>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}>
            <svg viewBox="0 0 300 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
              <defs><linearGradient id="tbInad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d64545" stopOpacity="0.28" /><stop offset="100%" stopColor="#d64545" stopOpacity="0" /></linearGradient></defs>
              {ga.ticks.map((t, i) => (<text key={i} x="4" y={(t.y + 3).toFixed(1)} fontSize="6.5" fill="#aeb6c6" style={axisFont}>{t.v}</text>))}
              <path d={ga.area} fill="url(#tbInad)" />
              <path d={ga.linha} fill="none" stroke="#d64545" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {ga.dots.map((p, i) => (<circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="#d64545" stroke="#fff" strokeWidth="2" />))}
              {ga.labels.map((l, i) => (<text key={i} x={l.x.toFixed(1)} y="97" fontSize="6.5" fill="#aeb6c6" textAnchor="middle" style={axisFont}>{l.ano}</text>))}
              {ga.hot.map((r, i) => (<rect key={i} onMouseEnter={() => setTip(r.tip)} x={r.x.toFixed(1)} y="0" width={r.w.toFixed(1)} height="92" fill="transparent" pointerEvents="all" />))}
            </svg>
            {tip?.chart === 'area' ? <Tooltip t={tip} /> : null}
          </div>
        </div>

        {/* Donut composição do exercício */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Composição do Lançado {ano}</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14 }}>
            <svg viewBox="0 0 200 200" width="185" height="185" style={{ flex: 'none', maxWidth: '52%' }}>
              <g transform="rotate(-90 100 100)">
                {donut.map((s2, i) => (<circle key={i} cx="100" cy="100" r="56" fill="none" stroke={s2.cor} strokeWidth="26" strokeDasharray={`${s2.len.toFixed(1)} ${(donutC - s2.len).toFixed(1)}`} strokeDashoffset={s2.off.toFixed(1)} />))}
              </g>
              <text x="100" y="96" fontSize="17" fontWeight="700" fill="#283e93" textAnchor="middle" style={axisFont}>{fmtMoney(lancado)}</text>
              <text x="100" y="113" fontSize="9" fill="#9098a8" textAnchor="middle" style={axisFont}>lançado</text>
            </svg>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {donut.map((s2, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: s2.cor, flex: 'none' }}></span>
                  <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s2.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtMoney(s2.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s2.pct)})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Tabela ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Exercícios de {titulo}</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Exercício', 'Lançado', 'Arrecadado', 'Inadimplência', '% Arrec.'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...s].reverse().map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                const pa = row.lancado ? (row.arrecadado / row.lancado) * 100 : 0
                return (
                  <tr key={row.ano}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.ano}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.lancado)}</td>
                    <td style={{ background: cellBg, color: '#1fa463', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.arrecadado)}</td>
                    <td style={{ background: cellBg, color: '#d64545', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.saldo)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(pa)}</td>
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
