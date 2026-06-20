'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Tip {
  chart: 'report' | 'trend' | 'bars'
  left: string
  top: string
  title: string
  l1: string
  l1c: string
  l2?: string
  l2c?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [tip, setTip] = useState<Tip | null>(null)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const tipReport = tip && tip.chart === 'report' ? tip : null
  const tipTrend = tip && tip.chart === 'trend' ? tip : null
  const tipBars = tip && tip.chart === 'bars' ? tip : null

  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 22,
    padding: 20,
    boxShadow: '0 6px 22px rgba(40,80,180,0.05)',
  }
  const pill: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: '#283e93',
    border: '1.5px solid #cdd5ef',
    borderRadius: 18,
    padding: '5px 13px',
  }
  const navTab: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: 24,
    color: '#5b6477',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
  }

  function Tooltip({ t }: { t: Tip }) {
    return (
      <div
        style={{
          position: 'absolute',
          left: t.left,
          top: t.top,
          transform: 'translate(-50%,-115%)',
          background: '#23304b',
          borderRadius: 10,
          padding: '8px 11px',
          boxShadow: '0 8px 18px rgba(20,40,90,0.25)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 5,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l1c }}></span>
          {t.l1}
        </div>
        {t.l2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.l2c }}></span>
            {t.l2}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eef2f9',
        padding: '26px 14px',
        fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV ===== */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            borderRadius: 20,
            padding: '12px 18px',
            boxShadow: '0 6px 22px rgba(40,80,180,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo-aruja.png" alt="Prefeitura Municipal de Arujá" style={{ height: 46, width: 'auto', display: 'block' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            <span
              style={{
                padding: '9px 20px',
                borderRadius: 24,
                background: '#283e93',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 6px 14px rgba(40,62,147,0.35)',
              }}
            >
              Orçamento
            </span>
            <span style={navTab}>Receita</span>
            <span style={navTab}>Despesas</span>
            <span style={navTab}>Tributário</span>
            <Link href="/chat" style={navTab}>Chat</Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/catalogo" title="Catálogo de dados" style={{ width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <div style={{ position: 'relative', width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: '#283e93', border: '2px solid #e9edf8' }}></span>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid #ffffff', boxShadow: '0 0 0 1px #e3e9f5', padding: 0, cursor: 'pointer', background: 'transparent' }}
            >
              <svg viewBox="0 0 40 40" width="40" height="40">
                <rect width="40" height="40" fill="#cdd9ee" />
                <circle cx="20" cy="15" r="8" fill="#9fb2d4" />
                <path d="M5 40 a15 13 0 0 1 30 0" fill="#9fb2d4" />
              </svg>
            </button>
          </div>
        </div>

        {/* ===== GREETING ROW ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            Good Morning, <span style={{ color: '#7d8fce' }}>Selena!</span>
          </h1>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#283e93',
              color: '#fff',
              border: 'none',
              padding: '12px 22px',
              borderRadius: 24,
              fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 8px 18px rgba(40,62,147,0.32)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Check new
          </button>
        </div>

        {/* ===== TOOLBAR ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4" /></svg> Filter
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> Monthly
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg> Download Data
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg> Support
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg> Content Layout
            </div>
          </div>
        </div>

        {/* ===== ROW 1 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.32fr 1.05fr 1.05fr 1.05fr', gap: 18, marginTop: 20 }}>

          {/* Health Report Pending */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Health Report Pending</span>
              <span style={pill}>Report</span>
            </div>
            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 18, cursor: 'pointer' }}>
              <div style={{ position: 'absolute', left: 30, top: -2, display: 'flex', gap: 10, zIndex: 2 }}>
                <span style={{ background: '#1f2a44', color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: 14, padding: '4px 11px' }}>15 Report</span>
                <span style={{ background: '#fff', color: '#1f2a44', fontSize: 11, fontWeight: 500, borderRadius: 14, padding: '4px 11px', boxShadow: '0 2px 8px rgba(40,80,180,0.12)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#283e93' }}></span>10 No Report
                </span>
              </div>
              <svg viewBox="0 0 300 160" width="100%" style={{ display: 'block' }}>
                <text x="6" y="36" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">30</text>
                <text x="6" y="92" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">20</text>
                <text x="6" y="140" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">10</text>
                <line x1="110" y1="20" x2="110" y2="140" stroke="#cfd8e8" strokeWidth="1.5" strokeDasharray="4 4" />
                <path d="M30 95 C55 70 80 60 110 80 C140 100 165 120 195 110 C225 100 255 70 290 60" fill="none" stroke="#aab8e3" strokeWidth="3" strokeLinecap="round" />
                <path d="M30 70 C55 95 80 110 110 80 C140 50 165 50 195 70 C225 90 255 95 290 85" fill="none" stroke="#283e93" strokeWidth="3" strokeLinecap="round" />
                <circle cx="110" cy="80" r="5" fill="#283e93" stroke="#fff" strokeWidth="2.5" />
                <text x="26" y="156" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Jan</text>
                <text x="98" y="156" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Feb</text>
                <text x="178" y="156" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Mar</text>
                <text x="270" y="156" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Apr</text>
                <rect onMouseEnter={() => setTip({ chart: 'report', title: 'Jan', l1: '12 Report', l1c: '#283e93', l2: '8 No Report', l2c: '#aab8e3', left: '15%', top: '28%' })} x="10" y="0" width="72" height="150" fill="transparent" pointerEvents="all" />
                <rect onMouseEnter={() => setTip({ chart: 'report', title: 'Feb', l1: '15 Report', l1c: '#283e93', l2: '10 No Report', l2c: '#aab8e3', left: '39%', top: '28%' })} x="82" y="0" width="73" height="150" fill="transparent" pointerEvents="all" />
                <rect onMouseEnter={() => setTip({ chart: 'report', title: 'Mar', l1: '18 Report', l1c: '#283e93', l2: '7 No Report', l2c: '#aab8e3', left: '64%', top: '28%' })} x="155" y="0" width="72" height="150" fill="transparent" pointerEvents="all" />
                <rect onMouseEnter={() => setTip({ chart: 'report', title: 'Apr', l1: '22 Report', l1c: '#283e93', l2: '6 No Report', l2c: '#aab8e3', left: '88%', top: '28%' })} x="227" y="0" width="73" height="150" fill="transparent" pointerEvents="all" />
              </svg>
              {tipReport ? <Tooltip t={tipReport} /> : null}
            </div>
          </div>

          {/* News From The Doctor */}
          <div style={{ position: 'relative', borderRadius: 22, padding: 20, background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
              </div>
              <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Today&apos;s info</span>
            </div>
            <div style={{ marginTop: 26, fontSize: 18, fontWeight: 600, color: '#fff' }}>News From The Doctor</div>
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>
              Our process is designed to make booking appointments, consultations, and treatments easy and convenient for you.
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
              <span style={{ height: 4, width: 26, borderRadius: 3, background: '#fff' }}></span>
              <span style={{ height: 4, width: 18, borderRadius: 3, background: 'rgba(255,255,255,0.4)' }}></span>
              <span style={{ height: 4, width: 18, borderRadius: 3, background: 'rgba(255,255,255,0.4)' }}></span>
              <span style={{ height: 4, width: 18, borderRadius: 3, background: 'rgba(255,255,255,0.4)' }}></span>
            </div>
          </div>

          {/* Health Trend Chart */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Health Trend Chart</span>
              <span style={{ color: '#aeb6c6', fontWeight: 700, letterSpacing: 1, fontSize: 14 }}>···</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#1f2a44' }}>85%</span>
              <span style={{ background: '#d8f5e3', color: '#1fa463', fontSize: 11, fontWeight: 600, borderRadius: 14, padding: '4px 9px' }}>+0,75%</span>
            </div>
            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 6, cursor: 'pointer' }}>
              <svg viewBox="0 0 220 120" width="100%" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="trendg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#283e93" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#283e93" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M10 96 C30 94 36 90 52 86 C70 81 74 58 92 54 C112 50 118 48 134 45 C156 41 168 24 196 20 L210 18 L210 100 L10 100 Z" fill="url(#trendg)" />
                <path d="M10 96 C30 94 36 90 52 86 C70 81 74 58 92 54 C112 50 118 48 134 45 C156 41 168 24 196 20 L210 18" fill="none" stroke="#283e93" strokeWidth="3" strokeLinecap="round" />
                <circle cx="92" cy="54" r="5" fill="#283e93" stroke="#fff" strokeWidth="2.5" />
                <text x="6" y="118" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Mon</text>
                <text x="62" y="118" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Tue</text>
                <text x="120" y="118" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Wed</text>
                <text x="178" y="118" fontSize="11" fill="#aeb6c6" fontFamily="Poppins">Thu</text>
                <rect onMouseEnter={() => setTip({ chart: 'trend', title: 'Monday', l1: 'Score 62%', l1c: '#283e93', left: '16%', top: '78%' })} x="10" y="0" width="52" height="105" fill="transparent" pointerEvents="all" />
                <rect onMouseEnter={() => setTip({ chart: 'trend', title: 'Tuesday', l1: 'Score 70%', l1c: '#283e93', left: '41%', top: '56%' })} x="62" y="0" width="58" height="105" fill="transparent" pointerEvents="all" />
                <rect onMouseEnter={() => setTip({ chart: 'trend', title: 'Wednesday', l1: 'Score 78%', l1c: '#283e93', left: '68%', top: '40%' })} x="120" y="0" width="58" height="105" fill="transparent" pointerEvents="all" />
                <rect onMouseEnter={() => setTip({ chart: 'trend', title: 'Thursday', l1: 'Score 85%', l1c: '#283e93', left: '90%', top: '18%' })} x="178" y="0" width="42" height="105" fill="transparent" pointerEvents="all" />
              </svg>
              {tipTrend ? <Tooltip t={tipTrend} /> : null}
            </div>
          </div>

          {/* Checkup progress */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Checkup progress</span>
              <span style={{ color: '#aeb6c6', fontWeight: 700, letterSpacing: 1, fontSize: 14 }}>···</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="9" r="1.6" /><path d="M21 16l-5-5L5 21" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2a44' }}>22 Agustus, 2024</div>
                <div style={{ position: 'relative', height: 5, borderRadius: 4, background: '#e6eaf6', marginTop: 9 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: 5, width: '62%', borderRadius: 4, background: '#283e93' }}></div>
                  <div style={{ position: 'absolute', left: '62%', top: '50%', transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: '#283e93', border: '2px solid #fff', boxShadow: '0 0 0 1px #283e93' }}></div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="9" r="1.6" /><path d="M21 16l-5-5L5 21" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2a44' }}>16 Agustus, 2024</div>
                <div style={{ position: 'relative', height: 5, borderRadius: 4, background: '#e6eaf6', marginTop: 9 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: 5, width: '45%', borderRadius: 4, background: '#283e93' }}></div>
                  <div style={{ position: 'absolute', left: '45%', top: '50%', transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: '#283e93', border: '2px solid #fff', boxShadow: '0 0 0 1px #283e93' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== ROW 2 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.55fr 1.05fr', gap: 18, marginTop: 18 }}>

          {/* Medical Information */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Medical Information</span>
              <span style={pill}>See Details</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden' }}>
                  <svg viewBox="0 0 44 44" width="44" height="44"><rect width="44" height="44" fill="#cdd9ee" /><circle cx="22" cy="17" r="9" fill="#9fb2d4" /><path d="M5 44 a17 14 0 0 1 34 0" fill="#9fb2d4" /></svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44' }}>Cameron Williamson</div>
                  <div style={{ fontSize: 12, color: '#9098a8' }}>Pasien</div>
                </div>
              </div>
              <svg width="44" height="44" viewBox="0 0 44 44">
                <g fill="#283e93">
                  <rect x="0" y="0" width="14" height="14" rx="2" /><rect x="3" y="3" width="8" height="8" rx="1" fill="#fff" /><rect x="5" y="5" width="4" height="4" fill="#283e93" />
                  <rect x="30" y="0" width="14" height="14" rx="2" /><rect x="33" y="3" width="8" height="8" rx="1" fill="#fff" /><rect x="35" y="5" width="4" height="4" fill="#283e93" />
                  <rect x="0" y="30" width="14" height="14" rx="2" /><rect x="3" y="33" width="8" height="8" rx="1" fill="#fff" /><rect x="5" y="35" width="4" height="4" fill="#283e93" />
                  <rect x="18" y="0" width="4" height="4" /><rect x="24" y="4" width="4" height="4" /><rect x="18" y="8" width="4" height="4" />
                  <rect x="24" y="18" width="4" height="4" /><rect x="32" y="18" width="4" height="4" /><rect x="40" y="22" width="4" height="4" />
                  <rect x="20" y="24" width="4" height="4" /><rect x="28" y="28" width="4" height="4" /><rect x="36" y="30" width="4" height="4" />
                  <rect x="24" y="36" width="4" height="4" /><rect x="32" y="40" width="4" height="4" /><rect x="40" y="38" width="4" height="4" />
                  <rect x="18" y="22" width="4" height="4" />
                </g>
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Medical History</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2a44', marginTop: 3 }}>Medical inpatient care</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Current Medications</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2a44', marginTop: 3 }}>Herbal medicine</div>
              </div>
            </div>
            <div style={{ height: 1, background: '#eef1f7', margin: '18px 0' }}></div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Allergies</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2a44', marginTop: 3 }}>No allergies present</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Primary Physician</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2a44', marginTop: 3 }}>Dr.Leslie Alexander</div>
              </div>
            </div>
          </div>

          {/* Patient health report */}
          <div style={{ position: 'relative', ...card }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Patient health report</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, color: '#6b7384' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#aab8e3' }}></span>Progress</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#283e93' }}></span>Recovery</span>
                </div>
                <span style={pill}>See Details</span>
              </div>
            </div>

            <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
              <svg viewBox="0 0 500 250" width="100%" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#c2cdef" /></linearGradient>
                  <linearGradient id="barl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e9edf8" /><stop offset="100%" stopColor="#f6f9fe" /></linearGradient>
                </defs>
                <text x="14" y="28" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">70</text>
                <text x="14" y="93" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">50</text>
                <text x="14" y="158" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">30</text>
                <text x="14" y="223" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">10</text>

                <line x1="48" y1="88" x2="492" y2="88" stroke="#c9d6ee" strokeWidth="1.6" strokeDasharray="5 5" />

                <rect onMouseEnter={() => setTip({ chart: 'bars', title: 'January', l1: 'Towards recovery: 30', l1c: '#5870c4', l2: 'Treatment process: 18', l2c: '#1f2a44', left: '16%', top: '60%' })} x="67" y="150" width="28" height="80" rx="8" fill="url(#barl)" />
                <rect onMouseEnter={() => setTip({ chart: 'bars', title: 'February', l1: 'Towards recovery: 73', l1c: '#5870c4', l2: 'Treatment process: 40', l2c: '#1f2a44', left: '32%', top: '9%' })} x="148" y="22" width="28" height="208" rx="8" fill="url(#barg)" />
                <rect onMouseEnter={() => setTip({ chart: 'bars', title: 'March', l1: 'Towards recovery: 24', l1c: '#5870c4', l2: 'Treatment process: 14', l2c: '#1f2a44', left: '49%', top: '66%' })} x="229" y="165" width="28" height="65" rx="8" fill="url(#barl)" />
                <rect onMouseEnter={() => setTip({ chart: 'bars', title: 'April', l1: 'Towards recovery: 27', l1c: '#5870c4', l2: 'Treatment process: 16', l2c: '#1f2a44', left: '65%', top: '63%' })} x="310" y="158" width="28" height="72" rx="8" fill="url(#barl)" />
                <rect onMouseEnter={() => setTip({ chart: 'bars', title: 'May', l1: 'Towards recovery: 46', l1c: '#5870c4', l2: 'Treatment process: 28', l2c: '#1f2a44', left: '81%', top: '40%' })} x="391" y="100" width="28" height="130" rx="8" fill="url(#barg)" />
                <rect onMouseEnter={() => setTip({ chart: 'bars', title: 'June', l1: 'Towards recovery: 30', l1c: '#5870c4', l2: 'Treatment process: 20', l2c: '#1f2a44', left: '94%', top: '60%' })} x="455" y="150" width="28" height="80" rx="8" fill="url(#barl)" />

                <circle cx="81" cy="88" r="5" fill="#283e93" stroke="#fff" strokeWidth="2.5" />

                <text x="68" y="246" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">Jan</text>
                <text x="149" y="246" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">Feb</text>
                <text x="230" y="246" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">Mar</text>
                <text x="311" y="246" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">Apr</text>
                <text x="392" y="246" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">May</text>
                <text x="456" y="246" fontSize="12" fill="#aeb6c6" fontFamily="Poppins">Jun</text>
              </svg>

              {tipBars ? <Tooltip t={tipBars} /> : null}
            </div>
          </div>

          {/* My Doctor */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>My Doctor</span>
              <span style={pill}>See Details</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flex: 'none' }}><svg viewBox="0 0 44 44" width="44" height="44"><rect width="44" height="44" fill="#cfe0f7" /><circle cx="22" cy="17" r="9" fill="#8fb0e0" /><path d="M5 44 a17 14 0 0 1 34 0" fill="#8fb0e0" /></svg></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44' }}>Dr.Leslie Alexander</div>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Hasan Sadikin Hospital</div>
              </div>
            </div>
            <div style={{ height: 1, background: '#eef1f7', margin: '16px 0' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flex: 'none' }}><svg viewBox="0 0 44 44" width="44" height="44"><rect width="44" height="44" fill="#f3d9e2" /><circle cx="22" cy="17" r="9" fill="#d29bb0" /><path d="M5 44 a17 14 0 0 1 34 0" fill="#d29bb0" /></svg></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44' }}>Dr.Savannah Nguyen</div>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Hasan Sadikin Hospital</div>
              </div>
            </div>
            <div style={{ height: 1, background: '#eef1f7', margin: '16px 0' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flex: 'none' }}><svg viewBox="0 0 44 44" width="44" height="44"><rect width="44" height="44" fill="#cfe0f7" /><circle cx="22" cy="17" r="9" fill="#7f93b8" /><path d="M5 44 a17 14 0 0 1 34 0" fill="#7f93b8" /></svg></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44' }}>Dr.Darlene Robertson</div>
                <div style={{ fontSize: 12, color: '#9098a8' }}>Hasan Sadikin Hospital</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
