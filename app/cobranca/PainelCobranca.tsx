'use client'

import { useState, useEffect } from 'react'
import LoadingOverlay, { Spinner } from '../_components/LoadingOverlay'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface Trib { nome: string; lancado: number; arrecadado: number; saldo: number; conversao: number }
interface TribInad { nome: string; codigos: number[]; saldo: number; lancado: number; conversao: number }
interface Devedor { cd: number; nome: string; cpfCnpj: string; saldo: number }
interface PotTrib { nome: string; codigos: number[]; vencido: number; aVencer: number }
interface Potencial { vencido: number; aVencer: number; porTributo: PotTrib[] }
interface Resumo {
  ano: number; lancado: number; arrecadado: number; saldo: number; conversao: number; totalBaixas: number
  tributos: Trib[]
  inadimplenciaPorTributo: TribInad[]
  canais: { nome: string; n: number }[]
  baixasPorAno: { ano: number; n: number }[]
}

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

const FALLBACK: Resumo = {
  ano: 2025, lancado: 304700000, arrecadado: 185500000, saldo: 80700000, conversao: 60.9, totalBaixas: 8381161,
  tributos: [
    { nome: 'IPTU', lancado: 124400000, arrecadado: 69500000, saldo: 47800000, conversao: 56 },
    { nome: 'ITBI', lancado: 46900000, arrecadado: 22800000, saldo: 7400000, conversao: 49 },
    { nome: 'I.S.S.Q.N. - Tomador', lancado: 32700000, arrecadado: 30900000, saldo: 1500000, conversao: 94 },
    { nome: 'I.S.S.Q.N.', lancado: 28600000, arrecadado: 23300000, saldo: 4000000, conversao: 82 },
    { nome: 'Taxa de Fiscalização de Estabelecimento', lancado: 17600000, arrecadado: 6200000, saldo: 7300000, conversao: 35 },
    { nome: 'ISS Construção Civil', lancado: 15300000, arrecadado: 9100000, saldo: 3000000, conversao: 59 },
    { nome: 'Taxa de Contribuição Ambiental', lancado: 14900000, arrecadado: 8100000, saldo: 5200000, conversao: 55 },
    { nome: 'ISS - Simples Nacional', lancado: 11700000, arrecadado: 12200000, saldo: 800000, conversao: 100 },
  ],
  inadimplenciaPorTributo: [
    { nome: 'IPTU', codigos: [1], saldo: 47800000, lancado: 124400000, conversao: 56 },
    { nome: 'Taxa de Fiscalização de Estabelecimento', codigos: [2002], saldo: 7300000, lancado: 17600000, conversao: 35 },
    { nome: 'ITBI', codigos: [10], saldo: 7400000, lancado: 46900000, conversao: 49 },
    { nome: 'Taxa de Contribuição Ambiental', codigos: [67], saldo: 5200000, lancado: 14900000, conversao: 55 },
    { nome: 'I.S.S.Q.N.', codigos: [3], saldo: 4000000, lancado: 28600000, conversao: 82 },
    { nome: 'ISS Construção Civil', codigos: [40], saldo: 3000000, lancado: 15300000, conversao: 59 },
    { nome: 'I.S.S.Q.N. - Tomador', codigos: [7], saldo: 1500000, lancado: 32700000, conversao: 94 },
    { nome: 'ISS - Simples Nacional', codigos: [572], saldo: 800000, lancado: 11700000, conversao: 100 },
  ],
  canais: [
    { nome: 'Febraban', n: 2908503 }, { nome: 'Parcelamento', n: 1805341 }, { nome: 'Conversao', n: 566431 },
    { nome: 'Processo', n: 229948 }, { nome: 'Internet', n: 146380 }, { nome: 'OS 43459', n: 107573 },
    { nome: 'ConversaoLight', n: 65688 }, { nome: 'Guia', n: 60864 },
  ],
  baixasPorAno: [
    { ano: 2018, n: 207087 }, { ano: 2019, n: 181455 }, { ano: 2020, n: 254016 }, { ano: 2021, n: 187949 },
    { ano: 2022, n: 215093 }, { ano: 2023, n: 428936 }, { ano: 2024, n: 249550 }, { ano: 2025, n: 294681 }, { ano: 2026, n: 185014 },
  ],
}

const FALLBACK_POTENCIAL: Potencial = {
  vencido: 80000000, aVencer: 140000,
  porTributo: [
    { nome: 'IPTU', codigos: [1], vencido: 47500000, aVencer: 80000 },
    { nome: 'ITBI', codigos: [10], vencido: 7400000, aVencer: 0 },
    { nome: 'Taxa de Fiscalização de Estabelecimento', codigos: [2002], vencido: 7080000, aVencer: 4700 },
    { nome: 'Taxa de Contribuição Ambiental (TCA)', codigos: [67], vencido: 6180000, aVencer: 14500 },
    { nome: 'I.S.S.Q.N.', codigos: [3], vencido: 3790000, aVencer: 0 },
    { nome: 'ISS Construção Civil', codigos: [40], vencido: 2720000, aVencer: 0 },
    { nome: 'Taxa de Fiscalização de Higiene e Saúde', codigos: [2003], vencido: 2140000, aVencer: 4200 },
    { nome: 'Auto de Infração', codigos: [19], vencido: 1490000, aVencer: 0 },
  ],
}

const CANAL_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e']
const convCor = (c: number) => c >= 75 ? '#1fa463' : c >= 50 ? '#e8962e' : '#d64545'
const INAD_CORES = ['#d64545', '#df6363', '#e88181', '#f0a0a0', '#f7bebe', '#c73333', '#b82727', '#a91c1c', '#961616', '#8a1414']

function geomBars(d: { ano: number; n: number }[]) {
  const W = 960, H = 280, top = 24, bottom = 232
  const span = bottom - top - 8
  const max = Math.max(1, ...d.map(x => x.n))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(46, gw * 0.5)
  const bars = d.map((x, i) => { const cx = i * gw + gw / 2; const h = (x.n / max) * span; return { cx, ano: x.ano, n: x.n, x: cx - bw / 2, y: bottom - h, h } })
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1000), y: bottom - (v / max) * span }))
  return { bars, ticks, W, H, bottom, bw }
}

export default function PainelCobranca() {
  const [d, setD] = useState<Resumo | null>(null)
  const [tip, setTip] = useState<{ left: string; top: string; ano: number; n: number } | null>(null)
  const [inadExpandido, setInadExpandido] = useState<string | null>(null)
  const [devedores, setDevedores] = useState<Devedor[] | null>(null)
  const [potencial, setPotencial] = useState<Potencial | null>(null)

  useEffect(() => {
    fetch('/api/cobranca/resumo?ano=2025').then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.lancado === 'number') setD(x) }).catch(() => {})
    fetch('/api/cobranca/potencial?ano=2025').then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.vencido === 'number') setPotencial(x) }).catch(() => {})
  }, [])

  function alternarInad(t: TribInad) {
    if (inadExpandido === t.nome) { setInadExpandido(null); setDevedores(null); return }
    setInadExpandido(t.nome)
    setDevedores(null)
    const qs = new URLSearchParams({ codigos: t.codigos.join(','), ano: String(g.ano) })
    fetch(`/api/cobranca/devedores-tributo?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => { if (res && !res.error && Array.isArray(res.itens)) setDevedores(res.itens) }).catch(() => {})
  }

  const g = d ?? FALLBACK
  const maxTrib = Math.max(1, ...g.tributos.map(t => t.lancado))
  const gb = geomBars(g.baixasPorAno)

  const totCanais = g.canais.reduce((a, c) => a + c.n, 0) || 1
  const donutC = 2 * Math.PI * 56
  let _off = 0
  const donut = g.canais.map((c, i) => { const len = (c.n / totCanais) * donutC; const s = { nome: c.nome, n: c.n, cor: CANAL_CORES[i % CANAL_CORES.length], len, off: -_off, pct: c.n / totCanais * 100 }; _off += len; return s })

  const piorConv = [...g.tributos].filter(t => t.lancado > 1e6).sort((a, b) => a.conversao - b.conversao)[0]
  const febraban = g.canais.find(c => /febraban/i.test(c.nome))
  const insights = [
    `Em ${g.ano}, ${fmtReais(g.lancado)} lançados e ${fmtReais(g.arrecadado)} arrecadados — conversão de ${fmtPct(g.conversao)}.`,
    `Potencial de ${fmtMoney(g.saldo)} ainda a recuperar.${piorConv ? ` ${piorConv.nome} tem a menor conversão (${fmtPct(piorConv.conversao)}).` : ''}`,
    febraban ? `O canal bancário (Febraban) processa ${fmtPct(febraban.n / totCanais * 100)} das baixas — principal meio de arrecadação.` : `${fmtInt(g.totalBaixas)} baixas processadas no histórico.`,
  ]

  const kpis = [
    { label: `Lançado ${g.ano}`, value: fmtMoney(g.lancado), subLabel: 'todos os tributos', subValue: '', pct: '', cor: '#fff' },
    { label: 'Arrecadado', value: fmtMoney(g.arrecadado), subLabel: 'do lançado', subValue: fmtPct(g.conversao), pct: '', cor: '' },
    { label: 'Conversão', value: fmtPct(g.conversao), subLabel: 'arrecadado / lançado', subValue: '', pct: '', cor: '' },
    { label: 'Potencial a Recuperar', value: fmtMoney(g.saldo), subLabel: 'inadimplência', subValue: '', pct: '', cor: '' },
    { label: 'Baixas Processadas', value: fmtInt(g.totalBaixas), subLabel: 'histórico', subValue: '', pct: '', cor: '' },
  ]

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
  const dots: React.CSSProperties = { color: '#aeb6c6', fontWeight: 700, letterSpacing: 1, fontSize: 14, flex: 'none' }
  const axisFont: React.CSSProperties = { fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontWeight: 500 }

  const kpiIcons = [
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6L9 17l-5-5" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 7-7M14 8h6v6" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h10" /></svg>,
  ]

  return (
    <div style={{ position: 'relative' }}>
      {!d ? <LoadingOverlay label="Carregando…" /> : null}
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
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 11, color: azul ? 'rgba(255,255,255,0.6)' : '#9098a8' }}>{k.subLabel} {k.subValue && <span style={{ color: azul ? '#fff' : '#3a4256', fontWeight: 600 }}>{k.subValue}</span>}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ROW 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1.1fr', gap: 18, marginTop: 20 }}>
        {/* Conversão por tributo */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Conversão por Tributo</span>
            <span style={reportBadge}>{g.ano}</span>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {g.tributos.map(t => (
              <div key={t.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 6 }}>{t.nome}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: convCor(t.conversao), flex: 'none' }}>{fmtPct(t.conversao)}</span>
                </div>
                <div style={{ height: 13, borderRadius: 5, background: '#eef1f7', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, t.conversao).toFixed(1)}%`, background: convCor(t.conversao), borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Cobrança</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de Cobrança</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {insights.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', background: '#fff', flex: 'none' }} />
                <span style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.9)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canais donut */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Canais de Arrecadação</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <svg viewBox="0 0 200 200" width="260" height="260" style={{ maxWidth: '100%' }}>
                <g transform="rotate(-90 100 100)">
                  {donut.map((s, i) => (<circle key={i} cx="100" cy="100" r="56" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)} />))}
                </g>
                <text x="100" y="98" fontSize="13" fontWeight="700" fill="#283e93" textAnchor="middle" style={axisFont}>{fmtInt(g.totalBaixas).replace(/\.\d+$/, '')}</text>
                <text x="100" y="113" fontSize="8" fill="#9098a8" textAnchor="middle" style={axisFont}>baixas</text>
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
              {donut.slice(0, 5).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                  <span style={{ flex: 1, fontSize: 12, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtPct(s.pct)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Inadimplência por Tributo Analítico — ranking pelo saldo devedor (não pelo lançado,
          como "Conversão por Tributo" acima), a nível de cada cd_tributo individual (não
          agrupado por IPTU/ITBI/ISS/...). Top N + linha agregada "Demais tributos". */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Inadimplência por Tributo Analítico</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Saldo devedor por tributo individual (cd_tributo), não agrupado por família (IPTU/ITBI/ISS/...) — {g.ano}. Clique num item para ver os maiores devedores.</div>
          </div>
          <span style={reportBadge}>Saldo devedor</span>
        </div>

        {(() => {
          const itens = g.inadimplenciaPorTributo
          if (!itens.length) return <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem inadimplência registrada no período.</div>
          const totalSaldo = itens.reduce((s, t) => s + t.saldo, 0)
          const maxSaldo = Math.max(1, ...itens.map(t => t.saldo))
          return (
            <>
              <div style={{ marginTop: 12, background: '#d64545', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total a recuperar (top {itens.length})</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtMoney(totalSaldo)}</span>
              </div>

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {itens.map((t, i) => {
                  const cor = /^Demais tributos/.test(t.nome) ? '#c2c9d6' : INAD_CORES[i % INAD_CORES.length]
                  const w = Math.max(3, 100 * t.saldo / maxSaldo)
                  const aberto = inadExpandido === t.nome
                  const maxDevedor = Math.max(1, ...(devedores ?? []).map(x => x.saldo))
                  return (
                    <div key={t.nome}>
                      <div onClick={() => alternarInad(t)} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4, gap: 8 }}>
                          <span style={{ fontSize: 11.5, color: aberto ? '#d64545' : '#3a4256', fontWeight: aberto ? 700 : 400, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="3" style={{ flex: 'none', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
                            {t.nome}
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#d64545', flex: 'none', textAlign: 'right' }}>
                            {fmtAbrev(t.saldo)}
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#9098a8' }}>de {fmtAbrev(t.lancado)} lançado · {fmtPct(t.conversao)} conv.</span>
                          </span>
                        </div>
                        <div style={{ height: 13, borderRadius: 5, background: '#f7e6e6', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: cor, borderRadius: 5 }} />
                        </div>
                      </div>
                      {aberto ? (
                        <div style={{ marginTop: 8, background: '#f7f9fd', borderRadius: 10, padding: '10px 10px 4px' }}>
                          <div style={{ fontSize: 10.5, color: '#5b6477', fontWeight: 600, padding: '0 4px 8px' }}>Maiores devedores{t.codigos.length > 1 ? ` — soma de ${t.codigos.length} códigos` : ''}</div>
                          {!devedores ? <Spinner label="Carregando…" size={26} padding={16} />
                            : !devedores.length ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '10px 0' }}>Nenhum devedor identificado.</div>
                            : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 6 }}>
                                {devedores.map((dv, di) => (
                                  <div key={dv.cd}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 2 }}>
                                      <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{di + 1}. {dv.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>{dv.cpfCnpj ? `· ${dv.cpfCnpj}` : ''}</span></span>
                                      <span style={{ color: '#d64545', fontWeight: 700, flex: 'none' }}>{fmtAbrev(dv.saldo)}</span>
                                    </div>
                                    <div style={{ height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.max(3, 100 * dv.saldo / maxDevedor).toFixed(1)}%`, borderRadius: 5, background: '#d64545' }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </div>

      {/* Potencial de Arrecadação — painel: do saldo devedor, quanto já VENCEU (inadimplência
          genuína, ação de cobrança já cabível) × quanto ainda NÃO VENCEU (potencial futuro,
          não cobrável ainda), por tributo analítico. */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Potencial de Arrecadação</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Do saldo devedor, quanto já venceu (cobrável agora) × quanto ainda não venceu (potencial futuro), por tributo — {g.ano}.</div>
          </div>
          <span style={reportBadge}>Vencido × A Vencer</span>
        </div>

        {(() => {
          const p = potencial ?? FALLBACK_POTENCIAL
          if (!potencial) return <div style={{ marginTop: 14, height: 160, borderRadius: 12, background: '#eef1f7' }} />
          const totalPot = p.vencido + p.aVencer
          const pctVenc = totalPot ? (p.vencido / totalPot) * 100 : 0
          const pctAVenc = totalPot ? (p.aVencer / totalPot) * 100 : 0
          const maxTrib = Math.max(1, ...p.porTributo.map(t => t.vencido + t.aVencer))
          return (
            <>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                <div style={{ background: '#fdeceb', border: '1px solid #f3d0cd', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#d64545' }}>Vencido · cobrável agora</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtMoney(p.vencido)}</div>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctVenc)} do potencial total</div>
                </div>
                <div style={{ background: '#fdf3e6', border: '1px solid #f2ddb8', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#c07a2e' }}>A Vencer · potencial futuro</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtMoney(p.aVencer)}</div>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctAVenc)} do potencial total</div>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por tributo</span>
                <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: '#5b6477' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#d64545' }} />Vencido</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#e8962e' }} />A Vencer</span>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {p.porTributo.map(t => {
                  const tot = t.vencido + t.aVencer
                  const wVenc = Math.max(0, 100 * t.vencido / maxTrib)
                  const wAVenc = Math.max(0, 100 * t.aVencer / maxTrib)
                  return (
                    <div key={t.nome}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                        <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(tot)}</span>
                      </div>
                      <div style={{ height: 12, borderRadius: 5, background: '#eef1f7', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${wVenc.toFixed(1)}%`, background: '#d64545' }} />
                        <div style={{ width: `${wAVenc.toFixed(1)}%`, background: '#e8962e' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </div>

      {/* ROW 2 — baixas por ano */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Baixas Processadas por Ano</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>volume de DAMs recebidas pelo setor de Cobrança</div>
          </div>
          <span style={reportBadge}>Volume</span>
        </div>
        <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
          <svg viewBox={`0 0 ${gb.W} ${gb.H}`} width="100%" style={{ display: 'block' }}>
            <defs><linearGradient id="cobBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#7d8fce" /></linearGradient></defs>
            {gb.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(gb.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 2).toFixed(1)} fontSize="8" fill="#aeb6c6" style={axisFont}>{t.v}k</text></g>))}
            <line x1="0" y1={gb.bottom} x2={String(gb.W)} y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
            {gb.bars.map((b, i) => (<g key={i}><rect x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.h.toFixed(1)} rx="5" fill="url(#cobBar)" /><text x={b.cx.toFixed(1)} y={String(gb.H - 6)} fontSize="9" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text></g>))}
            {gb.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTip({ left: `${(b.cx / gb.W * 100).toFixed(1)}%`, top: `${(b.y / gb.H * 100).toFixed(1)}%`, ano: b.ano, n: b.n })} x={(b.cx - gb.bw).toFixed(1)} y="0" width={(gb.bw * 2).toFixed(1)} height={String(gb.H - 20)} fill="transparent" pointerEvents="all" />))}
          </svg>
          {tip ? (
            <div style={{ position: 'absolute', left: tip.left, top: tip.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{tip.ano}</div>
              <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 3 }}>{fmtInt(tip.n)} baixas</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tabela por tributo */}
      <div style={{ ...card, marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Conversão por Tributo · {g.ano}</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tributo', 'Lançado', 'Arrecadado', 'A Recuperar', 'Conversão'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.tributos.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.nome}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.nome}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.lancado)}</td>
                    <td style={{ background: cellBg, color: '#1fa463', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.arrecadado)}</td>
                    <td style={{ background: cellBg, color: '#d64545', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.saldo)}</td>
                    <td style={{ background: cellBg, color: convCor(row.conversao), fontSize: 12, fontWeight: 700, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(row.conversao)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
