# Dashboard Orçamento Municipal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a página `/orcamento` com dashboard de orçamento municipal (KPIs, gráficos, gauge, donut) usando dados mock e sistema visual Kallas.

**Architecture:** API route `GET /api/orcamento?ano=N` retorna JSON com 4 blocos; página client-side faz fetch no `useEffect` ao mudar `ano`; Recharts renderiza 4 widgets. Sidebar das outras páginas recebe link "Orçamento" como primeiro item.

**Tech Stack:** Next.js 14 App Router, TypeScript, Recharts 3 (BarChart, PieChart, Cell), Tailwind (mínimo), CSS inline com dangerouslySetInnerHTML, sistema de variáveis Kallas.

---

## Arquivos

| Arquivo | Ação |
|---------|------|
| `app/api/orcamento/route.ts` | Criar — mock JSON |
| `app/orcamento/page.tsx` | Criar — página completa |
| `app/dashboard/page.tsx` | Modificar — adicionar link Orçamento no nav |
| `app/chat/page.tsx` | Modificar — adicionar link Orçamento no nav |
| `app/catalogo/page.tsx` | Modificar — adicionar link Orçamento no header |

---

## Task 1: API Route com Mock Data

**Files:**
- Create: `app/api/orcamento/route.ts`

- [ ] **Step 1.1: Criar o arquivo da API route**

```typescript
// app/api/orcamento/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

interface DadosOrcamento {
  kpis: {
    arrecadado: { valor: number; meta_pct: number }
    empenhado:  { valor: number; receita_pct: number }
    liquidado:  { valor: number; empenhado_pct: number }
    pago:       { valor: number; liquidado_pct: number }
  }
  mensal:     Array<{ mes: string; arrecadado: number }>
  funcoes:    Array<{ nome: string; pago: number }>
  categorias: Array<{ nome: string; valor: number; pct: number }>
}

const MOCK: Record<number, DadosOrcamento> = {
  2025: {
    kpis: {
      arrecadado: { valor: 655300000, meta_pct: 99.1 },
      empenhado:  { valor: 196400000, receita_pct: 30.0 },
      liquidado:  { valor: 42600000,  empenhado_pct: 21.7 },
      pago:       { valor: 33200000,  liquidado_pct: 78.0 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 76000000 }, { mes: 'Fev', arrecadado: 58000000 },
      { mes: 'Mar', arrecadado: 62000000 }, { mes: 'Abr', arrecadado: 54000000 },
      { mes: 'Mai', arrecadado: 57000000 }, { mes: 'Jun', arrecadado: 55000000 },
      { mes: 'Jul', arrecadado: 52000000 }, { mes: 'Ago', arrecadado: 48000000 },
      { mes: 'Set', arrecadado: 51000000 }, { mes: 'Out', arrecadado: 53000000 },
      { mes: 'Nov', arrecadado: 59000000 }, { mes: 'Dez', arrecadado: 70000000 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 68000000 },
      { nome: 'Educação',      pago: 45000000 },
      { nome: 'Administração', pago: 35000000 },
      { nome: 'Urbanismo',     pago: 30000000 },
      { nome: 'Energia',       pago: 5000000  },
      { nome: 'Transporte',    pago: 5000000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes', valor: 617000000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 38300000, pct: 6  },
    ],
  },
  2024: {
    kpis: {
      arrecadado: { valor: 598700000, meta_pct: 97.3 },
      empenhado:  { valor: 182100000, receita_pct: 30.4 },
      liquidado:  { valor: 39800000,  empenhado_pct: 21.9 },
      pago:       { valor: 31200000,  liquidado_pct: 78.4 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 68000000 }, { mes: 'Fev', arrecadado: 52000000 },
      { mes: 'Mar', arrecadado: 55000000 }, { mes: 'Abr', arrecadado: 48000000 },
      { mes: 'Mai', arrecadado: 51000000 }, { mes: 'Jun', arrecadado: 49000000 },
      { mes: 'Jul', arrecadado: 47000000 }, { mes: 'Ago', arrecadado: 44000000 },
      { mes: 'Set', arrecadado: 46000000 }, { mes: 'Out', arrecadado: 49000000 },
      { mes: 'Nov', arrecadado: 53000000 }, { mes: 'Dez', arrecadado: 63000000 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 62000000 },
      { nome: 'Educação',      pago: 41000000 },
      { nome: 'Administração', pago: 32000000 },
      { nome: 'Urbanismo',     pago: 27000000 },
      { nome: 'Energia',       pago: 4500000  },
      { nome: 'Transporte',    pago: 4200000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes', valor: 563000000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 35700000, pct: 6  },
    ],
  },
  2023: {
    kpis: {
      arrecadado: { valor: 541200000, meta_pct: 95.8 },
      empenhado:  { valor: 165000000, receita_pct: 30.5 },
      liquidado:  { valor: 36100000,  empenhado_pct: 21.9 },
      pago:       { valor: 28400000,  liquidado_pct: 78.7 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 61000000 }, { mes: 'Fev', arrecadado: 47000000 },
      { mes: 'Mar', arrecadado: 49000000 }, { mes: 'Abr', arrecadado: 43000000 },
      { mes: 'Mai', arrecadado: 46000000 }, { mes: 'Jun', arrecadado: 44000000 },
      { mes: 'Jul', arrecadado: 42000000 }, { mes: 'Ago', arrecadado: 40000000 },
      { mes: 'Set', arrecadado: 41000000 }, { mes: 'Out', arrecadado: 44000000 },
      { mes: 'Nov', arrecadado: 48000000 }, { mes: 'Dez', arrecadado: 57000000 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 57000000 },
      { nome: 'Educação',      pago: 37000000 },
      { nome: 'Administração', pago: 28000000 },
      { nome: 'Urbanismo',     pago: 23000000 },
      { nome: 'Energia',       pago: 4000000  },
      { nome: 'Transporte',    pago: 3800000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes', valor: 509000000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 32200000, pct: 6  },
    ],
  },
  2026: {
    kpis: {
      arrecadado: { valor: 198400000, meta_pct: 30.2 },
      empenhado:  { valor: 54200000,  receita_pct: 27.3 },
      liquidado:  { valor: 11800000,  empenhado_pct: 21.8 },
      pago:       { valor: 9200000,   liquidado_pct: 78.0 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 82000000 }, { mes: 'Fev', arrecadado: 64000000 },
      { mes: 'Mar', arrecadado: 52400000 }, { mes: 'Abr', arrecadado: 0 },
      { mes: 'Mai', arrecadado: 0 },        { mes: 'Jun', arrecadado: 0 },
      { mes: 'Jul', arrecadado: 0 },        { mes: 'Ago', arrecadado: 0 },
      { mes: 'Set', arrecadado: 0 },        { mes: 'Out', arrecadado: 0 },
      { mes: 'Nov', arrecadado: 0 },        { mes: 'Dez', arrecadado: 0 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 18000000 },
      { nome: 'Educação',      pago: 12000000 },
      { nome: 'Administração', pago: 9000000  },
      { nome: 'Urbanismo',     pago: 8000000  },
      { nome: 'Energia',       pago: 1200000  },
      { nome: 'Transporte',    pago: 1100000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes', valor: 186700000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 11700000, pct: 6  },
    ],
  },
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ano = parseInt(searchParams.get('ano') ?? '2025')
  const dados = MOCK[ano] ?? MOCK[2025]
  return NextResponse.json(dados)
}
```

- [ ] **Step 1.2: Verificar que o arquivo foi criado corretamente**

```bash
# Verificar se o arquivo existe
ls app/api/orcamento/route.ts
```

- [ ] **Step 1.3: Commit**

```bash
git add app/api/orcamento/route.ts
git commit -m "feat: API route /api/orcamento com mock data 2023-2026

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Página `/orcamento/page.tsx`

**Files:**
- Create: `app/orcamento/page.tsx`

- [ ] **Step 2.1: Criar o arquivo completo da página**

```typescript
// app/orcamento/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

interface DadosOrcamento {
  kpis: {
    arrecadado: { valor: number; meta_pct: number }
    empenhado:  { valor: number; receita_pct: number }
    liquidado:  { valor: number; empenhado_pct: number }
    pago:       { valor: number; liquidado_pct: number }
  }
  mensal:     Array<{ mes: string; arrecadado: number }>
  funcoes:    Array<{ nome: string; pago: number }>
  categorias: Array<{ nome: string; valor: number; pct: number }>
}

const DONUT_COLORS = ['#1a3a6b', '#2563eb']
const ANOS = [2023, 2024, 2025, 2026]

function fmtM(v: number): string {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)} B`
  if (v >= 1_000_000)     return `R$ ${(v / 1_000_000).toFixed(1)} M`
  if (v >= 1_000)         return `R$ ${(v / 1_000).toFixed(0)} K`
  return `R$ ${v.toLocaleString('pt-BR')}`
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap');

.kor-root, .kor-root * { box-sizing: border-box; }
.kor-root {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}
.kor-root[data-theme="light"] {
  --bg: oklch(0.97 0.008 95);
  --surface: #ffffff;
  --surface-2: oklch(0.96 0.01 130);
  --ink: oklch(0.18 0.02 150);
  --ink-2: oklch(0.42 0.02 150);
  --ink-3: oklch(0.62 0.015 150);
  --line: oklch(0.92 0.012 130);
  --line-2: oklch(0.88 0.015 130);
  --bar-track: oklch(0.93 0.01 220);
  --green: oklch(0.48 0.11 155);
  --green-deep: oklch(0.30 0.07 155);
  --green-ink: oklch(0.22 0.06 155);
  --green-soft: oklch(0.94 0.03 150);
  --radius: 22px;
  --radius-sm: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.07);
  --shadow-md: 0 4px 16px rgba(0,0,0,.08);
}
.kor-root[data-theme="dark"] {
  --bg: oklch(0.16 0.012 150);
  --surface: oklch(0.21 0.014 150);
  --surface-2: oklch(0.26 0.014 150);
  --ink: oklch(0.96 0.008 95);
  --ink-2: oklch(0.78 0.01 130);
  --ink-3: oklch(0.58 0.012 130);
  --line: oklch(0.28 0.014 150);
  --line-2: oklch(0.32 0.014 150);
  --bar-track: oklch(0.28 0.014 220);
  --green: oklch(0.64 0.13 155);
  --green-deep: oklch(0.26 0.06 155);
  --green-ink: oklch(0.22 0.06 155);
  --green-soft: oklch(0.30 0.05 150);
  --radius: 22px;
  --radius-sm: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.3);
  --shadow-md: 0 4px 16px rgba(0,0,0,.35);
}

/* ── SIDEBAR ── */
.kor-sidebar {
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: 24px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
}
.kor-brand { display: flex; align-items: center; gap: 10px; padding: 0 4px 2px; }
.kor-brand-icon {
  width: 38px; height: 38px;
  background: var(--green);
  border-radius: 12px;
  display: grid; place-items: center;
  flex-shrink: 0; color: #fff;
}
.kor-brand-text .t1 { font-size: 13.5px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
.kor-brand-text .t2 { font-size: 10.5px; color: var(--ink-3); font-weight: 500; }
.kor-nav-label {
  font-size: 10.5px; letter-spacing: 0.14em; color: var(--ink-3);
  font-weight: 700; padding: 0 10px; text-transform: uppercase; margin-bottom: 6px;
}
.kor-nav { display: flex; flex-direction: column; gap: 2px; }
.kor-nav a {
  display: flex; align-items: center; gap: 10px; padding: 10px;
  border-radius: 10px; color: var(--ink-2); text-decoration: none;
  font-size: 13.5px; font-weight: 500; transition: background .12s;
}
.kor-nav a:hover { background: var(--green-soft); color: var(--ink); }
.kor-nav a.active { background: var(--green); color: #fff; }
.kor-nav a svg { width: 16px; height: 16px; flex-shrink: 0; }

/* ── MAIN ── */
.kor-main {
  padding: 28px 32px 40px;
  display: flex; flex-direction: column; gap: 20px; min-width: 0;
  overflow-y: auto;
}

/* Topbar */
.kor-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.kor-title {
  font-family: 'Instrument Serif', serif;
  font-size: 36px; font-weight: 400; letter-spacing: -0.02em;
  margin: 0; line-height: 1; color: var(--ink);
}
.kor-title em { font-style: italic; color: var(--green); }
.kor-sub { font-size: 13px; color: var(--ink-3); margin: 6px 0 0; }
.kor-topbar-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.kor-hdr-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 16px; border-radius: 10px; font-size: 13px;
  font-weight: 600; cursor: pointer; font-family: inherit; border: 0;
  transition: background .12s;
}
.kor-hdr-btn.primary { background: var(--green); color: #fff; }
.kor-hdr-btn.primary:hover { background: var(--green-deep); }
.kor-hdr-btn.secondary { background: var(--surface); border: 1px solid var(--line); color: var(--ink-2); }
.kor-hdr-btn.secondary:hover { background: var(--surface-2); }

/* Theme toggle */
.kor-theme-toggle {
  display: inline-flex;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}
.kor-theme-toggle button {
  padding: 5px 12px; border-radius: 999px; border: 0;
  font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: inherit; color: var(--ink-3); background: transparent;
  transition: all .15s;
}
.kor-theme-toggle button.active { background: var(--green); color: #fff; }

/* KPI Grid */
.kor-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.kor-kpi {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-sm); padding: 20px 22px;
  box-shadow: var(--shadow-sm); position: relative;
}
.kor-kpi.accent { background: #0f2d5a; border-color: #0f2d5a; }
.kor-kpi.accent .kor-kpi-label { color: rgba(255,255,255,0.65); }
.kor-kpi.accent .kor-kpi-val { color: #fff; }
.kor-kpi.accent .kor-kpi-sub { color: rgba(255,255,255,0.55); }
.kor-kpi-label { font-size: 12px; font-weight: 600; color: var(--ink-3); margin-bottom: 10px; letter-spacing: .02em; }
.kor-kpi-val { font-size: 28px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; line-height: 1; }
.kor-kpi-sub { font-size: 11.5px; color: var(--ink-3); margin-top: 6px; }
.kor-kpi-arrow {
  position: absolute; top: 16px; right: 16px;
  width: 24px; height: 24px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.2);
  display: grid; place-items: center;
  color: rgba(255,255,255,0.7);
}
.kor-kpi:not(.accent) .kor-kpi-arrow {
  border-color: var(--line); color: var(--ink-3);
}

/* Skeleton */
.kor-skeleton { border-radius: 8px; background: var(--surface-2); animation: kor-pulse 1.4s ease-in-out infinite; }
@keyframes kor-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }

/* Cards */
.kor-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 22px 24px;
  box-shadow: var(--shadow-sm);
}
.kor-card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 18px;
}
.kor-card-title { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0; }
.kor-detail-btn {
  font-size: 12px; font-weight: 600; color: var(--ink-3);
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 8px; padding: 5px 12px; cursor: pointer;
  font-family: inherit; transition: background .12s;
}
.kor-detail-btn:hover { background: var(--green-soft); color: var(--ink); }

/* Year pills */
.kor-year-pills { display: flex; gap: 4px; }
.kor-year-pill {
  font-size: 12px; font-weight: 600; padding: 4px 10px;
  border-radius: 999px; border: 1px solid var(--line);
  background: transparent; color: var(--ink-3);
  cursor: pointer; font-family: inherit; transition: all .12s;
}
.kor-year-pill.active { background: var(--green); color: #fff; border-color: var(--green); }
.kor-year-pill:hover:not(.active) { background: var(--green-soft); color: var(--ink); }

/* Row layouts */
.kor-row { display: grid; gap: 16px; }
.kor-row.two-col { grid-template-columns: 3fr 2fr; }

/* Gauge */
.kor-gauge-wrap { position: relative; }
.kor-gauge-center {
  position: absolute; bottom: 28px; left: 50%;
  transform: translateX(-50%);
  text-align: center; pointer-events: none;
}
.kor-gauge-pct { font-size: 32px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
.kor-gauge-lbl { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }
.kor-gauge-legend {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  margin-top: 4px; flex-wrap: wrap;
}
.kor-gauge-leg-item { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-3); }
.kor-gauge-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }

/* Donut */
.kor-donut-wrap { display: flex; align-items: center; gap: 24px; }
.kor-donut-chart-wrap { position: relative; flex-shrink: 0; width: 180px; }
.kor-donut-inner {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center; pointer-events: none;
}
.kor-donut-inner-val { font-size: 14px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
.kor-donut-inner-lbl { font-size: 10px; color: var(--ink-3); font-weight: 500; }
.kor-donut-legend { display: flex; flex-direction: column; gap: 12px; flex: 1; }
.kor-donut-leg-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kor-donut-leg-name { font-size: 12px; font-weight: 600; color: var(--ink-2); flex: 1; }
.kor-donut-leg-pct { font-size: 13px; font-weight: 800; color: var(--ink); }
.kor-donut-leg-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
`

export default function OrcamentoPage() {
  const router = useRouter()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [ano, setAno] = useState(2025)
  const [dados, setDados] = useState<DadosOrcamento | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('k-theme') as 'light' | 'dark' | null
    if (saved) setTheme(saved)
  }, [])

  useEffect(() => {
    setDados(null)
    fetch(`/api/orcamento?ano=${ano}`)
      .then(res => { if (res.status === 401) { router.push('/login'); return null } return res.json() })
      .then(data => { if (data) setDados(data as DadosOrcamento) })
      .catch(() => {})
  }, [ano, router])

  function toggleTheme(t: 'light' | 'dark') {
    setTheme(t)
    localStorage.setItem('k-theme', t)
  }

  const tooltipStyle = {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.1)',
    padding: '8px 12px', fontSize: '12.5px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  }
  const axisProps = {
    tick: { fontSize: 11, fill: 'var(--ink-3)', fontFamily: "'Plus Jakarta Sans', sans-serif" },
    axisLine: false as const, tickLine: false as const,
  }

  // Gauge: semicircle PieChart (startAngle 180→0)
  const gaugePct = dados?.kpis.empenhado.receita_pct ?? 30
  const gaugeData = [{ value: gaugePct, name: 'Empenhado' }, { value: 100 - gaugePct, name: '' }]

  // Skeleton block helper
  const sk = (w: string, h: string, mb = '0px') => (
    <div className="kor-skeleton" style={{ width: w, height: h, marginBottom: mb }} />
  )

  return (
    <div className="kor-root" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── SIDEBAR ── */}
      <aside className="kor-sidebar">
        <div className="kor-brand">
          <div className="kor-brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 22V10l9-7 9 7v12H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M9 22v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="kor-brand-text">
            <div className="t1">Prefeitura de Arujá</div>
            <div className="t2">Analytics Municipal</div>
          </div>
        </div>

        <div>
          <div className="kor-nav-label">Menu</div>
          <nav className="kor-nav">
            <a className="active" href="/orcamento">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15V9M12 15V5M16 15v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Orçamento
            </a>
            <Link href="/dashboard">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 13l9-9 9 9M5 11v9h14v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Painel
            </Link>
            <Link href="/chat">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Chat IA
            </Link>
            <Link href="/catalogo">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Catálogo
            </Link>
          </nav>
        </div>

        <div style={{ marginTop: 'auto', background: 'var(--green-ink)', borderRadius: '16px', padding: '16px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, opacity: .7, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Dashboard</div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, lineHeight: 1.4, marginBottom: '8px' }}>Orçamento Municipal 2025</div>
          <div style={{ fontSize: '11.5px', opacity: .7, lineHeight: 1.5 }}>Dados de execução orçamentária da Prefeitura de Arujá</div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="kor-main">

        {/* Header */}
        <div className="kor-topbar">
          <div>
            <h1 className="kor-title">Orçamento <em>Municipal</em></h1>
            <p className="kor-sub">Execução orçamentária · Receitas e Despesas · {ano}</p>
          </div>
          <div className="kor-topbar-right">
            <div className="kor-theme-toggle">
              <button className={theme === 'light' ? 'active' : ''} onClick={() => toggleTheme('light')}>☀ Claro</button>
              <button className={theme === 'dark' ? 'active' : ''} onClick={() => toggleTheme('dark')}>☾ Escuro</button>
            </div>
            <button className="kor-hdr-btn primary" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Exportar
            </button>
            <button className="kor-hdr-btn secondary" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3M13 21h6a2 2 0 002-2v-6a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Relatório
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kor-kpi-grid">
          {/* Card 1 — Arrecadado (accent) */}
          <div className="kor-kpi accent">
            <div className="kor-kpi-label">Total Arrecadado</div>
            {dados ? (
              <>
                <div className="kor-kpi-val">{fmtM(dados.kpis.arrecadado.valor)}</div>
                <div className="kor-kpi-sub">{dados.kpis.arrecadado.meta_pct}% da meta</div>
              </>
            ) : (
              <>{sk('80%', '32px', '8px')}{sk('50%', '14px')}</>
            )}
            <div className="kor-kpi-arrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          {/* Card 2 — Empenhado */}
          <div className="kor-kpi">
            <div className="kor-kpi-label">Total Empenhado</div>
            {dados ? (
              <>
                <div className="kor-kpi-val">{fmtM(dados.kpis.empenhado.valor)}</div>
                <div className="kor-kpi-sub">{dados.kpis.empenhado.receita_pct}% da receita</div>
              </>
            ) : (
              <>{sk('80%', '32px', '8px')}{sk('50%', '14px')}</>
            )}
            <div className="kor-kpi-arrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          {/* Card 3 — Liquidado */}
          <div className="kor-kpi">
            <div className="kor-kpi-label">Total Liquidado</div>
            {dados ? (
              <>
                <div className="kor-kpi-val">{fmtM(dados.kpis.liquidado.valor)}</div>
                <div className="kor-kpi-sub">{dados.kpis.liquidado.empenhado_pct}% do empenhado</div>
              </>
            ) : (
              <>{sk('80%', '32px', '8px')}{sk('50%', '14px')}</>
            )}
            <div className="kor-kpi-arrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          {/* Card 4 — Pago */}
          <div className="kor-kpi">
            <div className="kor-kpi-label">Total Pago</div>
            {dados ? (
              <>
                <div className="kor-kpi-val">{fmtM(dados.kpis.pago.valor)}</div>
                <div className="kor-kpi-sub">{dados.kpis.pago.liquidado_pct}% do liquidado</div>
              </>
            ) : (
              <>{sk('80%', '32px', '8px')}{sk('50%', '14px')}</>
            )}
            <div className="kor-kpi-arrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </div>

        {/* Row 2: Mensal + Gauge */}
        <div className="kor-row two-col">

          {/* Arrecadação Mensal */}
          <div className="kor-card">
            <div className="kor-card-header">
              <h2 className="kor-card-title">Arrecadação Mensal</h2>
              <div className="kor-year-pills">
                {ANOS.map(a => (
                  <button key={a} className={`kor-year-pill${ano === a ? ' active' : ''}`} onClick={() => setAno(a)}>{a}</button>
                ))}
              </div>
            </div>
            {dados ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados.mensal} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={22}>
                  <XAxis dataKey="mes" {...axisProps} dy={6} />
                  <YAxis tickFormatter={fmtAxis} {...axisProps} width={42} />
                  <Tooltip formatter={(v) => [fmtM(Number(v)), 'Arrecadado']} contentStyle={tooltipStyle} cursor={{ fill: 'var(--green-soft)' }} />
                  <Bar dataKey="arrecadado" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="kor-skeleton" style={{ height: '220px', borderRadius: '12px' }} />
            )}
          </div>

          {/* Execução Orçamentária — Gauge */}
          <div className="kor-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 className="kor-card-title" style={{ alignSelf: 'flex-start', marginBottom: '8px' }}>Execução Orçamentária</h2>
            {dados ? (
              <>
                <div className="kor-gauge-wrap" style={{ width: '100%', position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      {/* background arc */}
                      <Pie
                        data={[{ value: 100 }]}
                        cx="50%" cy="85%"
                        startAngle={180} endAngle={0}
                        innerRadius={70} outerRadius={92}
                        dataKey="value" strokeWidth={0}
                      >
                        <Cell fill="var(--bar-track)" />
                      </Pie>
                      {/* value arc */}
                      <Pie
                        data={gaugeData}
                        cx="50%" cy="85%"
                        startAngle={180} endAngle={0}
                        innerRadius={70} outerRadius={92}
                        dataKey="value" strokeWidth={0}
                      >
                        <Cell fill="#2563eb" />
                        <Cell fill="transparent" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="kor-gauge-center">
                    <div className="kor-gauge-pct">{gaugePct}%</div>
                    <div className="kor-gauge-lbl">empenho / receita</div>
                  </div>
                </div>
                <div className="kor-gauge-legend">
                  {[
                    { label: 'Empenhado', color: '#2563eb' },
                    { label: 'Liquidado', color: '#f59e0b' },
                    { label: 'Pendente',  color: 'var(--bar-track)' },
                  ].map(item => (
                    <div key={item.label} className="kor-gauge-leg-item">
                      <div className="kor-gauge-dot" style={{ background: item.color }} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="kor-skeleton" style={{ height: '220px', width: '100%', borderRadius: '12px' }} />
            )}
          </div>
        </div>

        {/* Row 3: Funções + Categorias */}
        <div className="kor-row two-col">

          {/* Despesa por Função */}
          <div className="kor-card">
            <div className="kor-card-header">
              <h2 className="kor-card-title">Despesa por Função</h2>
              <button className="kor-detail-btn" type="button">Detalhes</button>
            </div>
            {dados ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados.funcoes} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }} barSize={18}>
                  <XAxis type="number" tickFormatter={fmtAxis} {...axisProps} />
                  <YAxis dataKey="nome" type="category" {...axisProps} width={100} />
                  <Tooltip formatter={(v) => [fmtM(Number(v)), 'Pago']} contentStyle={tooltipStyle} cursor={{ fill: 'var(--green-soft)' }} />
                  <Bar dataKey="pago" radius={[0, 6, 6, 0]}>
                    {dados.funcoes.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#1a3a6b' : i === 1 ? '#1d4ed8' : i === 2 ? '#2563eb' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="kor-skeleton" style={{ height: '220px', borderRadius: '12px' }} />
            )}
          </div>

          {/* Receita por Categoria */}
          <div className="kor-card">
            <div className="kor-card-header">
              <h2 className="kor-card-title">Receita por Categoria</h2>
              <button className="kor-detail-btn" type="button">Exportar</button>
            </div>
            {dados ? (
              <div className="kor-donut-wrap">
                <div className="kor-donut-chart-wrap">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={dados.categorias}
                        cx="50%" cy="50%"
                        innerRadius={52} outerRadius={80}
                        dataKey="valor" strokeWidth={0}
                      >
                        {dados.categorias.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i] ?? '#93c5fd'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="kor-donut-inner">
                    <div className="kor-donut-inner-val">{fmtM(dados.kpis.arrecadado.valor)}</div>
                    <div className="kor-donut-inner-lbl">arrecadado</div>
                  </div>
                </div>
                <div className="kor-donut-legend">
                  {dados.categorias.map((c, i) => (
                    <div key={i} className="kor-donut-leg-row">
                      <div className="kor-donut-leg-dot" style={{ background: DONUT_COLORS[i] ?? '#93c5fd' }} />
                      <span className="kor-donut-leg-name">{c.nome}</span>
                      <span className="kor-donut-leg-pct">{c.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="kor-skeleton" style={{ height: '180px', borderRadius: '12px' }} />
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
```

- [ ] **Step 2.2: Verificar que o arquivo foi criado**

```bash
ls app/orcamento/page.tsx
```

- [ ] **Step 2.3: Commit**

```bash
git add app/orcamento/page.tsx
git commit -m "feat: página /orcamento com KPIs, gráficos e gauge Kallas

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Atualizar Sidebar — `app/dashboard/page.tsx`

**Files:**
- Modify: `app/dashboard/page.tsx`

No arquivo `app/dashboard/page.tsx`, localizar o bloco `<nav className="k-nav">` que começa com:

```jsx
<a className="active" href="/dashboard">
```

E adicionar o link Orçamento **antes** do item "Painel" atual:

- [ ] **Step 3.1: Adicionar link Orçamento no início do nav**

Substituir:
```jsx
<nav className="k-nav">
  <a className="active" href="/dashboard">
```

Por:
```jsx
<nav className="k-nav">
  <Link href="/orcamento">
    <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15V9M12 15V5M16 15v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
    Orçamento
  </Link>
  <a className="active" href="/dashboard">
```

- [ ] **Step 3.2: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: adiciona link Orçamento na sidebar do Painel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Atualizar Sidebar — `app/chat/page.tsx`

**Files:**
- Modify: `app/chat/page.tsx`

No arquivo `app/chat/page.tsx`, localizar o bloco `<nav className="kc-nav">` que começa com:

```jsx
<Link href="/dashboard">
```

Adicionar o link Orçamento **antes** do item "Painel":

- [ ] **Step 4.1: Adicionar link Orçamento no início do nav do chat**

Substituir:
```jsx
<nav className="kc-nav">
  <Link href="/dashboard">
```

Por:
```jsx
<nav className="kc-nav">
  <Link href="/orcamento">
    <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15V9M12 15V5M16 15v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
    Orçamento
  </Link>
  <Link href="/dashboard">
```

- [ ] **Step 4.2: Commit**

```bash
git add app/chat/page.tsx
git commit -m "feat: adiciona link Orçamento na sidebar do Chat

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Atualizar Header — `app/catalogo/page.tsx`

**Files:**
- Modify: `app/catalogo/page.tsx`

O catálogo usa um header simples (não Kallas). Localizar o bloco de links no header:

```jsx
<Link href="/chat" className="text-blue-300 hover:text-white text-sm transition-colors">Chat IA</Link>
<Link href="/dashboard" className="text-blue-300 hover:text-white text-sm transition-colors">← Dashboard</Link>
```

- [ ] **Step 5.1: Adicionar link Orçamento no header do Catálogo**

Substituir:
```jsx
<Link href="/chat" className="text-blue-300 hover:text-white text-sm transition-colors">Chat IA</Link>
<Link href="/dashboard" className="text-blue-300 hover:text-white text-sm transition-colors">← Dashboard</Link>
```

Por:
```jsx
<Link href="/orcamento" className="text-blue-300 hover:text-white text-sm transition-colors">Orçamento</Link>
<Link href="/chat" className="text-blue-300 hover:text-white text-sm transition-colors">Chat IA</Link>
<Link href="/dashboard" className="text-blue-300 hover:text-white text-sm transition-colors">← Dashboard</Link>
```

- [ ] **Step 5.2: Commit**

```bash
git add app/catalogo/page.tsx
git commit -m "feat: adiciona link Orçamento no header do Catálogo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Verificação Final

- [ ] **Step 6.1: Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

Aguardar mensagem: `✓ Ready on http://localhost:3000`

- [ ] **Step 6.2: Verificar cada página no browser**

Acessar em sequência:
- `http://localhost:3000/orcamento` — dashboard principal
- `http://localhost:3000/dashboard` — verificar link Orçamento no nav
- `http://localhost:3000/chat` — verificar link Orçamento no nav
- `http://localhost:3000/catalogo` — verificar link Orçamento no header

Checklist visual para `/orcamento`:
- [ ] 4 KPI cards visíveis (1 azul escuro, 3 brancos)
- [ ] Gráfico de barras mensais com 12 colunas
- [ ] Pills de ano `[2023][2024][2025][2026]` — clicar e verificar mudança de dados
- [ ] Gauge semicircular com percentual no centro
- [ ] Gráfico horizontal de funções com 6 itens
- [ ] Donut com valor total no centro e legenda lateral
- [ ] Toggle claro/escuro funciona e persiste

- [ ] **Step 6.3: Commit final de verificação**

```bash
git add -A
git commit -m "feat: dashboard orçamento municipal completo

- Página /orcamento com KPIs, Arrecadação Mensal, Gauge, Funções e Donut
- API route /api/orcamento com mock data 2023-2026
- Link Orçamento adicionado nas sidebars de Dashboard e Chat
- Link Orçamento adicionado no header do Catálogo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
