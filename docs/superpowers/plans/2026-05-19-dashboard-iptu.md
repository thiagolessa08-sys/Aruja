# IPTU Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/iptu` executive 360° dashboard with 5 KPIs, monthly lançado vs. arrecadado, tipo donut, top 10 bairros and aging dívida — visually identical to existing Orçamento/Receita/Despesa pages.

**Architecture:** Single Next.js App Router page + single API route returning all data in one JSON. Page is a Client Component using Recharts 3 and inline CSS via `dangerouslySetInnerHTML`. Sidebar updated cross-file (5 existing pages) to add "IPTU" as 4th nav item.

**Tech Stack:** Next.js 14, TypeScript, Recharts 3 (`BarChart`, `PieChart`, `Pie`, `Cell`, `ResponsiveContainer`), CSS-in-JS via `<style dangerouslySetInnerHTML>`, `localStorage` shared theme key `k-theme`.

---

## File Structure

- **Create** `app/api/iptu/route.ts` — `GET` handler + `DadosIPTU` interface + mock data for 2023–2026 keyed by year.
- **Create** `app/iptu/page.tsx` — Full Kallas-styled dashboard with prefix `.kipt-`, fetches `/api/iptu?ano=N`, renders 5 KPIs + 4 charts + sidebar.
- **Modify** `app/orcamento/page.tsx` — Insert `<Link href="/iptu">…</Link>` after Despesa in sidebar nav.
- **Modify** `app/receita/page.tsx` — Same insertion.
- **Modify** `app/despesa/page.tsx` — Same insertion.
- **Modify** `app/dashboard/page.tsx` — Same insertion.
- **Modify** `app/chat/page.tsx` — Same insertion.

Note: This project has **no test harness** (no Jest, Vitest, Playwright). Verification is via `npm run build` (compiles TS, exposes type errors) and manual browser check. We will run the build at strategic checkpoints; failing build = failing test.

---

### Task 1: Create the API route with mock data

**Files:**
- Create: `app/api/iptu/route.ts`

- [ ] **Step 1: Create the file with full mock data**

Create `app/api/iptu/route.ts` with exactly this content:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export interface DadosIPTU {
  kpis: {
    lancado:       { valor: number; vs_ano_anterior_pct: number }
    arrecadado:    { valor: number; vs_ano_anterior_pct: number }
    efetividade:   { pct: number }
    inadimplencia: { valor: number; vs_ano_anterior_pct: number }
    imoveis:       { qtde: number }
  }
  mensal:  Array<{ mes: string; lancado: number; arrecadado: number }>
  tipos:   Array<{ nome: string; valor: number; pct: number }>
  bairros: Array<{ nome: string; valor: number }>
  aging:   Array<{ faixa: string; valor: number; pct: number }>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const MOCK: Record<number, DadosIPTU> = {
  2026: {
    kpis: {
      lancado:       { valor: 240000000, vs_ano_anterior_pct: 9.1  },
      arrecadado:    { valor: 81500000,  vs_ano_anterior_pct: 8.2  },
      efetividade:   { pct: 34.0 },
      inadimplencia: { valor: 158500000, vs_ano_anterior_pct: 9.7  },
      imoveis:       { qtde: 59800 },
    },
    mensal: [
      { mes: 'Jan', lancado: 22000000, arrecadado: 28500000 },
      { mes: 'Fev', lancado: 20000000, arrecadado: 21200000 },
      { mes: 'Mar', lancado: 20000000, arrecadado: 18800000 },
      { mes: 'Abr', lancado: 19000000, arrecadado: 13000000 },
      { mes: 'Mai', lancado: 19000000, arrecadado: 0 },
      { mes: 'Jun', lancado: 19000000, arrecadado: 0 },
      { mes: 'Jul', lancado: 19000000, arrecadado: 0 },
      { mes: 'Ago', lancado: 19000000, arrecadado: 0 },
      { mes: 'Set', lancado: 19000000, arrecadado: 0 },
      { mes: 'Out', lancado: 19000000, arrecadado: 0 },
      { mes: 'Nov', lancado: 22000000, arrecadado: 0 },
      { mes: 'Dez', lancado: 23000000, arrecadado: 0 },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 55420000, pct: 68 },
      { nome: 'Comercial',       valor: 17930000, pct: 22 },
      { nome: 'Industrial',      valor: 5705000,  pct: 7  },
      { nome: 'Terreno Baldio',  valor: 2445000,  pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 14200000 },
      { nome: 'JARDIM RINCÃO',              valor: 11800000 },
      { nome: 'PARQUE RINCÃO',              valor: 9650000  },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 8200000  },
      { nome: 'JARDIM BELÉM',               valor: 7300000  },
      { nome: 'VILA FLÓRIDA',               valor: 6100000  },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 5400000  },
      { nome: 'JARDIM PLANALTO',            valor: 4750000  },
      { nome: 'CITROLÂNDIA',                valor: 4100000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 3500000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 79250000, pct: 50 },
      { faixa: '1–3 anos',   valor: 47550000, pct: 30 },
      { faixa: '3–5 anos',   valor: 19020000, pct: 12 },
      { faixa: '+5 anos',    valor: 12680000, pct: 8  },
    ],
  },
  2025: {
    kpis: {
      lancado:       { valor: 220000000, vs_ano_anterior_pct: 10.0 },
      arrecadado:    { valor: 178000000, vs_ano_anterior_pct: 11.3 },
      efetividade:   { pct: 80.9 },
      inadimplencia: { valor: 42000000,  vs_ano_anterior_pct: -4.5 },
      imoveis:       { qtde: 58200 },
    },
    mensal: [
      { mes: 'Jan', lancado: 20000000, arrecadado: 26500000 },
      { mes: 'Fev', lancado: 18000000, arrecadado: 19800000 },
      { mes: 'Mar', lancado: 18000000, arrecadado: 17600000 },
      { mes: 'Abr', lancado: 17000000, arrecadado: 16400000 },
      { mes: 'Mai', lancado: 17000000, arrecadado: 14200000 },
      { mes: 'Jun', lancado: 17000000, arrecadado: 13100000 },
      { mes: 'Jul', lancado: 17000000, arrecadado: 12500000 },
      { mes: 'Ago', lancado: 17000000, arrecadado: 11800000 },
      { mes: 'Set', lancado: 17000000, arrecadado: 11200000 },
      { mes: 'Out', lancado: 17000000, arrecadado: 12000000 },
      { mes: 'Nov', lancado: 20000000, arrecadado: 11900000 },
      { mes: 'Dez', lancado: 25000000, arrecadado: 11000000 },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 121040000, pct: 68 },
      { nome: 'Comercial',       valor: 39160000,  pct: 22 },
      { nome: 'Industrial',      valor: 12460000,  pct: 7  },
      { nome: 'Terreno Baldio',  valor: 5340000,   pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 31200000 },
      { nome: 'JARDIM RINCÃO',              valor: 25900000 },
      { nome: 'PARQUE RINCÃO',              valor: 21100000 },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 17900000 },
      { nome: 'JARDIM BELÉM',               valor: 15950000 },
      { nome: 'VILA FLÓRIDA',               valor: 13320000 },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 11800000 },
      { nome: 'JARDIM PLANALTO',            valor: 10350000 },
      { nome: 'CITROLÂNDIA',                valor: 8960000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 7620000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 21000000, pct: 50 },
      { faixa: '1–3 anos',   valor: 12600000, pct: 30 },
      { faixa: '3–5 anos',   valor: 5040000,  pct: 12 },
      { faixa: '+5 anos',    valor: 3360000,  pct: 8  },
    ],
  },
  2024: {
    kpis: {
      lancado:       { valor: 200000000, vs_ano_anterior_pct: 8.7  },
      arrecadado:    { valor: 160000000, vs_ano_anterior_pct: 9.8  },
      efetividade:   { pct: 80.0 },
      inadimplencia: { valor: 44000000,  vs_ano_anterior_pct: 5.1  },
      imoveis:       { qtde: 56500 },
    },
    mensal: [
      { mes: 'Jan', lancado: 18000000, arrecadado: 23900000 },
      { mes: 'Fev', lancado: 16500000, arrecadado: 17800000 },
      { mes: 'Mar', lancado: 16500000, arrecadado: 15900000 },
      { mes: 'Abr', lancado: 15500000, arrecadado: 14750000 },
      { mes: 'Mai', lancado: 15500000, arrecadado: 12800000 },
      { mes: 'Jun', lancado: 15500000, arrecadado: 11800000 },
      { mes: 'Jul', lancado: 15500000, arrecadado: 11250000 },
      { mes: 'Ago', lancado: 15500000, arrecadado: 10600000 },
      { mes: 'Set', lancado: 15500000, arrecadado: 10100000 },
      { mes: 'Out', lancado: 15500000, arrecadado: 10800000 },
      { mes: 'Nov', lancado: 18000000, arrecadado: 10700000 },
      { mes: 'Dez', lancado: 22500000, arrecadado: 9600000  },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 108800000, pct: 68 },
      { nome: 'Comercial',       valor: 35200000,  pct: 22 },
      { nome: 'Industrial',      valor: 11200000,  pct: 7  },
      { nome: 'Terreno Baldio',  valor: 4800000,   pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 28000000 },
      { nome: 'JARDIM RINCÃO',              valor: 23300000 },
      { nome: 'PARQUE RINCÃO',              valor: 19000000 },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 16100000 },
      { nome: 'JARDIM BELÉM',               valor: 14350000 },
      { nome: 'VILA FLÓRIDA',               valor: 12000000 },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 10620000 },
      { nome: 'JARDIM PLANALTO',            valor: 9300000  },
      { nome: 'CITROLÂNDIA',                valor: 8060000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 6860000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 22000000, pct: 50 },
      { faixa: '1–3 anos',   valor: 13200000, pct: 30 },
      { faixa: '3–5 anos',   valor: 5280000,  pct: 12 },
      { faixa: '+5 anos',    valor: 3520000,  pct: 8  },
    ],
  },
  2023: {
    kpis: {
      lancado:       { valor: 184000000, vs_ano_anterior_pct: 7.5  },
      arrecadado:    { valor: 145700000, vs_ano_anterior_pct: 6.8  },
      efetividade:   { pct: 79.2 },
      inadimplencia: { valor: 41900000,  vs_ano_anterior_pct: 4.2  },
      imoveis:       { qtde: 54800 },
    },
    mensal: [
      { mes: 'Jan', lancado: 16000000, arrecadado: 21800000 },
      { mes: 'Fev', lancado: 15000000, arrecadado: 16200000 },
      { mes: 'Mar', lancado: 15000000, arrecadado: 14500000 },
      { mes: 'Abr', lancado: 14000000, arrecadado: 13400000 },
      { mes: 'Mai', lancado: 14000000, arrecadado: 11700000 },
      { mes: 'Jun', lancado: 14000000, arrecadado: 10750000 },
      { mes: 'Jul', lancado: 14000000, arrecadado: 10250000 },
      { mes: 'Ago', lancado: 14000000, arrecadado: 9650000  },
      { mes: 'Set', lancado: 14000000, arrecadado: 9200000  },
      { mes: 'Out', lancado: 14000000, arrecadado: 9850000  },
      { mes: 'Nov', lancado: 16500000, arrecadado: 9750000  },
      { mes: 'Dez', lancado: 20500000, arrecadado: 8650000  },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 99080000, pct: 68 },
      { nome: 'Comercial',       valor: 32050000, pct: 22 },
      { nome: 'Industrial',      valor: 10200000, pct: 7  },
      { nome: 'Terreno Baldio',  valor: 4370000,  pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 25500000 },
      { nome: 'JARDIM RINCÃO',              valor: 21200000 },
      { nome: 'PARQUE RINCÃO',              valor: 17300000 },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 14650000 },
      { nome: 'JARDIM BELÉM',               valor: 13060000 },
      { nome: 'VILA FLÓRIDA',               valor: 10900000 },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 9660000  },
      { nome: 'JARDIM PLANALTO',            valor: 8470000  },
      { nome: 'CITROLÂNDIA',                valor: 7340000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 6240000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 20950000, pct: 50 },
      { faixa: '1–3 anos',   valor: 12570000, pct: 30 },
      { faixa: '3–5 anos',   valor: 5028000,  pct: 12 },
      { faixa: '+5 anos',    valor: 3352000,  pct: 8  },
    ],
  },
}

// Reference (kept in file for future Sybase integration):
// Months order: MESES = ['Jan',…,'Dez']
void MESES

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ano = parseInt(searchParams.get('ano') ?? '2026')
  const dados = MOCK[ano] ?? MOCK[2026]
  return NextResponse.json(dados)
}
```

- [ ] **Step 2: Verify the build passes**

Run: `cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura" && npm run build`
Expected: Compilation succeeds with no TypeScript errors. New route `/api/iptu` listed in build output.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura"
git add app/api/iptu/route.ts
git commit -m "feat(iptu): add /api/iptu route with mock data 2023-2026"
```

---

### Task 2: Create the IPTU page — sidebar, header, KPIs

This task builds the page's static shell (sidebar + header + 5 KPI cards) with full CSS. Charts come in Task 3.

**Files:**
- Create: `app/iptu/page.tsx`

- [ ] **Step 1: Create the file with the full sidebar + header + KPIs**

Create `app/iptu/page.tsx` with exactly this content:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import type { DadosIPTU } from '@/app/api/iptu/route'

const DONUT_COLORS = ['#0f2d5a', '#2563eb', '#60a5fa', '#93c5fd']
const ANOS = [2023, 2024, 2025, 2026]

function fmtM(v: number): string {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)} B`
  if (v >= 1_000_000)     return `R$ ${(v / 1_000_000).toFixed(1)} M`
  if (v >= 1_000)         return `R$ ${(v / 1_000).toFixed(0)} K`
  return `R$ ${v.toLocaleString('pt-BR')}`
}

function fmtMShort(v: number): string {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$${(v / 1_000).toFixed(0)}K`
  return `R$${v}`
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function fmtQtde(v: number): string {
  return v.toLocaleString('pt-BR')
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');

.kipt-root, .kipt-root * { box-sizing: border-box; }
.kipt-root {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}
.kipt-root[data-theme="light"] {
  --bg: oklch(0.97 0.008 95);
  --surface: #ffffff;
  --surface-2: oklch(0.96 0.01 240);
  --ink: oklch(0.18 0.02 240);
  --ink-2: oklch(0.42 0.02 240);
  --ink-3: oklch(0.62 0.015 240);
  --line: oklch(0.92 0.012 240);
  --bar-track: oklch(0.91 0.01 220);
  --green: oklch(0.52 0.20 264);
  --green-deep: oklch(0.32 0.14 264);
  --green-ink: oklch(0.20 0.10 264);
  --green-soft: oklch(0.94 0.04 240);
  --radius: 22px;
  --radius-sm: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.07);
}
.kipt-root[data-theme="dark"] {
  --bg: oklch(0.16 0.012 150);
  --surface: oklch(0.21 0.014 240);
  --surface-2: oklch(0.26 0.014 240);
  --ink: oklch(0.96 0.008 95);
  --ink-2: oklch(0.78 0.01 240);
  --ink-3: oklch(0.58 0.012 240);
  --line: oklch(0.28 0.014 240);
  --bar-track: oklch(0.30 0.01 220);
  --green: oklch(0.64 0.18 264);
  --green-deep: oklch(0.26 0.10 264);
  --green-ink: oklch(0.20 0.10 264);
  --green-soft: oklch(0.28 0.06 240);
  --radius: 22px;
  --radius-sm: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.3);
}

/* ── SIDEBAR ── */
.kipt-sidebar {
  background: oklch(0.20 0.10 264);
  border-right: 1px solid oklch(0.26 0.12 264);
  padding: 24px 18px 20px;
  display: flex; flex-direction: column; gap: 22px;
  position: sticky; top: 0; height: 100vh; overflow: hidden;
}
.kipt-brand { display: flex; align-items: center; gap: 10px; padding: 0 4px 2px; }
.kipt-brand-icon {
  width: 38px; height: 38px; background: var(--green); border-radius: 12px;
  display: grid; place-items: center; flex-shrink: 0; color: #fff;
}
.kipt-brand-text .t1 { font-size: 13.5px; font-weight: 800; color: #fff; letter-spacing: -0.01em; }
.kipt-nav-label {
  font-size: 10.5px; letter-spacing: 0.14em; color: rgba(255,255,255,0.45);
  font-weight: 700; padding: 0 10px; text-transform: uppercase; margin-bottom: 6px;
}
.kipt-nav { display: flex; flex-direction: column; gap: 2px; }
.kipt-nav a {
  display: flex; align-items: center; gap: 10px; padding: 10px;
  border-radius: 10px; color: rgba(255,255,255,0.70); text-decoration: none;
  font-size: 13.5px; font-weight: 500; transition: background .12s;
}
.kipt-nav a:hover { background: rgba(255,255,255,0.10); color: #fff; }
.kipt-nav a.active { background: rgba(255,255,255,0.18); color: #fff; }
.kipt-nav a svg { width: 16px; height: 16px; flex-shrink: 0; }

/* ── MAIN ── */
.kipt-main {
  padding: 28px 32px 48px;
  display: flex; flex-direction: column; gap: 20px;
  min-width: 0; overflow-y: auto;
}

/* Topbar */
.kipt-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.kipt-title {
  font-family: 'Instrument Serif', serif;
  font-size: 36px; font-weight: 400; letter-spacing: -0.02em;
  margin: 0; line-height: 1; color: var(--ink);
}
.kipt-title em { font-style: italic; color: var(--green); }
.kipt-sub { font-size: 13px; color: var(--ink-3); margin: 6px 0 0; }
.kipt-topbar-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; padding-top: 4px; }

.kipt-hdr-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 16px; border-radius: 10px; font-size: 13px;
  font-weight: 600; cursor: pointer; font-family: inherit; border: 0;
  transition: all .12s;
}
.kipt-hdr-btn.primary { background: var(--green); color: #fff; }
.kipt-hdr-btn.primary:hover { background: var(--green-deep); }
.kipt-hdr-btn.secondary { background: var(--surface); border: 1px solid var(--line); color: var(--ink-2); }
.kipt-hdr-btn.secondary:hover { background: var(--surface-2); }

.kipt-theme-toggle {
  display: inline-flex; background: var(--surface);
  border: 1px solid var(--line); border-radius: 999px; padding: 3px; gap: 2px;
}
.kipt-theme-toggle button {
  padding: 5px 12px; border-radius: 999px; border: 0;
  font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: inherit; color: var(--ink-3); background: transparent; transition: all .15s;
}
.kipt-theme-toggle button.active { background: var(--green); color: #fff; }

/* KPI Grid — 5 cols */
.kipt-kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
.kipt-kpi {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-sm); padding: 18px 20px;
  box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
}
.kipt-kpi.accent { background: #0f2d5a; border-color: #0f2d5a; }
.kipt-kpi.accent .kipt-kpi-label { color: rgba(255,255,255,.65); }
.kipt-kpi.accent .kipt-kpi-val   { color: #fff; }
.kipt-kpi.accent .kipt-kpi-sub   { color: rgba(255,255,255,.70); }
.kipt-kpi.accent .kipt-kpi-arrow { border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.7); }
.kipt-kpi.warm  { background: oklch(0.96 0.04 75); border-color: oklch(0.88 0.06 75); }
.kipt-kpi-label { font-size: 11px; font-weight: 600; color: var(--ink-3); margin-bottom: 8px; letter-spacing: .02em; }
.kipt-kpi-val   { font-size: 22px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; line-height: 1; }
.kipt-kpi-sub   { font-size: 10.5px; margin-top: 6px; display: flex; align-items: center; gap: 4px; font-weight: 600; }
.kipt-kpi-sub.up   { color: oklch(0.42 0.16 145); }
.kipt-kpi-sub.down { color: oklch(0.48 0.18 25);  }
.kipt-kpi-sub.muted{ color: var(--ink-3); }
.kipt-kpi-arrow {
  position: absolute; top: 14px; right: 14px;
  width: 24px; height: 24px; border-radius: 7px;
  border: 1px solid var(--line);
  display: grid; place-items: center; color: var(--ink-3);
}

/* Skeleton */
.kipt-sk { border-radius: 8px; background: var(--surface-2); animation: kipt-pulse 1.4s ease-in-out infinite; }
@keyframes kipt-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
.kipt-sk-full { border-radius: 12px; background: var(--surface-2); animation: kipt-pulse 1.4s ease-in-out infinite; }

/* Cards */
.kipt-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 22px 24px; box-shadow: var(--shadow-sm);
}
.kipt-card-hdr {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;
}
.kipt-card-title { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0; }
.kipt-detail-btn {
  font-size: 12px; font-weight: 600; color: var(--ink-3);
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 8px; padding: 5px 12px; cursor: pointer;
  font-family: inherit; transition: background .12s;
}
.kipt-detail-btn:hover { background: var(--green-soft); color: var(--ink); }

/* Year pills */
.kipt-year-pills { display: flex; gap: 4px; }
.kipt-year-pill {
  font-size: 12px; font-weight: 600; padding: 4px 10px;
  border-radius: 999px; border: 1px solid var(--line);
  background: transparent; color: var(--ink-3);
  cursor: pointer; font-family: inherit; transition: all .12s;
}
.kipt-year-pill.active { background: var(--green); color: #fff; border-color: var(--green); }
.kipt-year-pill:hover:not(.active) { background: var(--green-soft); color: var(--ink); }

/* Row layouts */
.kipt-row2 { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; }
.kipt-row3 { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; }

/* Progress bars (bairros) */
.kipt-bar-list { display: flex; flex-direction: column; gap: 14px; }
.kipt-bar-row  { display: flex; flex-direction: column; gap: 5px; }
.kipt-bar-top  { display: flex; align-items: center; justify-content: space-between; }
.kipt-bar-name { font-size: 11px; font-weight: 700; color: var(--ink-2); letter-spacing: .04em; text-transform: uppercase; }
.kipt-bar-val  { font-size: 11.5px; font-weight: 700; color: var(--ink); }
.kipt-bar-track {
  width: 100%; height: 7px; border-radius: 999px;
  background: var(--bar-track); overflow: hidden;
}
.kipt-bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #0f2d5a 0%, #2563eb 100%);
  transition: width .5s cubic-bezier(.4,0,.2,1);
}

/* Donut */
.kipt-donut-wrap  { display: flex; align-items: center; gap: 24px; }
.kipt-donut-chart { position: relative; flex-shrink: 0; width: 220px; height: 220px; }
.kipt-donut-inner {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); text-align: center; pointer-events: none;
}
.kipt-donut-val { font-size: 16px; font-weight: 800; color: var(--ink); line-height: 1.3; }
.kipt-donut-lbl { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.kipt-donut-legend { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.kipt-donut-leg-row { display: flex; align-items: center; gap: 8px; }
.kipt-donut-leg-dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.kipt-donut-leg-name { font-size: 11px; font-weight: 600; color: var(--ink-2); flex: 1; }
.kipt-donut-leg-pct  { font-size: 13px; font-weight: 800; color: var(--ink); }
`

const ArrowIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
    <path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const IptuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)

export default function IptuPage() {
  const router = useRouter()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [ano, setAno] = useState(2026)
  const [dados, setDados] = useState<DadosIPTU | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('k-theme') as 'light' | 'dark' | null
    if (saved) setTheme(saved)
  }, [])

  useEffect(() => {
    setDados(null)
    fetch(`/api/iptu?ano=${ano}`)
      .then(res => {
        if (res.status === 401) { router.push('/login'); return null }
        return res.json()
      })
      .then(data => { if (data) setDados(data as DadosIPTU) })
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
    axisLine: false as const,
    tickLine: false as const,
  }

  const maxBairro = dados ? Math.max(...dados.bairros.map(b => b.valor)) : 1
  const totalDivida = dados ? dados.aging.reduce((s, a) => s + a.valor, 0) : 0

  return (
    <div className="kipt-root" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── SIDEBAR ── */}
      <aside className="kipt-sidebar">
        <div className="kipt-brand">
          <div className="kipt-brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 22V10l9-7 9 7v12H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M9 22v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="kipt-brand-text">
            <div className="t1">Analytics Municipal</div>
          </div>
        </div>

        <div>
          <div className="kipt-nav-label">Menu</div>
          <nav className="kipt-nav">
            <Link href="/orcamento">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15V9M12 15V5M16 15v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Orçamento
            </Link>
            <Link href="/receita">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Receita
            </Link>
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <a className="active" href="/iptu">
              <IptuIcon />
              IPTU
            </a>
            <Link href="/chat">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Chat IA
            </Link>
            <Link href="/catalogo">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Catálogo
            </Link>
            <Link href="/dashboard">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 13l9-9 9 9M5 11v9h14v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Consulta
            </Link>
          </nav>
        </div>

        <div style={{ marginTop: 'auto', background: 'var(--green-ink)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, opacity: .7, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Dashboard</div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, lineHeight: 1.4, marginBottom: '6px' }}>IPTU do Município</div>
          <div style={{ fontSize: '11.5px', opacity: .7, lineHeight: 1.5 }}>Arrecadação, cadastro e dívida · dados mock</div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="kipt-main">

        {/* Header */}
        <div className="kipt-topbar">
          <div>
            <h1 className="kipt-title">IPTU <em>do Município</em></h1>
            <p className="kipt-sub">Análise executiva · arrecadação, cadastro e dívida · {ano}</p>
          </div>
          <div className="kipt-topbar-right">
            <div className="kipt-theme-toggle">
              <button className={theme === 'light' ? 'active' : ''} onClick={() => toggleTheme('light')}>☀ Claro</button>
              <button className={theme === 'dark'  ? 'active' : ''} onClick={() => toggleTheme('dark')}>☾ Escuro</button>
            </div>
            <button className="kipt-hdr-btn primary" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Exportar
            </button>
            <button className="kipt-hdr-btn secondary" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3M13 21h6a2 2 0 002-2v-6a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Carnê IPTU
            </button>
            <button className="kipt-hdr-btn secondary" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="1.8"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke="currentColor" strokeWidth="1.8"/></svg>
              Detalhe Cadastro
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="kipt-kpi-grid">

          {/* 1. IPTU Lançado */}
          <div className="kipt-kpi accent">
            <div className="kipt-kpi-label">IPTU Lançado</div>
            {dados ? (
              <>
                <div className="kipt-kpi-val">{fmtM(dados.kpis.lancado.valor)}</div>
                <div className={`kipt-kpi-sub ${dados.kpis.lancado.vs_ano_anterior_pct >= 0 ? 'up' : 'down'}`}>
                  {dados.kpis.lancado.vs_ano_anterior_pct >= 0 ? '▲' : '▼'}{Math.abs(dados.kpis.lancado.vs_ano_anterior_pct).toFixed(1)}% vs ano anterior
                </div>
              </>
            ) : (
              <><div className="kipt-sk" style={{ width: '80%', height: '28px', marginBottom: '8px' }} /><div className="kipt-sk" style={{ width: '60%', height: '13px' }} /></>
            )}
            <div className="kipt-kpi-arrow"><ArrowIcon /></div>
          </div>

          {/* 2. IPTU Arrecadado */}
          <div className="kipt-kpi">
            <div className="kipt-kpi-label">IPTU Arrecadado</div>
            {dados ? (
              <>
                <div className="kipt-kpi-val">{fmtM(dados.kpis.arrecadado.valor)}</div>
                <div className={`kipt-kpi-sub ${dados.kpis.arrecadado.vs_ano_anterior_pct >= 0 ? 'up' : 'down'}`}>
                  {dados.kpis.arrecadado.vs_ano_anterior_pct >= 0 ? '▲' : '▼'}{Math.abs(dados.kpis.arrecadado.vs_ano_anterior_pct).toFixed(1)}% vs ano anterior
                </div>
              </>
            ) : (
              <><div className="kipt-sk" style={{ width: '80%', height: '28px', marginBottom: '8px' }} /><div className="kipt-sk" style={{ width: '60%', height: '13px' }} /></>
            )}
            <div className="kipt-kpi-arrow"><ArrowIcon /></div>
          </div>

          {/* 3. % Efetividade */}
          <div className="kipt-kpi">
            <div className="kipt-kpi-label">% Efetividade</div>
            {dados ? (
              <>
                <div className="kipt-kpi-val">{dados.kpis.efetividade.pct.toFixed(1)}%</div>
                <div className="kipt-kpi-sub muted">arrecadado / lançado</div>
              </>
            ) : (
              <><div className="kipt-sk" style={{ width: '80%', height: '28px', marginBottom: '8px' }} /><div className="kipt-sk" style={{ width: '60%', height: '13px' }} /></>
            )}
            <div className="kipt-kpi-arrow"><ArrowIcon /></div>
          </div>

          {/* 4. Inadimplência */}
          <div className="kipt-kpi warm">
            <div className="kipt-kpi-label">Inadimplência</div>
            {dados ? (
              <>
                <div className="kipt-kpi-val">{fmtM(dados.kpis.inadimplencia.valor)}</div>
                <div className={`kipt-kpi-sub ${dados.kpis.inadimplencia.vs_ano_anterior_pct >= 0 ? 'down' : 'up'}`}>
                  {dados.kpis.inadimplencia.vs_ano_anterior_pct >= 0 ? '▲' : '▼'}{Math.abs(dados.kpis.inadimplencia.vs_ano_anterior_pct).toFixed(1)}% vs ano anterior
                </div>
              </>
            ) : (
              <><div className="kipt-sk" style={{ width: '80%', height: '28px', marginBottom: '8px' }} /><div className="kipt-sk" style={{ width: '60%', height: '13px' }} /></>
            )}
            <div className="kipt-kpi-arrow"><ArrowIcon /></div>
          </div>

          {/* 5. Imóveis Cadastrados */}
          <div className="kipt-kpi">
            <div className="kipt-kpi-label">Imóveis Cadastrados</div>
            {dados ? (
              <>
                <div className="kipt-kpi-val">{fmtQtde(dados.kpis.imoveis.qtde)}</div>
                <div className="kipt-kpi-sub muted">imóveis no cadastro</div>
              </>
            ) : (
              <><div className="kipt-sk" style={{ width: '80%', height: '28px', marginBottom: '8px' }} /><div className="kipt-sk" style={{ width: '60%', height: '13px' }} /></>
            )}
            <div className="kipt-kpi-arrow"><ArrowIcon /></div>
          </div>

        </div>

        {/* CHARTS GO IN TASK 3 — placeholder rows for now */}

      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build passes**

Run: `cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura" && npm run build`
Expected: Compilation succeeds, no TypeScript errors. `/iptu` listed as a new route.

- [ ] **Step 3: Manual visual check**

Run: `cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura" && npm run dev` in a separate terminal, then open `http://localhost:3000/iptu`.
Expected: page renders with sidebar (IPTU active in 4th position), header with title "IPTU do Município", 5 KPI cards in a row. Skeleton loaders flash briefly before values populate. No console errors. Click each year pill — values update (when Task 3 adds them; for now KPI numbers should change since the API is wired).

Then stop the dev server.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura"
git add app/iptu/page.tsx
git commit -m "feat(iptu): add /iptu page shell with sidebar, header and 5 KPI cards"
```

---

### Task 3: Add Row 2 (BarChart mensal + Donut Tipo) and Row 3 (Top 10 Bairros + Donut Aging)

**Files:**
- Modify: `app/iptu/page.tsx` — replace the `{/* CHARTS GO IN TASK 3 — placeholder rows for now */}` comment with the two row blocks below.

- [ ] **Step 1: Replace the placeholder comment with the two rows**

In `app/iptu/page.tsx`, find the line:

```tsx
        {/* CHARTS GO IN TASK 3 — placeholder rows for now */}
```

Replace it with:

```tsx
        {/* ── Row 2: BarChart mensal + Donut Tipo ── */}
        <div className="kipt-row2">

          {/* Arrecadação Mensal */}
          <div className="kipt-card">
            <div className="kipt-card-hdr">
              <h2 className="kipt-card-title">Arrecadação Mensal — Lançado vs. Arrecadado</h2>
              <div className="kipt-year-pills">
                {ANOS.map(a => (
                  <button key={a} className={`kipt-year-pill${ano === a ? ' active' : ''}`} onClick={() => setAno(a)}>{a}</button>
                ))}
              </div>
            </div>
            {dados ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dados.mensal} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={16} barCategoryGap="28%">
                    <XAxis dataKey="mes" {...axisProps} dy={6} />
                    <YAxis tickFormatter={fmtAxis} {...axisProps} width={42} />
                    <Tooltip
                      formatter={(v, name) => [fmtM(Number(v)), name === 'lancado' ? 'Lançado' : 'Arrecadado']}
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'var(--green-soft)' }}
                    />
                    <Bar dataKey="lancado"    fill="#d1d5db" radius={[4, 4, 0, 0]} name="lancado"    />
                    <Bar dataKey="arrecadado" fill="#2563eb" radius={[4, 4, 0, 0]} name="arrecadado" />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', paddingLeft: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--ink-3)' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#d1d5db', flexShrink: 0 }} />
                    Lançado
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--ink-3)' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#2563eb', flexShrink: 0 }} />
                    Arrecadado
                  </div>
                </div>
              </>
            ) : (
              <div className="kipt-sk-full" style={{ height: '220px' }} />
            )}
          </div>

          {/* Por Tipo de Imóvel */}
          <div className="kipt-card">
            <div className="kipt-card-hdr">
              <h2 className="kipt-card-title">Por Tipo de Imóvel</h2>
              <button className="kipt-detail-btn" type="button">Detalhes</button>
            </div>
            {dados ? (
              <div className="kipt-donut-wrap">
                <div className="kipt-donut-chart">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie
                        data={dados.tipos}
                        cx="50%" cy="50%"
                        innerRadius={66} outerRadius={100}
                        dataKey="valor" strokeWidth={0}
                      >
                        {dados.tipos.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i] ?? '#93c5fd'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="kipt-donut-inner">
                    <div className="kipt-donut-val">{fmtM(dados.kpis.arrecadado.valor)}</div>
                    <div className="kipt-donut-lbl">arrecadado</div>
                  </div>
                </div>
                <div className="kipt-donut-legend">
                  {dados.tipos.map((t, i) => (
                    <div key={i} className="kipt-donut-leg-row">
                      <div className="kipt-donut-leg-dot" style={{ background: DONUT_COLORS[i] ?? '#93c5fd' }} />
                      <span className="kipt-donut-leg-name">{t.nome}</span>
                      <span className="kipt-donut-leg-pct">{t.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="kipt-sk-full" style={{ height: '220px' }} />
            )}
          </div>
        </div>

        {/* ── Row 3: Top 10 Bairros + Donut Aging Dívida ── */}
        <div className="kipt-row3">

          {/* Top 10 Bairros */}
          <div className="kipt-card">
            <div className="kipt-card-hdr">
              <h2 className="kipt-card-title">Top 10 Bairros em Arrecadação</h2>
              <button className="kipt-detail-btn" type="button">Detalhes</button>
            </div>
            {dados ? (
              <div className="kipt-bar-list">
                {dados.bairros.map((b, i) => (
                  <div key={i} className="kipt-bar-row">
                    <div className="kipt-bar-top">
                      <span className="kipt-bar-name">{b.nome}</span>
                      <span className="kipt-bar-val">{fmtMShort(b.valor)}</span>
                    </div>
                    <div className="kipt-bar-track">
                      <div className="kipt-bar-fill" style={{ width: `${(b.valor / maxBairro) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="kipt-sk-full" style={{ height: '320px' }} />
            )}
          </div>

          {/* Aging da Dívida */}
          <div className="kipt-card">
            <div className="kipt-card-hdr">
              <h2 className="kipt-card-title">Aging da Dívida</h2>
              <button className="kipt-detail-btn" type="button">Detalhes</button>
            </div>
            {dados ? (
              <div className="kipt-donut-wrap">
                <div className="kipt-donut-chart">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie
                        data={dados.aging}
                        cx="50%" cy="50%"
                        innerRadius={66} outerRadius={100}
                        dataKey="valor" strokeWidth={0}
                      >
                        {dados.aging.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i] ?? '#93c5fd'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="kipt-donut-inner">
                    <div className="kipt-donut-val">{fmtM(totalDivida)}</div>
                    <div className="kipt-donut-lbl">dívida total</div>
                  </div>
                </div>
                <div className="kipt-donut-legend">
                  {dados.aging.map((a, i) => (
                    <div key={i} className="kipt-donut-leg-row">
                      <div className="kipt-donut-leg-dot" style={{ background: DONUT_COLORS[i] ?? '#93c5fd' }} />
                      <span className="kipt-donut-leg-name">{a.faixa}</span>
                      <span className="kipt-donut-leg-pct">{a.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="kipt-sk-full" style={{ height: '220px' }} />
            )}
          </div>

        </div>
```

- [ ] **Step 2: Verify the build passes**

Run: `cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura" && npm run build`
Expected: Compilation succeeds. No TypeScript errors related to Recharts props (`dataKey`, `name`, `fill`).

- [ ] **Step 3: Manual visual check**

Run dev server, open `http://localhost:3000/iptu`.
Expected:
- BarChart mensal renders 12 months × 2 bars (gray=Lançado, blue=Arrecadado). Pills 2023/2024/2025/2026 work; clicking changes the bars.
- Donut "Por Tipo de Imóvel" renders 4 colored slices with legend on right; center shows arrecadação total.
- "Top 10 Bairros" lists 10 rows with bar widths proportional to the largest value (CENTRO should fill the whole bar in 2025; others scaled).
- Donut "Aging da Dívida" renders 4 slices, center shows total dívida.
- Theme toggle (Claro/Escuro) flips palette across the entire page including charts.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura"
git add app/iptu/page.tsx
git commit -m "feat(iptu): add Row 2 (mensal/tipo) and Row 3 (bairros/aging) charts"
```

---

### Task 4: Add IPTU link to all 5 existing sidebars

The new sidebar order is: Orçamento → Receita → Despesa → **IPTU** → Chat IA → Catálogo → Consulta. In all 5 existing pages, insert the IPTU `<Link>` immediately after the Despesa link.

**Files:**
- Modify: `app/orcamento/page.tsx`
- Modify: `app/receita/page.tsx`
- Modify: `app/despesa/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/chat/page.tsx`

The "Despesa" link in each file currently looks like one of these two forms:

**Form A** (in pages where Despesa is *not* active, i.e. orcamento, receita, dashboard, chat):
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
```

**Form B** (in `app/despesa/page.tsx` where Despesa is active):
```tsx
            <a className="active" href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </a>
```

The block to insert immediately after that closing `</Link>` or `</a>` is:

```tsx
            <Link href="/iptu">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              IPTU
            </Link>
```

- [ ] **Step 1: Insert IPTU link in `app/orcamento/page.tsx`**

Find this block:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/chat">
```

Replace with:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/iptu">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              IPTU
            </Link>
            <Link href="/chat">
```

- [ ] **Step 2: Insert IPTU link in `app/receita/page.tsx`**

Find:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/chat">
```

Replace with:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/iptu">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              IPTU
            </Link>
            <Link href="/chat">
```

- [ ] **Step 3: Insert IPTU link in `app/despesa/page.tsx`**

Find (note: this file uses the active `<a>` form because Despesa is the active page):
```tsx
            <a className="active" href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </a>
            <Link href="/chat">
```

Replace with:
```tsx
            <a className="active" href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </a>
            <Link href="/iptu">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              IPTU
            </Link>
            <Link href="/chat">
```

- [ ] **Step 4: Insert IPTU link in `app/dashboard/page.tsx`**

Find:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/chat">
```

Replace with:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/iptu">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              IPTU
            </Link>
            <Link href="/chat">
```

- [ ] **Step 5: Insert IPTU link in `app/chat/page.tsx`**

Find:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <a className="active" href="/chat">
```

Replace with:
```tsx
            <Link href="/despesa">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 3v18M16 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Despesa
            </Link>
            <Link href="/iptu">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              IPTU
            </Link>
            <a className="active" href="/chat">
```

- [ ] **Step 6: Verify the build passes**

Run: `cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura" && npm run build`
Expected: Compilation succeeds with no TypeScript errors.

- [ ] **Step 7: Manual cross-page navigation check**

Run dev server, open `http://localhost:3000/orcamento`.
Expected sidebar order in every page (Orçamento, Receita, Despesa, IPTU, Chat IA, Catálogo, Consulta).
Click "IPTU" from any page — it should navigate to `/iptu` and that link should appear active. Then click "Despesa", "Receita", etc., to confirm they all show IPTU as the 4th item.

Stop dev server.

- [ ] **Step 8: Commit and push**

```bash
cd "C:\Users\CAPITANI\OneDrive\Documentos\Projeto-Prefeitura"
git add app/orcamento/page.tsx app/receita/page.tsx app/despesa/page.tsx app/dashboard/page.tsx app/chat/page.tsx
git commit -m "feat(iptu): add IPTU link as 4th item in all existing sidebars"
git push
```

---

## Self-Review

**1. Spec coverage:**
- API contract (DadosIPTU + GET handler + 4 years + 401 fallback) → Task 1 ✓
- Sidebar with IPTU active 4th → Task 2 ✓
- Header with Instrument Serif title + 3 buttons + theme toggle → Task 2 ✓
- 5 KPI cards (1 accent, 1 warm, 3 plain) with up/down badges → Task 2 ✓
- Row 2: BarChart mensal lançado vs arrecadado + year pills + inline legend → Task 3 ✓
- Row 2: Donut Por Tipo de Imóvel (4 slices) → Task 3 ✓
- Row 3: Top 10 Bairros (CSS bars with gradient) → Task 3 ✓
- Row 3: Donut Aging da Dívida (4 faixas) → Task 3 ✓
- Skeleton loaders during fetch → Tasks 2 & 3 (`.kipt-sk`, `.kipt-sk-full`) ✓
- Theme toggle shared via `localStorage["k-theme"]` → Task 2 ✓
- Sidebar updates in 5 existing files → Task 4 ✓
- IPTU icon (casa com $) → defined in `IptuIcon` (Task 2) and inlined SVG (Task 4) — same path data, consistent ✓

**2. Placeholder scan:** No "TBD", "TODO" or vague phrasing. All code blocks complete. Step 2 of Task 2 references the comment `{/* CHARTS GO IN TASK 3 — placeholder rows for now */}` — Task 3 Step 1 explicitly replaces it. Intentional handoff, not a placeholder failure.

**3. Type consistency:**
- `DadosIPTU` interface defined in Task 1 is imported in Task 2 via `import type { DadosIPTU } from '@/app/api/iptu/route'` — matches the export from Task 1. ✓
- `mensal` items use `lancado` + `arrecadado` keys consistently in API mock (Task 1) and `<Bar dataKey="lancado" />` / `<Bar dataKey="arrecadado" />` (Task 3). ✓
- `tipos`, `bairros`, `aging` array shapes match between mock data (Task 1) and consumers (Task 3 mapping). ✓
- `efetividade` shape `{ pct: number }` matches `dados.kpis.efetividade.pct.toFixed(1)` in Task 2. ✓
- `imoveis` shape `{ qtde: number }` matches `dados.kpis.imoveis.qtde` in Task 2. ✓
- Sidebar SVG path data for IPTU icon: in Task 2 the `IptuIcon` component uses `M3 12l9-9 9 9M5 10v10h14V10` + `M12 14v4M10 16h4`; in Task 4 the inline SVG uses the same two paths. ✓

No issues found.
