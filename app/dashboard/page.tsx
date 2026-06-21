'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Tip {
  chart: 'report' | 'arrec'
  left: string
  top: string
  title: string
  l1: string
  l1c: string
  l2?: string
  l2c?: string
}

const TABELA: { mes: string; vals: string[] }[] = [
  { mes: 'Janeiro', vals: ['59.444.202,79', '70.277.740,32', '67.267.295,16', '79.892.897,62'] },
  { mes: 'Fevereiro', vals: ['50.717.657,63', '59.214.382,03', '65.331.666,15', '65.321.156,77'] },
  { mes: 'Março', vals: ['47.157.120,97', '45.822.256,18', '51.917.374,15', '68.504.503,41'] },
  { mes: 'Abril', vals: ['39.127.073,13', '52.022.165,40', '65.406.361,89', '60.991.512,54'] },
  { mes: 'Maio', vals: ['57.188.731,92', '61.750.170,60', '50.931.379,40', '67.310.295,16'] },
  { mes: 'Junho', vals: ['44.739.854,30', '53.914.449,85', '53.133.699,70', '40.964.944,01'] },
  { mes: 'Julho', vals: ['42.472.101,24', '62.045.430,91', '66.520.173,99', '0,00'] },
  { mes: 'Agosto', vals: ['45.519.058,10', '45.926.095,41', '50.313.236,53', '0,00'] },
  { mes: 'Setembro', vals: ['43.546.105,23', '42.539.041,30', '60.812.822,43', '0,00'] },
  { mes: 'Outubro', vals: ['47.709.058,28', '48.617.789,93', '55.450.322,91', '0,00'] },
  { mes: 'Novembro', vals: ['41.832.693,05', '44.077.491,00', '53.783.640,71', '0,00'] },
  { mes: 'Dezembro', vals: ['56.444.473,03', '69.069.098,08', '98.529.179,10', '0,00'] },
]

const ARREC: Tip[] = [
  { chart: 'arrec', title: 'Janeiro · 18,77%', l1: 'Ano Anterior: 67,3 mi', l1c: '#283e93', l2: 'Ano Atual: 79,9 mi', l2c: '#e8962e', left: '4.8%', top: '26.4%' },
  { chart: 'arrec', title: 'Fevereiro · -0,02%', l1: 'Ano Anterior: 65,3 mi', l1c: '#283e93', l2: 'Ano Atual: 65,3 mi', l2c: '#e8962e', left: '13.1%', top: '36.0%' },
  { chart: 'arrec', title: 'Março · 31,95%', l1: 'Ano Anterior: 51,9 mi', l1c: '#283e93', l2: 'Ano Atual: 68,5 mi', l2c: '#e8962e', left: '21.3%', top: '33.9%' },
  { chart: 'arrec', title: 'Abril · -6,75%', l1: 'Ano Anterior: 65,4 mi', l1c: '#283e93', l2: 'Ano Atual: 61,0 mi', l2c: '#e8962e', left: '29.5%', top: '35.9%' },
  { chart: 'arrec', title: 'Maio · 32,16%', l1: 'Ano Anterior: 50,9 mi', l1c: '#283e93', l2: 'Ano Atual: 67,3 mi', l2c: '#e8962e', left: '37.7%', top: '34.7%' },
  { chart: 'arrec', title: 'Junho · -22,90%', l1: 'Ano Anterior: 53,1 mi', l1c: '#283e93', l2: 'Ano Atual: 41,0 mi', l2c: '#e8962e', left: '45.9%', top: '44.0%' },
  { chart: 'arrec', title: 'Julho · -100,00%', l1: 'Ano Anterior: 66,5 mi', l1c: '#283e93', l2: 'Ano Atual: 0,0', l2c: '#e8962e', left: '54.1%', top: '35.2%' },
  { chart: 'arrec', title: 'Agosto · -100,00%', l1: 'Ano Anterior: 50,3 mi', l1c: '#283e93', l2: 'Ano Atual: 0,0', l2c: '#e8962e', left: '62.3%', top: '45.9%' },
  { chart: 'arrec', title: 'Setembro · -100,00%', l1: 'Ano Anterior: 60,8 mi', l1c: '#283e93', l2: 'Ano Atual: 0,0', l2c: '#e8962e', left: '70.5%', top: '38.9%' },
  { chart: 'arrec', title: 'Outubro · -100,00%', l1: 'Ano Anterior: 55,5 mi', l1c: '#283e93', l2: 'Ano Atual: 0,0', l2c: '#e8962e', left: '78.7%', top: '42.4%' },
  { chart: 'arrec', title: 'Novembro · -100,00%', l1: 'Ano Anterior: 53,8 mi', l1c: '#283e93', l2: 'Ano Atual: 0,0', l2c: '#e8962e', left: '86.9%', top: '43.6%' },
  { chart: 'arrec', title: 'Dezembro · -100,00%', l1: 'Ano Anterior: 98,5 mi', l1c: '#283e93', l2: 'Ano Atual: 0,0', l2c: '#e8962e', left: '95.2%', top: '14.1%' },
]

const REPORT: Tip[] = [
  { chart: 'report', title: '2022', l1: 'Arrecadado: 412,6 mi', l1c: '#283e93', l2: 'Previsto: 365,0 mi', l2c: '#e8962e', left: '15%', top: '28%' },
  { chart: 'report', title: '2023', l1: 'Arrecadado: 478,3 mi', l1c: '#283e93', l2: 'Previsto: 510,2 mi', l2c: '#e8962e', left: '39%', top: '28%' },
  { chart: 'report', title: '2024', l1: 'Arrecadado: 521,9 mi', l1c: '#283e93', l2: 'Previsto: 489,4 mi', l2c: '#e8962e', left: '64%', top: '28%' },
  { chart: 'report', title: '2025', l1: 'Arrecadado: 564,1 mi', l1c: '#283e93', l2: 'Previsto: 540,8 mi', l2c: '#e8962e', left: '88%', top: '28%' },
]

// barras visíveis do gráfico "Arrecadação por Mês"
const BARS = [
  { ant: { x: 24.3, y: 131.8, h: 168.3 }, atu: { x: 56.3, y: 100.3, h: 199.8 }, tx: 52.3, mes: 'Janeiro', pct: '18,77%' },
  { ant: { x: 113.0, y: 136.8, h: 163.3 }, atu: { x: 145.0, y: 136.8, h: 163.3 }, tx: 141.0, mes: 'Fevereiro', pct: '-0,02%' },
  { ant: { x: 201.7, y: 170.3, h: 129.8 }, atu: { x: 233.7, y: 128.8, h: 171.3 }, tx: 229.7, mes: 'Março', pct: '31,95%' },
  { ant: { x: 290.3, y: 136.5, h: 163.5 }, atu: { x: 322.3, y: 147.5, h: 152.5 }, tx: 318.3, mes: 'Abril', pct: '-6,75%' },
  { ant: { x: 379.0, y: 172.8, h: 127.3 }, atu: { x: 411.0, y: 131.8, h: 168.3 }, tx: 407.0, mes: 'Maio', pct: '32,16%' },
  { ant: { x: 467.7, y: 167.3, h: 132.8 }, atu: { x: 499.7, y: 197.5, h: 102.5 }, tx: 495.7, mes: 'Junho', pct: '-22,90%' },
  { ant: { x: 556.3, y: 133.8, h: 166.3 }, atu: null, tx: 584.3, mes: 'Julho', pct: '-100,00%' },
  { ant: { x: 645.0, y: 174.3, h: 125.8 }, atu: null, tx: 673.0, mes: 'Agosto', pct: '-100,00%' },
  { ant: { x: 733.7, y: 148.0, h: 152.0 }, atu: null, tx: 761.7, mes: 'Setembro', pct: '-100,00%' },
  { ant: { x: 822.3, y: 161.3, h: 138.8 }, atu: null, tx: 850.3, mes: 'Outubro', pct: '-100,00%' },
  { ant: { x: 911.0, y: 165.5, h: 134.5 }, atu: null, tx: 939.0, mes: 'Novembro', pct: '-100,00%' },
  { ant: { x: 999.7, y: 53.8, h: 246.3 }, atu: null, tx: 1027.7, mes: 'Dezembro', pct: '-100,00%' },
]
const HOT = [
  { x: 8.0, left: '4.8%' }, { x: 96.7, left: '13.1%' }, { x: 185.3, left: '21.3%' }, { x: 274.0, left: '29.5%' },
  { x: 362.7, left: '37.7%' }, { x: 451.3, left: '45.9%' }, { x: 540.0, left: '54.1%' }, { x: 628.7, left: '62.3%' },
  { x: 717.3, left: '70.5%' }, { x: 806.0, left: '78.7%' }, { x: 894.7, left: '86.9%' }, { x: 983.3, left: '95.2%' },
]

export default function DashboardPage() {
  const router = useRouter()
  const [tip, setTip] = useState<Tip | null>(null)
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('receita')

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const tipReport = tip && tip.chart === 'report' ? tip : null
  const tipArrec = tip && tip.chart === 'arrec' ? tip : null

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const navTab: React.CSSProperties = { padding: '9px 18px', borderRadius: 24, color: '#5b6477', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }
  const toolPill: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }
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

  // KPIs (o primeiro é o card azul)
  const kpis = [
    { label: 'Orçado Atualizado', value: '877,06 mi', sub: 'Ano Anterior', subVal: '816,64 mi', pct: '7,40%', pctColor: '#1fa463',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="1.8"><rect x="5" y="3" width="11" height="18" rx="1" /><path d="M8 7h2M12 7h1.5M8 11h2M12 11h1.5M8 15h2M12 15h1.5" /><path d="M16 21h3V11h-3" /></svg> },
    { label: 'Arrecadação Mês', value: '382,99 mi', sub: 'Ano Anterior', subVal: '739,40 mi', pct: '-48,20%', pctColor: '#d64545',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="1.8"><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.6 3.1 3 7 3s7-1.4 7-3v-5" /><path d="M5 11.5v5c0 1.6 3.1 3 7 3s7-1.4 7-3v-5" /></svg> },
    { label: 'Arrecadação Até o Mês', value: '382,99 mi', sub: 'Ano Anterior', subVal: '739,40 mi', pct: '-48,20%', pctColor: '#d64545',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="1.8"><path d="M20 11a8 8 0 1 0-.5 4" /><path d="M20 5v6h-6" /></svg> },
    { label: 'Arrecadação Mês Anterior', value: '0,00', sub: 'Mês Atual', subVal: '0,00', pct: '0,00%', pctColor: '#9098a8',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', borderRadius: 20, padding: '12px 18px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo-aruja.png" alt="Prefeitura Municipal de Arujá" style={{ height: 46, width: 'auto', display: 'block' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            <span style={{ padding: '9px 20px', borderRadius: 24, background: '#283e93', color: '#ffffff', fontSize: 14, fontWeight: 500, boxShadow: '0 6px 14px rgba(40,62,147,0.35)' }}>Orçamento</span>
            <span style={navTab}>Contribuinte</span>
            <span style={navTab}>Imobiliário</span>
            <span style={navTab}>Mobiliário</span>
            <span style={navTab}>Arrecada Mais</span>
            <Link href="/chat" style={navTab}>Chat</Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/catalogo" title="Catálogo de dados" style={{ width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></svg>
            </Link>
            <div style={{ position: 'relative', width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: '#283e93', border: '2px solid #e9edf8' }}></span>
            </div>
            <button onClick={handleLogout} title="Sair" style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid #ffffff', boxShadow: '0 0 0 1px #e3e9f5', padding: 0, cursor: 'pointer', background: 'transparent' }}>
              <svg viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" fill="#cdd9ee" /><circle cx="20" cy="15" r="8" fill="#9fb2d4" /><path d="M5 40 a15 13 0 0 1 30 0" fill="#9fb2d4" /></svg>
            </button>
          </div>
        </div>

        {/* ===== GREETING ROW ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            Good Morning, <span style={{ color: '#7d8fce' }}>Selena!</span>
          </h1>
          <div role="radiogroup" aria-label="Tipo" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            {(['receita', 'despesa'] as const).map(op => {
              const ativo = tipo === op
              return (
                <button
                  key={op}
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setTipo(op)}
                  style={{
                    padding: '10px 26px',
                    borderRadius: 24,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
                    fontSize: 14,
                    fontWeight: ativo ? 600 : 500,
                    background: ativo ? '#283e93' : 'transparent',
                    color: ativo ? '#fff' : '#5b6477',
                    boxShadow: ativo ? '0 6px 14px rgba(40,62,147,0.35)' : 'none',
                    transition: 'background .15s, color .15s',
                  }}
                >
                  {op === 'receita' ? 'Receita' : 'Despesa'}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== TOOLBAR ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={toolPill}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4" /></svg> Filter
            </div>
            <div style={toolPill}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> Monthly
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
            </div>
            <div style={toolPill}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg> Download Data
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </div>
            <div style={toolPill}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg> Support
            </div>
            <div style={toolPill}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg> Content Layout
            </div>
          </div>
        </div>

        {/* ===== KPIs ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 20 }}>
          {/* Card azul: Orçado */}
          <div style={{ background: '#283e93', borderRadius: 16, padding: '12px 14px', boxShadow: '0 8px 20px rgba(40,62,147,0.22)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.25, display: 'block' }}>Orçado</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17.5" cy="9" r="2.3" /><path d="M16 19a4.5 4.5 0 0 1 5.5-4.4" /></svg>
              </div>
              <span style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: '-.5px', whiteSpace: 'nowrap' }}>829,72 mi</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Ano Anterior <span style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>761,14 mi</span></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6ee0a0', flex: 'none' }}>9,01%</span>
            </div>
          </div>

          {/* Cards brancos */}
          {kpis.map(k => (
            <div key={k.label} style={{ background: '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44', lineHeight: 1.25, display: 'block' }}>{k.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{k.icon}</div>
                <span style={{ fontSize: 19, fontWeight: 700, color: '#1f2a44', letterSpacing: '-.5px', whiteSpace: 'nowrap' }}>{k.value}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#9098a8' }}>{k.sub} <span style={{ color: '#3a4256', fontWeight: 600 }}>{k.subVal}</span></span>
                <span style={{ fontSize: 12, fontWeight: 700, color: k.pctColor, flex: 'none' }}>{k.pct}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ===== ROW 1 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.68fr 1fr 1.32fr', gap: 18, marginTop: 20 }}>

          {/* Arrecadação por Ano */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Arrecadação por Ano</span>
              <span style={reportBadge}>Anual</span>
            </div>
            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 18, cursor: 'pointer' }}>
              <div style={{ position: 'absolute', left: 30, top: -2, display: 'flex', gap: 10, zIndex: 2 }}>
                <span style={{ background: '#283e93', color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: 14, padding: '4px 11px' }}>Arrecadado</span>
                <span style={{ background: '#fff', color: '#1f2a44', fontSize: 11, fontWeight: 500, borderRadius: 14, padding: '4px 11px', boxShadow: '0 2px 8px rgba(40,80,180,0.12)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e8962e' }}></span>Previsto
                </span>
              </div>
              <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
                <text x="4" y="32" fontSize="6.5" fill="#aeb6c6" style={axisFont}>600</text>
                <text x="4" y="76" fontSize="6.5" fill="#aeb6c6" style={axisFont}>400</text>
                <text x="4" y="114" fontSize="6.5" fill="#aeb6c6" style={axisFont}>200</text>
                <g transform="matrix(1,0,0,0.78,0,4.4)">
                  <line x1="110" y1="20" x2="110" y2="140" stroke="#cfd8e8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <path d="M30 95 C55 70 80 60 110 80 C140 100 165 120 195 110 C225 100 255 70 290 60" fill="none" stroke="#e8962e" strokeWidth="3" strokeLinecap="round" />
                  <path d="M30 70 C55 95 80 110 110 80 C140 50 165 50 195 70 C225 90 255 95 290 85" fill="none" stroke="#283e93" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="110" cy="80" r="5" fill="#283e93" stroke="#fff" strokeWidth="2.5" />
                </g>
                <text x="20" y="126" fontSize="6.5" fill="#aeb6c6" style={axisFont}>2022</text>
                <text x="92" y="126" fontSize="6.5" fill="#aeb6c6" style={axisFont}>2023</text>
                <text x="172" y="126" fontSize="6.5" fill="#aeb6c6" style={axisFont}>2024</text>
                <text x="264" y="126" fontSize="6.5" fill="#aeb6c6" style={axisFont}>2025</text>
                {[{ x: 10, w: 72 }, { x: 82, w: 73 }, { x: 155, w: 72 }, { x: 227, w: 73 }].map((r, i) => (
                  <rect key={i} onMouseEnter={() => setTip(REPORT[i])} x={r.x} y="0" width={r.w} height="120" fill="transparent" pointerEvents="all" />
                ))}
              </svg>
              {tipReport ? <Tooltip t={tipReport} /> : null}
            </div>
          </div>

          {/* News From The Doctor */}
          <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
              </div>
              <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Today&apos;s info</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 17, fontWeight: 600, color: '#fff' }}>News From The Doctor</div>
            <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>Our process is designed to make booking appointments, consultations, and treatments easy and convenient for you.</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <span style={{ height: 4, width: 26, borderRadius: 3, background: '#fff' }}></span>
              <span style={{ height: 4, width: 18, borderRadius: 3, background: 'rgba(255,255,255,0.4)' }}></span>
              <span style={{ height: 4, width: 18, borderRadius: 3, background: 'rgba(255,255,255,0.4)' }}></span>
              <span style={{ height: 4, width: 18, borderRadius: 3, background: 'rgba(255,255,255,0.4)' }}></span>
            </div>
          </div>

          {/* Arrecadação por Categoria / Origem */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Arrecadação por Categoria / Origem</span>
              <span style={dots}>···</span>
            </div>
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 30 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>RECEITAS CORRENTES</div>
                <div style={{ height: 70, width: '90%', borderRadius: 12, marginTop: 12, background: 'linear-gradient(90deg,#283e93 0%,#8094d6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, boxSizing: 'border-box' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>370,05M</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>RECEITAS DE CAPITAL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12 }}>
                  <div style={{ height: 70, width: 22, borderRadius: 12, background: 'linear-gradient(90deg,#283e93 0%,#5870c4 100%)', flex: 'none' }}></div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#283e93' }}>12,94M</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== ROW 2 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.75fr 1fr', gap: 18, marginTop: 18 }}>

          {/* Arrecadação por Mês */}
          <div style={{ position: 'relative', background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Arrecadação por Mês</span>
              <div style={{ display: 'flex', gap: 22, fontSize: 12, color: '#5b6477' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Valor Arrecadação Ano Anterior</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e' }}></span>Valor Arrecadação Ano Atual</span>
              </div>
            </div>
            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 16, cursor: 'pointer' }}>
              <svg viewBox="0 0 1080 380" width="100%" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="arrAnt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#b9c4e8" /></linearGradient>
                  <linearGradient id="arrAtu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8962e" /><stop offset="100%" stopColor="#f5d7a6" /></linearGradient>
                </defs>
                <line x1="8" y1="300" x2="1072" y2="300" stroke="#e3e8f1" strokeWidth="1.5" />
                <line x1="8" y1="146" x2="1072" y2="146" stroke="#c9d6ee" strokeWidth="1.6" strokeDasharray="5 5" />
                <circle cx="52.3" cy="146" r="5" fill="#283e93" stroke="#fff" strokeWidth="2.5" />
                <text x="1066" y="139" fontSize="12" fill="#5b6477" style={axisFont} textAnchor="end">Média 61,6 mi</text>
                {BARS.map((b, i) => (
                  <g key={i}>
                    <rect x={b.ant.x} y={b.ant.y} width="24" height={b.ant.h} rx="6" fill="url(#arrAnt)" />
                    {b.atu ? <rect x={b.atu.x} y={b.atu.y} width="24" height={b.atu.h} rx="6" fill="url(#arrAtu)" /> : null}
                    <text x={b.tx} y="324" fontSize="13" fill="#3a4256" style={axisFont} textAnchor="middle">{b.mes}</text>
                    <text x={b.tx} y="350" fontSize="12" fill="#5b6477" style={axisFont} textAnchor="middle">{b.pct}</text>
                  </g>
                ))}
                {HOT.map((h, i) => (
                  <rect key={i} onMouseEnter={() => setTip(ARREC[i])} x={h.x} y="40" width="88.7" height="260.0" fill="transparent" pointerEvents="all" />
                ))}
              </svg>
              {tipArrec ? <Tooltip t={tipArrec} /> : null}
            </div>
          </div>

          {/* Arrecadação Dívida Ativa */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Arrecadação Dívida Ativa</span>
              <span style={dots}>···</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>R$ 9.618.583,26</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <svg viewBox="0 0 200 200" width="158" height="158">
                <g transform="rotate(-90 100 100)">
                  <circle cx="100" cy="100" r="66" fill="none" stroke="#283e93" strokeWidth="30" strokeDasharray="329.0 414.7" strokeDashoffset="0" />
                  <circle cx="100" cy="100" r="66" fill="none" stroke="#e8962e" strokeWidth="30" strokeDasharray="85.3 414.7" strokeDashoffset="-329.0" />
                  <circle cx="100" cy="100" r="66" fill="none" stroke="#aab8e3" strokeWidth="30" strokeDasharray="2.0 414.7" strokeDashoffset="-414.3" />
                </g>
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93', flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>IMPOSTOS</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>7,63M <span style={{ color: '#9098a8', fontWeight: 500 }}>(79,33%)</span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e', flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>TAXAS</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>1,98M <span style={{ color: '#9098a8', fontWeight: 500 }}>(20,58%)</span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#aab8e3', flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>DEMAIS RECEITAS CORRENTES</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>8,27K <span style={{ color: '#9098a8', fontWeight: 500 }}>(0,09%)</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Histórico Mensal (tabela) ===== */}
        <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Histórico Mensal de Arrecadação por Ano</span>
          <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Meses', '2023', '2024', '2025', '2026'].map((h, i) => (
                    <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABELA.map((row, ri) => {
                  const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                  return (
                    <tr key={row.mes}>
                      <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.mes}</td>
                      {row.vals.map((v, ci) => (
                        <td key={ci} style={{ background: cellBg, color: v === '0,00' ? '#9098a8' : '#c0612a', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>R$ {v}</td>
                      ))}
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
