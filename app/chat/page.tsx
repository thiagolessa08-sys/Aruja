'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { abaVisivel, lerPerfilCookie, type Perfil } from '@/lib/perfil'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine,
  AreaChart, Area, ResponsiveContainer,
} from 'recharts'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ToolEvent {
  name: string
  sql?: string
  rows?: number
  error?: string
  done: boolean
}

const SUGESTOES = [
  'Quais são as maiores despesas por secretaria?',
  'Mostre o total de despesas por mês em 2025',
  'Quais fornecedores receberam mais pagamentos?',
  'Compare empenho, liquidação e pagamento por secretaria',
]

const CHART_COLORS = [
  '#283e93',
  '#5870c4',
  '#7d8fce',
  '#aab8e3',
  '#3a55ad',
  '#c2cdef',
]

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.kc-root, .kc-root * { box-sizing: border-box; }
.kc-root {
  font-family: var(--font-poppins), 'Poppins', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  padding: 26px 14px;

  --bg: #eef2f9;
  --surface: #ffffff;
  --surface-2: #f4f7fc;
  --ink: #1f2a44;
  --ink-2: #3a4256;
  --ink-3: #9098a8;
  --line: #eef1f7;
  --line-2: #e3e9f5;
  --green: #283e93;
  --green-deep: #1f2f70;
  --green-ink: #1f2a44;
  --green-soft: #e9edf8;
  --amber: #e0a32e;
  --rose: #d36b6b;
  --radius: 22px;
  --radius-sm: 14px;
  --shadow-sm: 0 1px 2px rgba(40,80,180,.06);
  --msg-user-bg: var(--green);
  --msg-user-ink: #fff;
  --msg-ai-bg: var(--surface);
  --msg-ai-border: var(--line);
  --input-bg: var(--surface);
  --input-border: var(--line-2);
}

.kc-wrap { max-width: 1560px; margin: 0 auto; display: flex; flex-direction: column; }

/* TOP NAV */
.kc-nav {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-radius: 20px; padding: 12px 18px;
  box-shadow: 0 6px 22px rgba(40,80,180,0.05);
}
.kc-nav-logo { height: 46px; width: auto; display: block; }
.kc-tabs {
  display: flex; align-items: center; gap: 3px; flex-wrap: wrap; justify-content: center;
  background: #f4f7fc; border-radius: 30px; padding: 5px;
}
.kc-tab {
  padding: 9px 14px; border-radius: 24px; color: #5b6477;
  font-size: 13.5px; font-weight: 500; cursor: pointer; text-decoration: none;
  border: 0; background: transparent; font-family: inherit; white-space: nowrap;
}
.kc-tab.active {
  padding: 9px 16px; background: #283e93; color: #fff;
  box-shadow: 0 6px 14px rgba(40,62,147,0.35);
}
.kc-icons { display: flex; align-items: center; gap: 14px; }
.kc-icon-btn {
  width: 42px; height: 42px; border-radius: 50%; background: #e9edf8;
  display: flex; align-items: center; justify-content: center;
  border: 0; cursor: pointer; position: relative;
}
.kc-avatar-btn {
  width: 42px; height: 42px; border-radius: 50%; overflow: hidden;
  border: 2px solid #ffffff; box-shadow: 0 0 0 1px #e3e9f5;
  padding: 0; cursor: pointer; background: transparent;
}

/* GREETING */
.kc-greet { display: flex; align-items: center; justify-content: space-between; margin: 26px 4px 18px; gap: 16px; }
.kc-greet h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -.5px; color: #283e93; }
.kc-greet h1 span { color: #7d8fce; }
.kc-greet-right { display: flex; align-items: center; gap: 10px; }

/* Suggestions */
.kc-sugg-btn {
  width: 100%;
  text-align: left;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--ink-2);
  cursor: pointer;
  line-height: 1.4;
  transition: background .12s, border-color .12s, color .12s;
}
.kc-sugg-btn:hover { background: var(--green-soft); border-color: var(--green); color: var(--green); }

/* CHAT CARD */
.kc-main {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  min-height: 440px;
  overflow: hidden;
  min-width: 0;
  background: var(--surface);
  border-radius: 22px;
  box-shadow: 0 6px 22px rgba(40,80,180,0.05);
}

.kc-schema-btn {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  background: #fff;
  border: 1px solid var(--line-2);
  border-radius: 22px;
  padding: 9px 16px;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(40,80,180,0.04);
  transition: color .12s, border-color .12s;
}
.kc-schema-btn:hover { color: var(--green); border-color: var(--green); }
.kc-schema-btn:disabled { opacity: .4; cursor: not-allowed; }
.kc-cache-dot {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--green);
  background: #fff;
  border-radius: 22px;
  padding: 9px 14px;
  box-shadow: 0 4px 12px rgba(40,80,180,0.04);
}

/* Messages */
.kc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.kc-messages::-webkit-scrollbar { width: 6px; }
.kc-messages::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 999px; }

/* Empty state */
.kc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 40px 20px;
  gap: 0;
}
.kc-empty-icon {
  width: 64px; height: 64px;
  background: var(--green-soft);
  border-radius: 20px;
  display: grid; place-items: center;
  margin-bottom: 20px;
  color: var(--green);
}
.kc-empty h2 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  color: var(--green);
}
.kc-empty h2 em { font-style: normal; color: #7d8fce; }
.kc-empty p {
  font-size: 13.5px;
  color: var(--ink-3);
  margin: 0 0 28px;
  max-width: 360px;
  line-height: 1.6;
}
.kc-empty-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  max-width: 560px;
}

/* Message bubbles */
.kc-msg-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.kc-msg-row.user { flex-direction: row-reverse; }
.kc-avatar {
  width: 34px; height: 34px;
  border-radius: 10px;
  display: grid; place-items: center;
  flex-shrink: 0;
  color: #fff;
}
.kc-avatar.ai { background: var(--green); }
.kc-avatar.user { background: var(--surface-2); color: var(--ink-2); }
.kc-bubble {
  max-width: 78%;
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 13.5px;
  line-height: 1.6;
}
.kc-bubble.user {
  background: var(--msg-user-bg);
  color: var(--msg-user-ink);
  border-radius: 18px 4px 18px 18px;
}
.kc-bubble.ai {
  background: var(--msg-ai-bg);
  border: 1px solid var(--msg-ai-border);
  border-radius: 4px 18px 18px 18px;
  color: var(--ink);
}

/* Tool indicator */
.kc-tool {
  margin-left: 44px;
  font-size: 12px;
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kc-tool.running {
  background: #fbf4e6;
  border: 1px solid #f3e3c0;
  color: #b07d1e;
}
.kc-tool.ok {
  background: #eef2fb;
  border: 1px solid #d8e1f5;
  color: #2f4699;
}
.kc-tool.err {
  background: #fbeeee;
  border: 1px solid #f3d4d4;
  color: #b34141;
}
.kc-tool-row { display: flex; align-items: center; gap: 8px; }
.kc-sql-toggle {
  margin-left: auto;
  background: transparent;
  border: 0;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  opacity: .8;
  transition: opacity .12s;
  color: inherit;
  text-decoration: underline;
  flex-shrink: 0;
}
.kc-sql-toggle:hover { opacity: 1; }
.kc-sql-pre {
  background: oklch(0.14 0.012 150);
  color: oklch(0.80 0.12 150);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
  line-height: 1.5;
}

/* Markdown overrides inside AI bubble */
.kc-bubble.ai p { margin: 0 0 4px; font-size: 13.5px; color: var(--ink); }
.kc-bubble.ai h1, .kc-bubble.ai h2, .kc-bubble.ai h3 { color: var(--ink); font-weight: 700; margin: 12px 0 4px; }
.kc-bubble.ai h1 { font-size: 16px; }
.kc-bubble.ai h2 { font-size: 15px; }
.kc-bubble.ai h3 { font-size: 14px; }
.kc-bubble.ai li { color: var(--ink-2); font-size: 13.5px; }
.kc-bubble.ai strong { color: var(--ink); font-weight: 700; }
.kc-bubble.ai code { background: var(--surface-2); color: var(--green); padding: 1px 5px; border-radius: 5px; font-family: 'JetBrains Mono', monospace; font-size: 12px; }

/* Table inside bubble */
.kc-md-table { overflow-x: auto; border-radius: 14px; border: 1px solid var(--line); margin: 10px 0; box-shadow: var(--shadow-sm); }
.kc-md-table table { width: 100%; font-size: 12.5px; border-collapse: collapse; }
.kc-md-table thead tr { background: var(--green); }
.kc-md-table th { text-align: left; padding: 9px 14px; font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; border: none; }
.kc-md-table tbody tr:nth-child(even) td { background: var(--surface-2); }
.kc-md-table tbody tr:nth-child(odd) td { background: var(--surface); }
.kc-md-table td { padding: 8px 14px; border-bottom: 1px solid var(--line); color: var(--ink-2); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.kc-md-table tr:last-child td { border-bottom: 0; }
.kc-md-table tbody tr:hover td { background: var(--green-soft) !important; color: var(--ink); transition: background .1s; }
.kc-md-table td:first-child { color: var(--ink); font-weight: 600; font-family: var(--font-poppins), 'Poppins', sans-serif; font-size: 12.5px; }
.kc-chart-toggle { display: flex; gap: 4px; margin-bottom: 10px; }
.kc-chart-tab {
  font-size: 12px; font-weight: 700; padding: 5px 14px;
  border-radius: 999px; border: 1px solid var(--line-2);
  background: var(--surface); color: var(--ink-2);
  cursor: pointer; font-family: inherit; transition: all .12s;
  display: flex; align-items: center; gap: 5px;
}
.kc-chart-tab:hover { border-color: var(--green); color: var(--green); }
.kc-chart-tab.on { background: var(--green); color: #fff; border-color: var(--green); box-shadow: 0 2px 8px oklch(0.48 0.11 155 / .25); }

/* Input area */
.kc-input-bar {
  background: var(--surface);
  border-top: 1px solid var(--line);
  padding: 16px 24px;
  flex-shrink: 0;
}
.kc-input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  max-width: 860px;
  margin: 0 auto;
}
.kc-textarea {
  flex: 1;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 16px;
  padding: 12px 16px;
  font-family: var(--font-poppins), 'Poppins', system-ui, sans-serif;
  font-size: 13.5px;
  color: var(--ink);
  resize: none;
  outline: none;
  max-height: 140px;
  line-height: 1.5;
  transition: border-color .15s;
}
.kc-textarea:focus { border-color: var(--green); }
.kc-textarea::placeholder { color: var(--ink-3); }
.kc-textarea:disabled { opacity: .5; }
.kc-send-btn {
  width: 44px; height: 44px;
  background: var(--green);
  color: #fff;
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  display: grid; place-items: center;
  flex-shrink: 0;
  transition: background .12s, transform .08s;
}
.kc-send-btn:hover { background: var(--green-ink); }
.kc-send-btn:active { transform: scale(.95); }
.kc-send-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }

/* Botão baixar PDF */
.kc-pdf-btn {
  display: inline-flex; align-items: center; gap: 7px;
  background: #fff; color: #283e93;
  border: 1.5px solid #cdd5ef; border-radius: 12px;
  padding: 8px 14px; font-size: 12.5px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  box-shadow: 0 2px 8px rgba(40,80,180,.06);
  transition: background .12s, color .12s, border-color .12s;
}
.kc-pdf-btn:hover { background: #283e93; color: #fff; border-color: #283e93; }

/* Spinner */
@keyframes kc-spin { to { transform: rotate(360deg); } }
.kc-spin { animation: kc-spin .8s linear infinite; }

/* Loading indicator */
.kc-thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 18px 18px 18px 4px;
  background: var(--msg-ai-bg);
  border: 1px solid var(--msg-ai-border);
  font-size: 13px;
  color: var(--ink-3);
  width: fit-content;
}
`

function parseNum(raw: string): number | null {
  const cleaned = raw
    .replace(/R\$\s*/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function isTimeSeries(labels: string[]): boolean {
  return labels.filter(l =>
    /^\d{4}$/.test(l) ||
    /^\d{4}[-/]\d{2}/.test(l) ||
    /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(l) ||
    /^\d{2}\/\d{4}$/.test(l)
  ).length >= labels.length * 0.6
}

function formatTick(val: number): string {
  if (Math.abs(val) >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}K`
  return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

type ChartType = 'bar' | 'bar-h' | 'area'

const CHART_TYPE_OPTS: { type: ChartType; label: string; icon: React.ReactNode }[] = [
  {
    type: 'bar',
    label: 'Colunas',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15V9M12 15V5M16 15v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  },
  {
    type: 'bar-h',
    label: 'Barras',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 4h16M5 4v16M9 8h8M9 12h12M9 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  },
  {
    type: 'area',
    label: 'Linha',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 17l4-6 4 3 4-7 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
]

function TableAndChart({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [view, setView] = useState<'table' | 'chart'>('chart')

  const numericCols = headers.map((_, ci) => {
    const vals = rows.slice(0, 15).map(r => parseNum(r[ci] ?? ''))
    const nonNull = vals.filter(v => v !== null)
    return nonNull.length >= Math.min(2, rows.length)
  })

  const labelColIdx = numericCols.findIndex(n => !n)
  const actualLabelCol = labelColIdx === -1 ? 0 : labelColIdx
  const valueCols = headers.map((_, i) => i).filter(i => numericCols[i] && i !== actualLabelCol)

  const hasChart = valueCols.length > 0 && rows.length >= 2

  const labels = rows.map(r => r[actualLabelCol] ?? '')
  const timeSeries = isTimeSeries(labels)
  const longLabels = labels.some(l => l.length > 18)

  const defaultChartType: ChartType = timeSeries ? 'area' : longLabels ? 'bar-h' : 'bar'
  const [chartType, setChartType] = useState<ChartType>(defaultChartType)

  const chartData = rows.map(row => {
    const obj: Record<string, string | number> = { label: row[actualLabelCol] ?? '' }
    valueCols.forEach(ci => {
      const val = parseNum(row[ci] ?? '')
      if (val !== null) obj[headers[ci]] = val
    })
    return obj
  })

  const maxLabelLen = Math.max(...labels.map(l => l.length))
  const yAxisWidth = Math.min(180, Math.max(80, maxLabelLen * 6.5))
  const chartHeight = chartType === 'bar-h'
    ? Math.max(200, Math.min(600, rows.length * 32 + 60))
    : Math.max(240, Math.min(400, rows.length * 20 + 80))

  const tableEl = (
    <div className="kc-md-table">
      <table>
        <thead>
          <tr>{headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const tooltipStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: '14px',
    boxShadow: '0 8px 24px rgba(0,0,0,.12)',
    padding: '10px 14px',
    fontSize: '12.5px',
    fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
  }

  const axisProps = {
    tick: { fontSize: 11, fill: 'var(--ink-3)', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" },
    axisLine: false as const,
    tickLine: false as const,
  }

  const chartEl = (
    <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '16px 8px 8px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        {chartType === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <defs>
              {valueCols.map((ci, idx) => (
                <linearGradient key={ci} id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <XAxis dataKey="label" {...axisProps} dy={8} />
            <YAxis tickFormatter={formatTick} {...axisProps} width={68} />
            <ReferenceLine y={0} stroke="var(--line-2)" strokeWidth={1} />
            <Tooltip formatter={(v) => [formatTick(Number(v ?? 0)), '']} contentStyle={tooltipStyle} cursor={{ stroke: 'var(--green)', strokeWidth: 1, strokeDasharray: '4 2' }} />
            <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} />
            {valueCols.map((ci, idx) => (
              <Area key={ci} type="monotone" dataKey={headers[ci]}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2.5}
                fill={`url(#grad-${idx})`}
                dot={{ r: rows.length <= 24 ? 3 : 0, fill: CHART_COLORS[idx % CHART_COLORS.length], strokeWidth: 0 }}
                activeDot={{ r: 5, fill: CHART_COLORS[idx % CHART_COLORS.length], stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            ))}
          </AreaChart>
        ) : chartType === 'bar-h' ? (
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
            <XAxis type="number" tickFormatter={formatTick} {...axisProps} />
            <YAxis dataKey="label" type="category" {...axisProps} width={yAxisWidth} />
            <ReferenceLine x={0} stroke="var(--line-2)" />
            <Tooltip formatter={(v) => [formatTick(Number(v ?? 0)), '']} contentStyle={tooltipStyle} cursor={{ fill: 'var(--green-soft)' }} />
            <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} />
            {valueCols.map((ci, idx) => (
              <Bar key={ci} dataKey={headers[ci]} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[0, 8, 8, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: rows.length > 6 ? 48 : 30 }}>
            <XAxis dataKey="label" {...axisProps} angle={rows.length > 6 ? -35 : 0} textAnchor={rows.length > 6 ? 'end' : 'middle'} interval={0} dy={8} />
            <YAxis tickFormatter={formatTick} {...axisProps} width={68} />
            <ReferenceLine y={0} stroke="var(--line-2)" />
            <Tooltip formatter={(v) => [formatTick(Number(v ?? 0)), '']} contentStyle={tooltipStyle} cursor={{ fill: 'var(--green-soft)' }} />
            <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} />
            {valueCols.map((ci, idx) => (
              <Bar key={ci} dataKey={headers[ci]} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[6, 6, 0, 0]} maxBarSize={48} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )

  return (
    <div style={{ margin: '10px 0' }}>
      {hasChart && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div className="kc-chart-toggle">
            <button className={`kc-chart-tab${view === 'chart' ? ' on' : ''}`} onClick={() => setView('chart')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15V9M12 15V6M16 15v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Gráfico
            </button>
            <button className={`kc-chart-tab${view === 'table' ? ' on' : ''}`} onClick={() => setView('table')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 10h18M3 14h18M10 6v12M14 6v12" stroke="currentColor" strokeWidth="2"/></svg>
              Tabela
            </button>
          </div>

          {/* Chart type selector — only when chart is visible */}
          {view === 'chart' && (
            <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2)', borderRadius: '10px', padding: '3px' }}>
              {CHART_TYPE_OPTS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setChartType(opt.type)}
                  title={opt.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', borderRadius: '7px', border: 'none',
                    background: chartType === opt.type ? 'var(--green)' : 'transparent',
                    color: chartType === opt.type ? '#fff' : 'var(--ink-3)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '11.5px', fontWeight: 600,
                    transition: 'all .12s',
                    boxShadow: chartType === opt.type ? '0 2px 6px oklch(0.52 0.20 264 / .3)' : 'none',
                  }}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {view === 'chart' && hasChart ? chartEl : tableEl}
    </div>
  )
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i}>{part.slice(1, -1)}</code>
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}>{part.slice(1, -1)}</em>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <div key={i} style={{ margin: '10px 0', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--line)' }}>
          {lang && (
            <div style={{ background: 'oklch(0.18 0.012 150)', color: 'var(--ink-3)', fontSize: '11px', padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {lang}
            </div>
          )}
          <pre style={{ background: 'oklch(0.14 0.012 150)', color: 'oklch(0.80 0.12 150)', fontSize: '12px', padding: '12px', margin: 0, overflowX: 'auto', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, whiteSpace: 'pre' }}>
            {codeLines.join('\n')}
          </pre>
        </div>
      )
      i++
      continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = tableLines
        .filter(l => !l.match(/^\|[\s\-:|]+\|$/))
        .map(l =>
          l.split('|')
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map(c => c.trim())
        )
      if (rows.length > 0) {
        const [headerRow, ...dataRows] = rows
        elements.push(<TableAndChart key={i} headers={headerRow} rows={dataRows} />)
      }
      continue
    }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i}>{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i}>{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i}>{line.slice(2)}</h1>)
    } else if (line.match(/^[-*] /)) {
      elements.push(<li key={i} style={{ marginLeft: '16px', listStyle: 'disc' }}><InlineMarkdown text={line.slice(2)} /></li>)
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '6px' }} />)
    } else {
      elements.push(<p key={i}><InlineMarkdown text={line} /></p>)
    }
    i++
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{elements}</div>
}

// ————————————— Relatório em PDF —————————————
// Detecta pedido de relatório em PDF na mensagem do usuário.
function pedeRelatorioPdf(text: string): boolean {
  return /\bpdf\b/i.test(text)
}

// Detecta pedido de relatório em Excel/planilha na mensagem do usuário.
function pedeRelatorioExcel(text: string): boolean {
  return /\b(excel|planilha|xlsx|xls|csv)\b/i.test(text)
}

// Remove marcações inline (**, *, `) e sanitiza para a fonte do PDF (CP1252): a Helvetica
// do jsPDF não suporta emojis/símbolos fora do Latin-1 e embaralha o texto. Converte os
// símbolos comuns de status em texto e remove o restante (acentos do pt-BR são mantidos).
const stripInline = (s: string) => s
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*([^*]+)\*/g, '$1')
  .replace(/[✅✔✓☑]/g, 'OK ')   // check marks -> OK
  .replace(/[❌✖✗✘]/g, 'X ')     // cross marks -> X
  .replace(/[⚠⛔]/g, '! ')                   // warning/no-entry -> !
  .replace(/[^ -ÿ–—‘’“”•…€]/g, '') // fora do CP1252 -> remove
  .replace(/[ 	]{2,}/g, ' ')
  .trim()

interface Card { rotulo: string; valor: string }
type Bloco =
  | { tipo: 'h1' | 'h2' | 'h3' | 'p' | 'li'; texto: string }
  | { tipo: 'gap' }
  | { tipo: 'table'; linhas: string[][] }
  | { tipo: 'cards'; cards: Card[] }

// Cor institucional (azul da Prefeitura de Arujá).
const AZUL: [number, number, number] = [40, 62, 147]
const AZUL_ALT: [number, number, number] = [244, 247, 252]

// Quebra o markdown da resposta em blocos. Uma seção de heading contendo "Destaque(s)"
// seguida de itens "Rótulo: valor" vira um bloco de CARDS (destaques no topo do relatório).
function parseBlocos(md: string): Bloco[] {
  const lines = md.split('\n')
  const raw: Bloco[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('|')) {
      const tl: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tl.push(lines[i]); i++ }
      const linhas = tl.filter(l => !l.match(/^\|[\s\-:|]+\|$/))
        .map(l => l.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => stripInline(c.trim())))
      if (linhas.length) raw.push({ tipo: 'table', linhas })
      continue
    }
    if (line.startsWith('```')) { i++; while (i < lines.length && !lines[i].startsWith('```')) i++; i++; continue }
    if (line.startsWith('### ')) raw.push({ tipo: 'h3', texto: stripInline(line.slice(4)) })
    else if (line.startsWith('## ')) raw.push({ tipo: 'h2', texto: stripInline(line.slice(3)) })
    else if (line.startsWith('# ')) raw.push({ tipo: 'h1', texto: stripInline(line.slice(2)) })
    else if (line.match(/^[-*] /)) raw.push({ tipo: 'li', texto: stripInline(line.slice(2)) })
    else if (line.trim() === '') raw.push({ tipo: 'gap' })
    else raw.push({ tipo: 'p', texto: stripInline(line) })
    i++
  }
  // pós-processa: heading "Destaques" + itens seguintes → bloco de cards
  const out: Bloco[] = []
  for (let k = 0; k < raw.length; k++) {
    const b = raw[k]
    if ((b.tipo === 'h1' || b.tipo === 'h2' || b.tipo === 'h3') && /destaque/i.test(b.texto)) {
      const cards: Card[] = []
      let j = k + 1
      while (j < raw.length && (raw[j].tipo === 'li' || raw[j].tipo === 'gap')) {
        const bj = raw[j]
        if (bj.tipo === 'li') {
          const idx = bj.texto.indexOf(':')
          if (idx > 0) cards.push({ rotulo: bj.texto.slice(0, idx).trim(), valor: bj.texto.slice(idx + 1).trim() })
        }
        j++
      }
      if (cards.length) { out.push({ tipo: 'cards', cards: cards.slice(0, 4) }); k = j - 1; continue }
    }
    out.push(b)
  }
  return out
}

// Carrega o logo da prefeitura como dataURL + dimensões naturais (para preservar proporção).
async function carregarLogo(): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const res = await fetch('/logo-aruja.png')
    if (!res.ok) return null
    const blob = await res.blob()
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(blob)
    })
    const dim = await new Promise<{ w: number; h: number }>(resolve => {
      const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => resolve({ w: 0, h: 0 }); img.src = url
    })
    return { url, w: dim.w, h: dim.h }
  } catch { return null }
}

// Gera o PDF do relatório no template institucional e BAIXA direto (sem caixa de impressão).
async function baixarRelatorioPdf(markdown: string) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mx = 40
  const maxY = pageH - 46
  const dataStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ===== Cabeçalho institucional (logo à esquerda; "RELATÓRIO" + emissão à direita) =====
  const desenharCabecalho = (logo: { url: string; w: number; h: number } | null) => {
    const topo = 34
    if (logo && logo.h > 0) {
      const alt = 46, larg = Math.min(190, alt * (logo.w / logo.h))
      try { doc.addImage(logo.url, 'PNG', mx, topo, larg, alt) } catch { /* logo opcional */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(AZUL[0], AZUL[1], AZUL[2])
    doc.text('RELATÓRIO', pageW - mx, topo + 16, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 128, 148)
    doc.text(`Emitido em ${dataStr} · Secretaria da Fazenda`, pageW - mx, topo + 32, { align: 'right' })
    const yLinha = topo + 52
    doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]); doc.setLineWidth(2); doc.line(mx, yLinha, pageW - mx, yLinha)
    return yLinha + 22
  }

  const logo = await carregarLogo()
  let y = desenharCabecalho(logo)

  // Remove a narração intermediária do assistente ("Vou buscar…", "Perfeito!…"): o relatório
  // começa no título (# ...). Se houver um "# ", descarta tudo antes dele.
  const linhasMd = markdown.split('\n')
  const inicio = linhasMd.findIndex(l => l.startsWith('# '))
  const md = inicio >= 0 ? linhasMd.slice(inicio).join('\n') : markdown

  const ensure = (h: number) => { if (y + h > maxY) { doc.addPage(); y = desenharCabecalho(logo) } }
  const addTexto = (texto: string, size: number, style: 'normal' | 'bold', cor: [number, number, number], gapAfter: number) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(cor[0], cor[1], cor[2])
    const lh = size * 1.35
    for (const ln of doc.splitTextToSize(texto, pageW - 2 * mx)) { ensure(lh); doc.text(ln, mx, y); y += lh }
    y += gapAfter
  }

  // Cards de destaque (1º preenchido de azul; demais com contorno) — igual ao template.
  // O valor reduz a fonte até caber e quebra em até 2 linhas (evita corte).
  const desenharCards = (cards: Card[]) => {
    const n = Math.min(4, cards.length); if (!n) return
    const gap = 10, h = 58
    const w = (pageW - 2 * mx - gap * (n - 1)) / n
    const innerW = w - 20
    ensure(h + 12)
    for (let k = 0; k < n; k++) {
      const x = mx + k * (w + gap), filled = k === 0
      if (filled) { doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]); doc.roundedRect(x, y, w, h, 7, 7, 'F') }
      else { doc.setDrawColor(205, 213, 235); doc.setLineWidth(1); doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, w, h, 7, 7, 'FD') }
      // rótulo (uma linha, elipse se estourar)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.setTextColor(filled ? 220 : 120, filled ? 228 : 128, filled ? 245 : 150)
      let rot = cards[k].rotulo.toUpperCase()
      while (rot.length > 4 && doc.getTextWidth(rot) > innerW) rot = rot.slice(0, -2)
      if (rot !== cards[k].rotulo.toUpperCase()) rot = rot.replace(/\s*\S*$/, '') + '…'
      doc.text(rot, x + 12, y + 17)
      // valor: reduz a fonte até caber; se ainda não couber, 2 linhas
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(filled ? 255 : AZUL[0], filled ? 255 : AZUL[1], filled ? 255 : AZUL[2])
      let fs = 13
      doc.setFontSize(fs)
      while (fs > 8 && doc.getTextWidth(cards[k].valor) > innerW) { fs -= 0.5; doc.setFontSize(fs) }
      const vlin = doc.splitTextToSize(cards[k].valor, innerW).slice(0, 2)
      let vy = y + (vlin.length > 1 ? 34 : 40)
      for (const vl of vlin) { doc.text(vl, x + 12, vy); vy += fs * 1.15 }
    }
    y += h + 14
  }

  for (const b of parseBlocos(md)) {
    if (b.tipo === 'gap') { y += 5 }
    else if (b.tipo === 'h1') addTexto(b.texto, 17, 'bold', [31, 42, 68], 4)      // título principal
    else if (b.tipo === 'h2') addTexto(b.texto, 13, 'bold', AZUL, 4)
    else if (b.tipo === 'h3') addTexto(b.texto, 11.5, 'bold', [58, 66, 86], 3)
    else if (b.tipo === 'li') addTexto('•  ' + b.texto, 10.5, 'normal', [40, 42, 60], 2)
    else if (b.tipo === 'p') addTexto(b.texto, 10, 'normal', [90, 100, 120], 6)   // subtítulo/descrição
    else if (b.tipo === 'cards') desenharCards(b.cards)
    else if (b.tipo === 'table' && b.linhas.length) {
      const [head, ...body] = b.linhas
      ensure(50)
      autoTable(doc, {
        head: [head], body, startY: y, margin: { left: mx, right: mx },
        styles: { fontSize: 9, cellPadding: 6, textColor: [55, 65, 95], lineColor: [225, 231, 243], lineWidth: 0.5 },
        headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5, halign: 'left' },
        alternateRowStyles: { fillColor: AZUL_ALT },
        columnStyles: { 0: { fontStyle: 'bold', textColor: [31, 42, 68] } },
        theme: 'grid',
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16
    }
  }

  // Rodapé + paginação em todas as páginas
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(230, 234, 244); doc.setLineWidth(0.5); doc.line(mx, pageH - 34, pageW - mx, pageH - 34)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 156, 172)
    doc.text('Prefeitura Municipal de Arujá · Documento gerado a partir de dados oficiais.', mx, pageH - 20)
    doc.text(`${p}/${total}`, pageW - mx, pageH - 20, { align: 'right' })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`Relatorio-Aruja-${stamp}.pdf`)
}

// Gera o relatório em Excel (.xlsx) estilizado e BAIXA direto.
async function baixarRelatorioExcel(markdown: string) {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Prefeitura de Arujá'
  const ws = wb.addWorksheet('Relatório', { views: [{ showGridLines: false }] })
  const AZUL = 'FF283E93', AZUL_CLARO = 'FFF4F7FC', CINZA = 'FF5A6478', ESCURO = 'FF1F2A44'
  const dataStr = new Date().toLocaleDateString('pt-BR')

  // remove narração antes do 1º título
  const linhasMd = markdown.split('\n')
  const ini = linhasMd.findIndex(l => l.startsWith('# '))
  const md = ini >= 0 ? linhasMd.slice(ini).join('\n') : markdown

  const larg: number[] = []
  const anota = (ci: number, len: number) => { larg[ci] = Math.min(52, Math.max(larg[ci] ?? 10, len + 2)) }
  const borda = () => ({
    top: { style: 'thin' as const, color: { argb: 'FFE1E7F3' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE1E7F3' } },
    left: { style: 'thin' as const, color: { argb: 'FFE1E7F3' } },
    right: { style: 'thin' as const, color: { argb: 'FFE1E7F3' } },
  })
  const ehNumero = (v: string) => /^[R$\s]*-?[\d.][\d.,\s]*%?$/.test(v.trim()) && /\d/.test(v)

  // Cabeçalho institucional
  ws.addRow(['Prefeitura Municipal de Arujá']).getCell(1).font = { bold: true, size: 14, color: { argb: AZUL } }
  ws.addRow([`Relatório · Emitido em ${dataStr} · Secretaria da Fazenda`]).getCell(1).font = { size: 9, color: { argb: CINZA } }
  ws.addRow([])

  for (const b of parseBlocos(md)) {
    if (b.tipo === 'gap') continue
    if (b.tipo === 'h1') {
      ws.addRow([b.texto]).getCell(1).font = { bold: true, size: 13, color: { argb: AZUL } }
      ws.addRow([]); anota(0, b.texto.length)
    } else if (b.tipo === 'h2' || b.tipo === 'h3') {
      ws.addRow([b.texto]).getCell(1).font = { bold: true, size: 11, color: { argb: AZUL } }; anota(0, b.texto.length)
    } else if (b.tipo === 'p') {
      ws.addRow([b.texto]).getCell(1).font = { size: 10, color: { argb: CINZA } }; anota(0, Math.min(60, b.texto.length))
    } else if (b.tipo === 'li') {
      ws.addRow(['• ' + b.texto]).getCell(1).font = { size: 10, color: { argb: ESCURO } }; anota(0, b.texto.length + 2)
    } else if (b.tipo === 'cards') {
      ws.addRow(['Destaques']).getCell(1).font = { bold: true, size: 11, color: { argb: AZUL } }
      for (const c of b.cards) {
        const rr = ws.addRow([c.rotulo, c.valor])
        rr.getCell(1).font = { bold: true, color: { argb: ESCURO }, size: 10 }
        rr.getCell(2).font = { bold: true, color: { argb: AZUL }, size: 10 }
        anota(0, c.rotulo.length); anota(1, c.valor.length)
      }
      ws.addRow([])
    } else if (b.tipo === 'table' && b.linhas.length) {
      const [head, ...body] = b.linhas
      const hr = ws.addRow(head)
      hr.eachCell((cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
        cell.alignment = { vertical: 'middle' }
        cell.border = borda()
        anota(ci - 1, String(head[ci - 1] ?? '').length)
      })
      body.forEach((arr, ri) => {
        const dr = ws.addRow(arr)
        dr.eachCell((cell, ci) => {
          if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } }
          cell.border = borda()
          cell.font = { size: 10, color: { argb: ci === 1 ? ESCURO : 'FF37415F' }, bold: ci === 1 }
          const val = String(arr[ci - 1] ?? '')
          if (ci !== 1 && ehNumero(val)) cell.alignment = { horizontal: 'right' }
          anota(ci - 1, val.length)
        })
      })
      ws.addRow([])
    }
  }
  larg.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `Relatorio-Aruja-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

function ToolIndicator({ tool }: { tool: ToolEvent }) {
  const [showSql, setShowSql] = useState(false)

  if (tool.done && tool.error) {
    return (
      <div className="kc-tool err">
        <div className="kc-tool-row">
          <span>✗ Query falhou:</span>
          <span style={{ opacity: .8 }}>{tool.error}</span>
          {tool.sql && (
            <button className="kc-sql-toggle" onClick={() => setShowSql(v => !v)}>
              {showSql ? 'Ocultar query' : 'Ver query'}
            </button>
          )}
        </div>
        {showSql && tool.sql && <pre className="kc-sql-pre">{tool.sql}</pre>}
      </div>
    )
  }

  if (tool.done) {
    return (
      <div className="kc-tool ok">
        <div className="kc-tool-row">
          <span>✓</span>
          <span>{tool.rows} linha{tool.rows !== 1 ? 's' : ''} retornada{tool.rows !== 1 ? 's' : ''}</span>
          {tool.sql && (
            <button className="kc-sql-toggle" onClick={() => setShowSql(v => !v)}>
              {showSql ? 'Ocultar query' : 'Ver query'}
            </button>
          )}
        </div>
        {showSql && tool.sql && <pre className="kc-sql-pre">{tool.sql}</pre>}
      </div>
    )
  }

  return (
    <div className="kc-tool running">
      <div className="kc-tool-row">
        <svg className="kc-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Consultando Sybase IQ…</span>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [schemaLoaded, setSchemaLoaded] = useState(false)
  const [perfil, setPerfil] = useState<Perfil>('admin')
  useEffect(() => { setPerfil(lerPerfilCookie()) }, [])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolEvents, loading])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  async function send(text?: string, forceRefreshSchema = false) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    const userMsg: Message = { role: 'user', content: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setToolEvents([])

    let assistantContent = ''
    const currentTools: ToolEvent[] = []
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          forceRefreshSchema,
        }),
      })

      if (res.status === 401) { router.push('/login'); return }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          const event = JSON.parse(raw)

          if (event.type === 'text') {
            assistantContent += event.text
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
              return updated
            })
          } else if (event.type === 'tool_start') {
            const tool: ToolEvent = { name: event.name, sql: event.sql, done: false }
            currentTools.push(tool)
            setToolEvents([...currentTools])
            setSchemaLoaded(true)
          } else if (event.type === 'tool_end') {
            const last = currentTools[currentTools.length - 1]
            if (last) {
              last.done = true
              last.rows = event.rows
              last.error = event.error
            }
            setToolEvents([...currentTools])
          } else if (event.type === 'error') {
            assistantContent += '\n' + event.text
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
              return updated
            })
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Erro de conexão. Tente novamente.' }
        return updated
      })
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const thinkingLabel = toolEvents.some(t => !t.done)
    ? 'Consultando o banco de dados…'
    : toolEvents.length > 0
    ? 'Elaborando resposta…'
    : 'Analisando sua pergunta…'

  return (
    <div className="kc-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="kc-wrap">

        {/* ── TOP NAV ── */}
        <div className="kc-nav">
          <img src="/logo-aruja.png" alt="Prefeitura Municipal de Arujá" className="kc-nav-logo" />

          <div className="kc-tabs">
            {[
              { id: 'orcamento', href: '/dashboard', label: 'Orçamento' },
              { id: 'contribuinte', href: '/contribuinte', label: 'Contribuintes' },
              { id: 'imobiliario', href: '/imobiliario', label: 'Imobiliário' },
              { id: 'mobiliario', href: '/mobiliario', label: 'Mobiliário' },
              { id: 'outros', href: '/outros-tributos', label: 'Outros Tributos' },
              { id: 'divida', href: '/divida-ativa', label: 'Dívida Ativa' },
              { id: 'cobranca', href: '/cobranca', label: 'Cobrança' },
              { id: 'reforma', href: '/reforma-tributaria', label: 'Reforma Tributária' },
            ].filter(t => abaVisivel(perfil, t.id)).map(t => (
              <Link key={t.id} href={t.href} className="kc-tab">{t.label}</Link>
            ))}
            <span className="kc-tab active">Chat</span>
          </div>

          <div className="kc-icons">
            <button className="kc-icon-btn" title="Recarregar schema" onClick={() => send(undefined, true)} disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <Link href="/catalogo" className="kc-icon-btn" title="Catálogo de dados">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <button className="kc-avatar-btn" title="Sair" onClick={handleLogout}>
              <svg viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" fill="#cdd9ee"/><circle cx="20" cy="15" r="8" fill="#9fb2d4"/><path d="M5 40 a15 13 0 0 1 30 0" fill="#9fb2d4"/></svg>
            </button>
          </div>
        </div>

        {/* ── GREETING ── */}
        <div className="kc-greet">
          <h1>Assistente <span>IA</span></h1>
          <div className="kc-greet-right">
            {schemaLoaded && (
              <div className="kc-cache-dot">
                <span style={{ width: 7, height: 7, borderRadius: '999px', background: 'var(--green)', display: 'inline-block' }} />
                Schema em cache
              </div>
            )}
            <button
              className="kc-schema-btn"
              onClick={() => send(undefined, true)}
              disabled={loading}
              title="Recarregar schema do banco"
            >
              ↺ Recarregar schema
            </button>
          </div>
        </div>

      {/* ── CHAT CARD ── */}
      <div className="kc-main">

        {/* Messages */}
        <div className="kc-messages">
          {messages.length === 0 ? (
            <div className="kc-empty">
              <div className="kc-empty-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>Olá! O que deseja <em>saber?</em></h2>
              <p>Faça perguntas sobre os dados municipais em português. Vou consultar o banco Sybase IQ e responder com dados reais.</p>
              <div className="kc-empty-grid">
                {SUGESTOES.map(s => (
                  <button key={s} className="kc-sugg-btn" style={{ textAlign: 'left' }} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1
                const isAssistant = msg.role === 'assistant'
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className={`kc-msg-row${msg.role === 'user' ? ' user' : ''}`}>
                      <div className={`kc-avatar ${isAssistant ? 'ai' : 'user'}`}>
                        {isAssistant ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div className={`kc-bubble ${isAssistant ? 'ai' : 'user'}`}>
                        {msg.role === 'user' ? (
                          <span>{msg.content}</span>
                        ) : msg.content ? (
                          <MarkdownText text={msg.content} />
                        ) : (
                          <div className="kc-thinking">
                            <svg className="kc-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {thinkingLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    {isLast && isAssistant && toolEvents.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '44px' }}>
                        {toolEvents.map((t, ti) => <ToolIndicator key={ti} tool={t} />)}
                      </div>
                    )}

                    {isAssistant && msg.content && i > 0 && messages[i - 1].role === 'user' && !(isLast && loading)
                      && (pedeRelatorioPdf(messages[i - 1].content) || pedeRelatorioExcel(messages[i - 1].content)) && (
                      <div style={{ marginLeft: '44px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {pedeRelatorioPdf(messages[i - 1].content) && (
                          <button className="kc-pdf-btn" onClick={() => { baixarRelatorioPdf(msg.content).catch(() => alert('Não foi possível gerar o PDF. Tente novamente.')) }} title="Baixar este relatório em PDF">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15l3 3 3-3" />
                            </svg>
                            Baixar PDF
                          </button>
                        )}
                        {pedeRelatorioExcel(messages[i - 1].content) && (
                          <button className="kc-pdf-btn" onClick={() => { baixarRelatorioExcel(msg.content).catch(() => alert('Não foi possível gerar o Excel. Tente novamente.')) }} title="Baixar este relatório em Excel">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" />
                            </svg>
                            Baixar Excel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '44px' }}>
                  <div className="kc-thinking">
                    <svg className="kc-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {thinkingLabel}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="kc-input-bar">
          <div className="kc-input-row">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
              placeholder="Pergunte sobre os dados municipais… (Enter para enviar)"
              className="kc-textarea"
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 140) + 'px'
              }}
            />
            <button
              className="kc-send-btn"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              aria-label="Enviar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      {/* /kc-main */}

      </div>
      {/* /kc-wrap */}
    </div>
  )
}
