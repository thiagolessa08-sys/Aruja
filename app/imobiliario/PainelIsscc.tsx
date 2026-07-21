'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend } from 'recharts'
import LoadingOverlay from '../_components/LoadingOverlay'

async function fetchJson(url: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) { const d = await r.json(); if (d && !d.error) return d }
    } catch { /* rede — tenta de novo */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 1200 * (i + 1)))
  }
  return null
}

interface Cmp { atual: number; ant: number; pct: number }
interface Visao {
  dataAtualizacao: string | null
  anos: number[]
  anoRef: number
  cards: { lancado: Cmp; arrecadado: Cmp; inadimplencia: Cmp; emAberto: Cmp; isento: Cmp; suspenso: Cmp; quantidade: Cmp }
  evolucao: { ano: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; previsto: boolean; arrecPct: number; inadPct: number }[]
}

const fmtAbrev = (v: number) => {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => (p >= 0 ? '+' : '') + p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const fmtData = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'

const CORES: Record<string, [string, string]> = {
  lancado: ['#283e93', '#aab8e3'],
  arrecadado: ['#1fa463', '#a7e0c2'],
  emAberto: ['#e8962e', '#f4cf9e'],
  inadimplencia: ['#d64545', '#f0b0b0'],
}
const svg = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
)
function EixoTick({ x, y, payload }: any) {
  return <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fill="#8a93a6" fontWeight={600}>{payload.value}</text>
}
const MESES_R = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
interface Mes { mes: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }

// Insights do ISSCC — frases derivadas dos cards.
function insightsIsscc(v: Visao): string[] {
  const c = v.cards
  const p1 = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
  const pctLanc = (x: number) => c.lancado.atual ? (x / c.lancado.atual) * 100 : 0
  const arr: string[] = []
  arr.push(`Em ${v.anoRef}, o ISSCC lançado soma ${fmtAbrev(c.lancado.atual)}${c.quantidade.atual ? ` em ${fmtInt(c.quantidade.atual)} lançamentos` : ''} (${fmtPct(c.lancado.pct)} vs ${v.anoRef - 1}).`)
  arr.push(`Arrecadado ${fmtAbrev(c.arrecadado.atual)} — ${p1(pctLanc(c.arrecadado.atual))} do lançado (${fmtPct(c.arrecadado.pct)} vs ${v.anoRef - 1}).`)
  arr.push(`Inadimplência ${fmtAbrev(c.inadimplencia.atual)} (${p1(pctLanc(c.inadimplencia.atual))} do lançado); em aberto ${fmtAbrev(c.emAberto.atual)}.`)
  if (c.isento.atual || c.suspenso.atual) arr.push(`Isento ${fmtAbrev(c.isento.atual)} e suspenso ${fmtAbrev(c.suspenso.atual)} no exercício.`)
  return arr
}

export default function PainelIsscc({ ano }: { ano: number | '' }) {
  const [v, setV] = useState<Visao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [recarregar, setRecarregar] = useState(0)
  const [drillAno, setDrillAno] = useState<number | null>(null)
  const [serieMes, setSerieMes] = useState<Mes[] | null>(null)
  const [carregMes, setCarregMes] = useState(false)
  // Item 2 — histórico de área edificada × quantidade de ISSCC
  const [areaHist, setAreaHist] = useState<{ ano: number; imoveisAlterados: number; areaEdificada: number; qtdIsscc: number; valorIsscc: number }[] | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(false)
    const p = new URLSearchParams()
    if (ano) p.set('ano', String(ano))
    fetchJson(`/api/isscc/visao?${p}`)
      .then(d => { if (!vivo) return; if (d) setV(d); else setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [ano, recarregar])

  // Drill por mês ao clicar num ano do gráfico
  useEffect(() => {
    if (!drillAno) { setSerieMes(null); return }
    let vivo = true; setCarregMes(true)
    fetchJson(`/api/isscc/mensal?ano=${drillAno}`)
      .then(d => { if (vivo) setSerieMes(d?.meses ?? null) })
      .finally(() => { if (vivo) setCarregMes(false) })
    return () => { vivo = false }
  }, [drillAno])
  useEffect(() => { setDrillAno(null) }, [ano])

  useEffect(() => {
    let vivo = true
    fetchJson('/api/isscc/area-historico').then(d => { if (vivo && d?.serie) setAreaHist(d.serie) })
    return () => { vivo = false }
  }, [])

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }

  const cardsDef = v ? [
    { label: 'Total Lançado', cmp: v.cards.lancado, cor: '#283e93', sub: `${fmtInt(v.cards.quantidade.atual)} lançamentos`, icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>) },
    { label: 'Total Arrecadado', cmp: v.cards.arrecadado, cor: '#1fa463', sub: '', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.2-1.1 1.9-2.5 1.9A2.6 2 0 0 1 9.4 15M12 6v1.5M12 16.5V18" /></>) },
    { label: 'Total em Aberto', cmp: v.cards.emAberto, cor: '#e8962e', sub: 'a receber (total)', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
    { label: 'Total Inadimplência', cmp: v.cards.inadimplencia, cor: '#d64545', sub: 'vencido (atrasado)', icon: svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>) },
    { label: 'Total Isento', cmp: v.cards.isento, cor: '#8094d6', sub: 'isento', icon: svg(<><path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>) },
    { label: 'Total Suspenso', cmp: v.cards.suspenso, cor: '#5b6477', sub: '', icon: svg(<><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></>) },
  ] : []

  const serie = (v?.evolucao ?? []).map(e => ({ ...e, rot: e.previsto ? `${e.ano}*` : String(e.ano) }))
  const anoPrevisto = v?.evolucao.find(e => e.previsto)?.ano
  const insights = v ? insightsIsscc(v) : null
  const chartData = drillAno && serieMes
    ? serieMes.map(m => ({ rot: MESES_R[m.mes - 1], ano: 0, previsto: false, arrecPct: 0, inadPct: 0, lancado: m.lancado, arrecadado: m.arrecadado, emAberto: m.emAberto, inadimplencia: m.inadimplencia }))
    : serie

  if (erro && !v) {
    return (
      <div style={{ ...card, marginTop: 20, textAlign: 'center', padding: 40, color: '#9098a8', fontSize: 13 }}>
        Não foi possível carregar os dados de ISSCC (instabilidade do agente/banco).{' '}
        <button onClick={() => setRecarregar(n => n + 1)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '6px 14px', fontSize: 12, marginLeft: 6 }}>Recarregar</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {carregando && !v ? <div style={{ ...card, marginTop: 20, textAlign: 'center', padding: 40, color: '#9098a8', fontSize: 13 }}>Carregando ISSCC…</div> : null}

      {v ? (
        <>
          {/* Data de atualização */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <span style={{ fontSize: 11, color: '#9098a8' }}>Dados atualizados em <span style={{ color: '#5b6477', fontWeight: 600 }}>{fmtData(v.dataAtualizacao)}</span></span>
          </div>

          {/* 6 KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginTop: 8, position: 'relative' }}>
            {carregando ? <LoadingOverlay label="Atualizando…" /> : null}
            {cardsDef.map(c => (
              <div key={c.label} style={card}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5b6477', display: 'block' }}>{c.label}</span>
                <span style={{ fontSize: 9.5, color: '#aeb6c6', display: 'block', height: 12 }}>{c.sub || ' '}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `${c.cor}1a`, color: c.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{c.icon}</div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: c.cor, letterSpacing: '-.5px' }}>{fmtAbrev(c.cmp.atual)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
                  <span style={{ fontSize: 10.5, color: '#9098a8' }}>{v.anoRef - 1} <span style={{ color: '#5b6477', fontWeight: 600 }}>{fmtAbrev(c.cmp.ant)}</span></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.cmp.pct >= 0 ? '#1fa463' : '#d64545', flex: 'none' }}>{fmtPct(c.cmp.pct)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Evolução + Insights */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 18, marginTop: 18, alignItems: 'stretch' }}>
            <div style={{ ...card, minWidth: 0, position: 'relative' }}>
              {carregMes ? <LoadingOverlay label="Carregando meses…" /> : null}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>{drillAno ? `Evolução mensal · ${drillAno}` : 'Evolução do ISSCC (5 anos)'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#5b6477' }}>
                    {[{ label: 'Lançado', cor: '#283e93' }, { label: 'Arrecadado', cor: '#1fa463' }, { label: 'Em aberto', cor: '#e8962e' }, { label: 'Inadimplência', cor: '#d64545' }].map(m => (
                      <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: m.cor }} />{m.label}</span>
                    ))}
                  </div>
                  {drillAno ? <button onClick={() => setDrillAno(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11 }}>‹ Voltar</button> : null}
                </div>
              </div>
              <div style={{ marginTop: 16, height: 300, cursor: !drillAno ? 'pointer' : 'default' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%"
                    onClick={(e) => {
                      const st = e as unknown as { activePayload?: { payload?: { ano?: number; previsto?: boolean } }[] }
                      const pl = st?.activePayload?.[0]?.payload
                      if (!drillAno && pl?.ano && !pl.previsto) setDrillAno(pl.ano)
                    }}>
                    <XAxis dataKey="rot" interval={0} height={24} tick={<EixoTick />} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                    <YAxis width={44} tickFormatter={(val: number) => (val / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
                      formatter={(val, name) => ['R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name] as [string, string]}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                    {(['lancado', 'arrecadado', 'emAberto', 'inadimplencia'] as const).map(dk => (
                      <Bar key={dk} dataKey={dk} name={{ lancado: 'Lançado', arrecadado: 'Arrecadado', emAberto: 'Em aberto', inadimplencia: 'Inadimplência' }[dk]} radius={[3, 3, 0, 0]} maxBarSize={drillAno ? 16 : 22} stroke="none">
                        {chartData.map((s, i) => <Cell key={i} fill={CORES[dk][s.previsto ? 1 : 0]} stroke="none" />)}
                        <LabelList dataKey={dk} position="top" formatter={(val) => (Number(val) ? fmtAbrev(Number(val)) : '')} fontSize={8.5} fill="#8a93a6" />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 4 }}>{drillAno ? `Meses de ${drillAno} · lançado/em aberto por mês de vencimento, arrecadado por mês de baixa` : `Clique num ano para detalhar por mês · barras claras = previsão ${anoPrevisto ?? ''} (regressão linear dos últimos 5 anos)`}</div>
            </div>

            {/* Insights */}
            <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
                </div>
                <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>ISSCC</span>
              </div>
              <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de ISSCC</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(insights ?? []).map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', background: '#fff', flex: 'none' }} />
                    <span style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.9)' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela de exercícios */}
          <div style={{ ...card, marginTop: 18, overflowX: 'auto' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Exercícios de ISSCC</span>
            <div style={{ marginTop: 14, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    {['Exercício', 'Lançado', 'Arrecadado', '% Arrec.', 'Em aberto', 'Inadimplência'].map((h, i) => (
                      <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '11px 14px', textAlign: i === 0 ? 'left' : 'right', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.evolucao.map((e, ri) => {
                    const bg = ri % 2 === 0 ? '#fff' : '#f7f9fd'
                    return (
                      <tr key={e.ano}>
                        <td style={{ background: e.previsto ? '#eef1fb' : '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 14px', borderBottom: '1px solid #eef1f7' }}>{e.ano}{e.previsto ? ' *' : ''}</td>
                        <td style={{ background: bg, color: '#283e93', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtAbrev(e.lancado)}</td>
                        <td style={{ background: bg, color: '#1fa463', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtAbrev(e.arrecadado)}</td>
                        <td style={{ background: bg, color: '#5b6477', fontSize: 12, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{e.arrecPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                        <td style={{ background: bg, color: '#e8962e', fontSize: 12, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtAbrev(e.emAberto)}</td>
                        <td style={{ background: bg, color: '#d64545', fontSize: 12, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtAbrev(e.inadimplencia)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 8 }}>* exercício previsto (regressão linear). Valores por exercício de lançamento da guia (cd_tributo 40/17/18).</div>
          </div>

          {/* ===== Item 2 — Área edificada × quantidade de ISSCC ===== */}
          <div style={{ ...card, marginTop: 18, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Alterações de Área Edificada × ISSCC</span>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#5b6477' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#5870c4' }} />Área edificada (m²)</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: '#e8962e' }} />Qtd. ISSCC</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Imóveis com alteração estrutural no ano vs quantidade de ISSCC lançados — mede se a atividade de construção acompanha o tributo.</div>
            {areaHist ? (
              <>
                <div style={{ marginTop: 16, height: 300, minWidth: 560 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={areaHist} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
                      <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#8a93a6', fontWeight: 600 }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                      <YAxis yAxisId="area" width={48} tickFormatter={(val: number) => (val / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="qtd" orientation="right" width={40} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(val, name) => {
                          const n = Number(val) || 0
                          if (name === 'Área edificada (m²)') return [n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' m²', name] as [string, string]
                          return [n.toLocaleString('pt-BR'), name] as [string, string]
                        }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                      <Bar yAxisId="area" dataKey="areaEdificada" name="Área edificada (m²)" fill="#5870c4" radius={[3, 3, 0, 0]} maxBarSize={34}>
                        <LabelList dataKey="imoveisAlterados" position="top" formatter={(val) => (Number(val) ? `${Number(val)} im.` : '')} fontSize={8.5} fill="#8a93a6" />
                      </Bar>
                      <Line yAxisId="qtd" type="monotone" dataKey="qtdIsscc" name="Qtd. ISSCC" stroke="#e8962e" strokeWidth={2.5} dot={{ r: 3, fill: '#e8962e' }} />
                      <Legend wrapperStyle={{ display: 'none' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 8, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        {['Ano', 'Imóveis alterados', 'Área edificada (m²)', 'Qtd. ISSCC', 'ISSCC lançado'].map((h, i) => (
                          <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 600, padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...areaHist].reverse().map((r, ri) => {
                        const bg = ri % 2 === 0 ? '#fff' : '#f7f9fd'
                        return (
                          <tr key={r.ano}>
                            <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 14px', borderBottom: '1px solid #eef1f7' }}>{r.ano}</td>
                            <td style={{ background: bg, color: '#1f2a44', fontSize: 12, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtInt(r.imoveisAlterados)}</td>
                            <td style={{ background: bg, color: '#5870c4', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtInt(r.areaEdificada)}</td>
                            <td style={{ background: bg, color: '#e8962e', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtInt(r.qtdIsscc)}</td>
                            <td style={{ background: bg, color: '#283e93', fontSize: 12, fontWeight: 600, padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtAbrev(r.valorIsscc)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 8 }}>Fonte das alterações: tb_dsod_imovel_urbano_alt_estrutura (por ano de alteração). Rótulo nas barras = nº de imóveis alterados. Área = soma da área edificada atual dos imóveis alterados no ano.</div>
              </>
            ) : <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: 24 }}>Carregando histórico de área…</div>}
          </div>
        </>
      ) : null}
    </div>
  )
}
