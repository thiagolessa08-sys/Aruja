'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSaudacaoNome } from '../_components/useSaudacao'
import TopNav from '../_components/TopNav'

interface AnoBase { ano: number; qt: number; base: number; iss: number }

const FALLBACK: AnoBase[] = [
  { ano: 2022, qt: 341507, base: 1732900000, iss: 65800000 },
  { ano: 2023, qt: 466597, base: 1595000000, iss: 53600000 },
  { ano: 2024, qt: 533714, base: 1856400000, iss: 65700000 },
  { ano: 2025, qt: 639010, base: 1955100000, iss: 69800000 },
  { ano: 2026, qt: 347645, base: 1653800000, iss: 58800000 },
]

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export default function ReformaTributariaPage() {
  const [saudacao, setSaudacao] = useState('Bom dia')
  const nome = useSaudacaoNome()
  const [anos, setAnos] = useState<AnoBase[]>(FALLBACK)
  const [aliqIbs, setAliqIbs] = useState(3.6)     // alíquota municipal efetiva sob o IBS (%)
  const [cresc, setCresc] = useState(0)           // crescimento projetado da base (%)

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
    fetch('/api/reforma/base').then(r => r.ok ? r.json() : null)
      .then(d => { if (d && Array.isArray(d.anos) && d.anos.length) setAnos(d.anos) }).catch(() => {})
  }, [])

  const ref = anos[anos.length - 1] ?? FALLBACK[FALLBACK.length - 1]
  const aliqIssEfetiva = ref.base ? (ref.iss / ref.base) * 100 : 0

  const calc = useMemo(() => {
    const baseProj = ref.base * (1 + cresc / 100)
    const ibs = baseProj * (aliqIbs / 100)
    const delta = ibs - ref.iss
    const deltaPct = ref.iss ? (delta / ref.iss) * 100 : 0
    return { baseProj, ibs, delta, deltaPct }
  }, [ref, aliqIbs, cresc])

  // Inicializa a alíquota com a efetiva atual ao carregar a base real
  useEffect(() => { if (aliqIssEfetiva > 0) setAliqIbs(Number(aliqIssEfetiva.toFixed(1))) }, [aliqIssEfetiva])

  const maxBar = Math.max(ref.iss, calc.ibs) || 1

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const kpiIcons = [
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 7-7M14 7h6v6" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12l7 7 7-7" /></svg>,
  ]
  const kpis = [
    { label: `Base de Serviços ${ref.ano}`, value: fmtMoney(ref.base), sub: `${ref.qt.toLocaleString('pt-BR')} NFS-e` },
    { label: 'ISS Atual', value: fmtMoney(ref.iss), sub: 'arrecadado sobre serviços' },
    { label: 'Alíquota ISS Efetiva', value: fmtPct(aliqIssEfetiva), sub: 'ISS ÷ base de serviços' },
    { label: 'IBS Municipal Potencial', value: fmtMoney(calc.ibs), sub: `alíquota ${fmtPct(aliqIbs)}` },
    { label: 'Δ vs ISS Atual', value: (calc.delta >= 0 ? '+' : '') + fmtMoney(calc.delta), sub: fmtPct(calc.deltaPct) },
  ]

  function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
    return (
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#3a4256' }}>{label}</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#283e93' }}>{fmt(value)}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#283e93', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aeb6c6', marginTop: 2 }}>
          <span>{fmt(min)}</span><span>{fmt(max)}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>
        <TopNav ativo="reforma" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>{nome}!</span>
          </h1>
          <span style={{ fontSize: 13, color: '#5b6477' }}>Calculadora do IBS potencial · simulação sobre a base de serviços (NFS-e)</span>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 20 }}>
          {kpis.map((k, i) => {
            const azul = i === 0
            const destaque = i === 4
            return (
              <div key={k.label} style={azul
                ? { background: '#283e93', borderRadius: 16, padding: '12px 14px', boxShadow: '0 8px 20px rgba(40,62,147,0.22)' }
                : { background: '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: azul ? 'rgba(255,255,255,0.88)' : '#1f2a44', lineHeight: 1.25, display: 'block' }}>{k.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: azul ? 'rgba(255,255,255,0.14)' : '#e9edf8', color: azul ? '#fff' : '#283e93', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{kpiIcons[i]}</div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: azul ? '#fff' : destaque ? (calc.delta >= 0 ? '#1fa463' : '#d64545') : '#1f2a44', letterSpacing: '-.5px', whiteSpace: 'nowrap' }}>{k.value}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: azul ? 'rgba(255,255,255,0.6)' : '#9098a8' }}>{k.sub}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Calculadora */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 18, marginTop: 20 }}>
          <div style={card}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Parâmetros da Simulação</span>
            <div style={{ fontSize: 12, color: '#9098a8', marginTop: 4 }}>Ajuste a alíquota municipal efetiva sob o IBS e o crescimento da base.</div>
            <Slider label="Alíquota municipal efetiva (IBS)" value={aliqIbs} min={0} max={10} step={0.1} onChange={setAliqIbs} fmt={fmtPct} />
            <Slider label="Crescimento projetado da base" value={cresc} min={-10} max={30} step={1} onChange={setCresc} fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(0) + '%'} />
            <div style={{ marginTop: 22, padding: 16, background: '#f4f7fc', borderRadius: 14 }}>
              <div style={{ fontSize: 12, color: '#5b6477', lineHeight: 1.5 }}>
                Base projetada: <strong style={{ color: '#283e93' }}>{fmtMoney(calc.baseProj)}</strong><br />
                IBS municipal potencial: <strong style={{ color: '#283e93' }}>{fmtMoney(calc.ibs)}</strong> ({fmtPct(aliqIbs)} da base)
              </div>
            </div>
          </div>

          <div style={card}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>ISS Atual × IBS Potencial</span>
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>ISS ATUAL ({ref.ano})</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <div style={{ height: 56, width: `${Math.max(10, 86 * ref.iss / maxBar).toFixed(1)}%`, borderRadius: 12, background: 'linear-gradient(90deg,#5870c4 0%,#8094d6 100%)', flex: 'none' }} />
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#283e93' }}>{fmtMoney(ref.iss)}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: calc.delta >= 0 ? '#1fa463' : '#d64545' }}>IBS POTENCIAL (simulado)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <div style={{ height: 56, width: `${Math.max(10, 86 * calc.ibs / maxBar).toFixed(1)}%`, borderRadius: 12, background: calc.delta >= 0 ? 'linear-gradient(90deg,#1fa463 0%,#6ee0a0 100%)' : 'linear-gradient(90deg,#d64545 0%,#ff9b8a 100%)', flex: 'none' }} />
                  <span style={{ fontSize: 17, fontWeight: 700, color: calc.delta >= 0 ? '#1fa463' : '#d64545' }}>{fmtMoney(calc.ibs)}</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 24, fontSize: 12, color: '#9098a8', lineHeight: 1.5, borderTop: '1px solid #eef1f7', paddingTop: 14 }}>
              Simulação ilustrativa. A repartição efetiva do IBS entre entes federativos é definida em lei (princípio do destino e período de transição da reforma); este cálculo aplica uma alíquota municipal efetiva sobre a base de serviços local para fins de planejamento.
            </div>
          </div>
        </div>

        {/* Contexto: base e ISS por ano */}
        <div style={{ ...card, marginTop: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Base de Serviços e ISS por Ano</span>
          <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Ano', 'NFS-e', 'Base de Serviços', 'ISS', 'Alíq. Efetiva'].map((h, i) => (
                    <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...anos].reverse().map((row, ri) => {
                  const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                  const ef = row.base ? row.iss / row.base * 100 : 0
                  return (
                    <tr key={row.ano}>
                      <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.ano}</td>
                      <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{row.qt.toLocaleString('pt-BR')}</td>
                      <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtMoney(row.base)}</td>
                      <td style={{ background: cellBg, color: '#1fa463', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtMoney(row.iss)}</td>
                      <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(ef)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
