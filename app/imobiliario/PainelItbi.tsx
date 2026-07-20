'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import LoadingOverlay from '../_components/LoadingOverlay'

export interface FiltrosItbiUI { ano: number | ''; natureza: string }

// Busca com retry (o túnel do agente às vezes devolve 502/HTML; sem isso a tela fica em branco).
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
  cards: {
    lancado: Cmp; arrecadado: Cmp; inadimplencia: Cmp; emAberto: Cmp; isento: Cmp; suspenso: Cmp; transmissoes: Cmp
  }
  evolucao: { ano: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; previsto: boolean; arrecPct: number; inadPct: number }[]
}
interface RankingImovel {
  itens: { cd: number; qt: number; venal: number; inscricao: string; endereco: string }[]
  faixas: { um: number; dois: number; tresCinco: number; seisMais: number }
}
interface MatchImovel { cd: number; inscricao: string; numero: string; endereco: string; proprietario: string }
interface Transmissao { cdItbi: number; data: string; natureza: string; valorVenal: number; aliquota: number; situacao: string; transmitente: string; adquirente: string; imposto: number }
interface DetalheImovel {
  cd: number; inscricao: string; numero: string; endereco: string; cep: string; proprietario: string; cpfCnpj: string
  indicadores: { qtTransmissoes: number; valorizacao: number; intervaloMedioAnos: number; impostoTotal: number; venalUltimo: number; venalPrimeiro: number }
  transmissoes: Transmissao[]
}

const fmtAbrev = (v: number) => {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => (p >= 0 ? '+' : '') + p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const fmtData = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'

// cores das barras da evolução: [real, previsto]
const CORES: Record<string, [string, string]> = {
  lancado: ['#283e93', '#aab8e3'],
  arrecadado: ['#1fa463', '#a7e0c2'],
  emAberto: ['#e8962e', '#f4cf9e'],
  inadimplencia: ['#d64545', '#f0b0b0'],
}

const svg = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
)

// Insights de ITBI — frases derivadas dos cards já carregados.
function insightsItbi(v: Visao): string[] {
  const c = v.cards
  const p1 = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
  const pctLanc = (x: number) => c.lancado.atual ? (x / c.lancado.atual) * 100 : 0
  const arr: string[] = []
  arr.push(`Em ${v.anoRef}, o ITBI lançado soma ${fmtAbrev(c.lancado.atual)} em ${fmtInt(c.transmissoes.atual)} transmissões (${fmtPct(c.lancado.pct)} vs ${v.anoRef - 1}).`)
  arr.push(`Arrecadado ${fmtAbrev(c.arrecadado.atual)} — ${p1(pctLanc(c.arrecadado.atual))} do lançado (${fmtPct(c.arrecadado.pct)} vs ${v.anoRef - 1}).`)
  arr.push(`Inadimplência ${fmtAbrev(c.inadimplencia.atual)} (${p1(pctLanc(c.inadimplencia.atual))} do lançado); em aberto ${fmtAbrev(c.emAberto.atual)}.`)
  return arr
}

function EixoTick({ x, y, payload }: any) {
  return (
    <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fill="#8a93a6" fontWeight={600}>{payload.value}</text>
  )
}

export default function PainelItbi({ filtros }: { filtros: FiltrosItbiUI }) {
  const [v, setV] = useState<Visao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [recarregar, setRecarregar] = useState(0)

  // Item 6 — ranking de imóveis por nº de transmissões
  const [ranking, setRanking] = useState<RankingImovel | null>(null)
  // Itens 2/3 — busca e detalhe de imóvel (histórico de transmissões / valor venal)
  const [busca, setBusca] = useState('')
  const [matches, setMatches] = useState<MatchImovel[]>([])
  const [buscando, setBuscando] = useState(false)
  const [imovel, setImovel] = useState<DetalheImovel | null>(null)
  const [carregImovel, setCarregImovel] = useState(false)

  const ano = filtros.ano

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(false)
    const p = new URLSearchParams()
    if (ano) p.set('ano', String(ano))
    fetchJson(`/api/itbi/visao?${p}`)
      .then(d => { if (!vivo) return; if (d) setV(d); else setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [ano, recarregar])

  // Ranking de imóveis (item 6) — carrega uma vez
  useEffect(() => {
    let vivo = true
    fetchJson('/api/itbi/ranking-imovel?top=20').then(d => { if (vivo && d) setRanking(d) })
    return () => { vivo = false }
  }, [])

  // Busca de imóvel (itens 2/3) — debounce simples
  useEffect(() => {
    const q = busca.trim()
    if (q.length < 2) { setMatches([]); return }
    let vivo = true
    setBuscando(true)
    const t = setTimeout(() => {
      fetchJson(`/api/itbi/imovel?q=${encodeURIComponent(q)}`)
        .then(d => { if (vivo) setMatches(d?.matches ?? []) })
        .finally(() => { if (vivo) setBuscando(false) })
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca])

  function abrirImovel(id: number) {
    setCarregImovel(true); setImovel(null)
    fetchJson(`/api/itbi/imovel?id=${id}`)
      .then(d => { if (d?.detalhe) setImovel(d.detalhe) })
      .finally(() => setCarregImovel(false))
  }

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }

  const cardsDef = v ? [
    { label: 'Total Lançado', cmp: v.cards.lancado, cor: '#283e93', sub: `${fmtInt(v.cards.transmissoes.atual)} transmissões`, icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>) },
    { label: 'Total Arrecadado', cmp: v.cards.arrecadado, cor: '#1fa463', sub: '', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.2-1.1 1.9-2.5 1.9A2.6 2 0 0 1 9.4 15M12 6v1.5M12 16.5V18" /></>) },
    { label: 'Total em Aberto', cmp: v.cards.emAberto, cor: '#e8962e', sub: 'a receber (total)', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
    { label: 'Total Inadimplência', cmp: v.cards.inadimplencia, cor: '#d64545', sub: 'vencido (atrasado)', icon: svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>) },
    { label: 'Total Isento', cmp: v.cards.isento, cor: '#8094d6', sub: 'não incidência', icon: svg(<><path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>) },
    { label: 'Total Suspenso', cmp: v.cards.suspenso, cor: '#5b6477', sub: '', icon: svg(<><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></>) },
  ] : []

  const serie = (v?.evolucao ?? []).map(e => ({ ...e, rot: e.previsto ? `${e.ano}*` : String(e.ano) }))
  const anoPrevisto = v?.evolucao.find(e => e.previsto)?.ano
  const insights = v ? insightsItbi(v) : null

  if (erro && !v) {
    return (
      <div style={{ ...card, marginTop: 20, textAlign: 'center', padding: 40, color: '#9098a8', fontSize: 13 }}>
        Não foi possível carregar os dados de ITBI (instabilidade do agente/banco).{' '}
        <button onClick={() => setRecarregar(n => n + 1)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '6px 14px', fontSize: 12, marginLeft: 6 }}>Recarregar</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {carregando && !v ? <div style={{ ...card, marginTop: 20, textAlign: 'center', padding: 40, color: '#9098a8', fontSize: 13 }}>Carregando ITBI…</div> : null}

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
            <div style={{ ...card, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Evolução do ITBI (5 anos)</span>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#5b6477' }}>
                  {[{ label: 'Lançado', cor: '#283e93' }, { label: 'Arrecadado', cor: '#1fa463' }, { label: 'Em aberto', cor: '#e8962e' }, { label: 'Inadimplência', cor: '#d64545' }].map(m => (
                    <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: m.cor }} />{m.label}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 16, height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <XAxis dataKey="rot" interval={0} height={24} tick={<EixoTick />} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                    <YAxis width={44} tickFormatter={(val: number) => (val / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
                      formatter={(val, name) => ['R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name] as [string, string]}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                    {(['lancado', 'arrecadado', 'emAberto', 'inadimplencia'] as const).map(dk => (
                      <Bar key={dk} dataKey={dk} name={{ lancado: 'Lançado', arrecadado: 'Arrecadado', emAberto: 'Em aberto', inadimplencia: 'Inadimplência' }[dk]} radius={[3, 3, 0, 0]} maxBarSize={22} stroke="none">
                        {serie.map((s, i) => <Cell key={i} fill={CORES[dk][s.previsto ? 1 : 0]} stroke="none" />)}
                        <LabelList dataKey={dk} position="top" formatter={(val) => (Number(val) ? fmtAbrev(Number(val)) : '')} fontSize={8.5} fill="#8a93a6" />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 4 }}>Barras claras = previsão {anoPrevisto ?? ''} (regressão linear dos últimos 5 anos)</div>
            </div>

            {/* Insights */}
            <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
                </div>
                <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>ITBI</span>
              </div>
              <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de ITBI</div>
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
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Exercícios de ITBI</span>
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
                  {(v.evolucao).map((e, ri) => {
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
            <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 8 }}>* exercício previsto (regressão linear). Valores por exercício de lançamento da guia (cd_tributo 10).</div>
          </div>

          {/* ===== Onda 2: Imóveis mais transmitidos (item 6) + Consulta de imóvel (itens 2/3) ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>

            {/* Item 6 — Ranking de imóveis por nº de transmissões */}
            <div style={card}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Imóveis mais transmitidos</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Quantidade de ITBI por imóvel · clique para ver o histórico</div>
              {ranking ? (() => {
                const fx = ranking.faixas
                const totFx = Math.max(1, fx.um + fx.dois + fx.tresCinco + fx.seisMais)
                const distr = [
                  { l: '1 transmissão', n: fx.um, c: '#aab8e3' },
                  { l: '2 transmissões', n: fx.dois, c: '#7d8fce' },
                  { l: '3 a 5', n: fx.tresCinco, c: '#3f5bb5' },
                  { l: '6 ou mais', n: fx.seisMais, c: '#283e93' },
                ]
                const mx = Math.max(1, ...ranking.itens.map(i => i.qt))
                return (
                  <>
                    {/* Distribuição */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {distr.map(d => (
                        <div key={d.l} style={{ flex: '1 1 0', minWidth: 90, background: '#f7f9fd', borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: d.c }}>{fmtInt(d.n)}</div>
                          <div style={{ fontSize: 10, color: '#5b6477' }}>{d.l}</div>
                          <div style={{ fontSize: 9.5, color: '#aeb6c6' }}>{(100 * d.n / totFx).toFixed(1).replace('.', ',')}%</div>
                        </div>
                      ))}
                    </div>
                    {/* Top imóveis */}
                    <div style={{ marginTop: 14, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                      {ranking.itens.map((it, i) => (
                        <div key={it.cd} onClick={() => abrirImovel(it.cd)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {i + 1}. {it.inscricao || `Imóvel ${it.cd}`} <span style={{ color: '#9098a8', fontWeight: 500 }}>{it.endereco ? `· ${it.endereco}` : ''}</span>
                            </span>
                            <span style={{ color: '#283e93', fontWeight: 700, flex: 'none' }}>{fmtInt(it.qt)}×</span>
                          </div>
                          <div style={{ height: 12, borderRadius: 6, background: '#eef1f7', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(3, 100 * it.qt / mx).toFixed(1)}%`, borderRadius: 6, background: '#3f5bb5' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })() : <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: 24 }}>Carregando ranking…</div>}
            </div>

            {/* Itens 2/3 — Consulta de imóvel: histórico de lançamentos e valor venal */}
            <div style={card}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Consultar Imóvel</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Histórico de transmissões, valor venal e imposto do imóvel</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f4f7fc', borderRadius: 12, padding: '8px 12px', marginTop: 12 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Inscrição, código ou nome do proprietário…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
              </div>
              {/* Resultados da busca */}
              {busca.trim().length >= 2 && !imovel ? (
                <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {buscando ? <div style={{ fontSize: 12, color: '#9098a8', padding: 10 }}>Buscando…</div>
                    : matches.length ? matches.map(m => (
                      <div key={m.cd} onClick={() => abrirImovel(m.cd)} style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 10, background: '#f7f9fd' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>{m.inscricao || `Imóvel ${m.cd}`}</div>
                        <div style={{ fontSize: 11, color: '#5b6477' }}>{m.endereco}{m.proprietario ? ` · ${m.proprietario}` : ''}</div>
                      </div>
                    )) : <div style={{ fontSize: 12, color: '#9098a8', padding: 10 }}>Nenhum imóvel encontrado.</div>}
                </div>
              ) : null}

              {/* Detalhe do imóvel */}
              {carregImovel ? <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: 24 }}>Carregando imóvel…</div> : null}
              {imovel ? (() => {
                const ind = imovel.indicadores
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2a44' }}>{imovel.inscricao || `Imóvel ${imovel.cd}`}</div>
                        <div style={{ fontSize: 11, color: '#5b6477' }}>{imovel.endereco}</div>
                        {imovel.proprietario ? <div style={{ fontSize: 11, color: '#9098a8' }}>Proprietário: {imovel.proprietario}</div> : null}
                      </div>
                      <button onClick={() => { setImovel(null); setBusca('') }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, flex: 'none' }}>Fechar</button>
                    </div>
                    {/* Indicadores (itens 2/3) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
                      {[
                        { l: 'Transmissões', v: fmtInt(ind.qtTransmissoes), c: '#283e93' },
                        { l: 'Valorização venal', v: (ind.valorizacao >= 0 ? '+' : '') + ind.valorizacao.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%', c: ind.valorizacao >= 0 ? '#1fa463' : '#d64545' },
                        { l: 'Intervalo médio', v: ind.intervaloMedioAnos ? ind.intervaloMedioAnos.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' a' : '—', c: '#5b6477' },
                        { l: 'Imposto total', v: fmtAbrev(ind.impostoTotal), c: '#c0612a' },
                      ].map(k => (
                        <div key={k.l} style={{ background: '#f7f9fd', borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: k.c, letterSpacing: '-.3px' }}>{k.v}</div>
                          <div style={{ fontSize: 9.5, color: '#5b6477', marginTop: 2 }}>{k.l}</div>
                        </div>
                      ))}
                    </div>
                    {/* Histórico de transmissões */}
                    <div style={{ marginTop: 12, border: '1px solid #e3e8f1', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {['Data', 'Natureza', 'Valor Venal', 'Imposto'].map((h, i) => (
                                <th key={h} style={{ position: 'sticky', top: 0, background: '#283e93', color: '#fff', fontSize: 10.5, fontWeight: 600, padding: '8px 10px', textAlign: i === 0 || i === 1 ? 'left' : 'right' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {imovel.transmissoes.map((t, ti) => (
                              <tr key={t.cdItbi}>
                                <td style={{ background: ti % 2 ? '#f7f9fd' : '#fff', fontSize: 11, color: '#1f2a44', padding: '7px 10px', borderBottom: '1px solid #eef1f7', whiteSpace: 'nowrap' }}>{t.data ? t.data.split('-').reverse().join('/') : '—'}</td>
                                <td style={{ background: ti % 2 ? '#f7f9fd' : '#fff', fontSize: 10.5, color: '#5b6477', padding: '7px 10px', borderBottom: '1px solid #eef1f7' }}>{t.natureza || '—'}</td>
                                <td style={{ background: ti % 2 ? '#f7f9fd' : '#fff', fontSize: 11, color: '#283e93', fontWeight: 600, padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{t.valorVenal ? fmtAbrev(t.valorVenal) : '—'}</td>
                                <td style={{ background: ti % 2 ? '#f7f9fd' : '#fff', fontSize: 11, color: '#c0612a', fontWeight: 600, padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{t.imposto ? fmtAbrev(t.imposto) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 6 }}>Valorização = valor venal da transmissão mais recente vs a mais antiga. Imposto = ITBI lançado por transmissão.</div>
                  </div>
                )
              })() : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
