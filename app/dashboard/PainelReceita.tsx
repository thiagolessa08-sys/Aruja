'use client'

import { useState, useEffect } from 'react'
import AreaSerie from '../_components/AreaSerie'
import LoadingOverlay from '../_components/LoadingOverlay'

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

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

interface PorAno { ano: number; arrecadado: number; previsto: number }
interface PorMes { mes: number; nome: string; anoAnterior: number; anoAtual: number; pct: number }
interface NoTree { cat: string; ori: string; esp: string; ali: string; nat: string; v: number }
interface NoDivida { bucket: string; nat: string; v: number }
interface Graficos {
  porAno: PorAno[]
  porMes: PorMes[]
  categoria: { correntes: number; capital: number }
  categoriaTree?: NoTree[]
  dividaAtiva: { total: number; impostos: number; taxas: number; demais: number; tree?: NoDivida[] }
  historico: { anos: number[]; linhas: { mes: string; vals: number[] }[] }
}

// Drill de apenas 1 nível: Categoria → Origem (e para)
const NIVEIS_DRILL: { campo: keyof NoTree; titulo: string }[] = [
  { campo: 'cat', titulo: 'Categoria' },
  { campo: 'ori', titulo: 'Origem' },
]
const DRILL_MAX = NIVEIS_DRILL.length - 1 // último nível (Origem) não permite drill

const parseBR = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtM = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
// Rótulo curto p/ barras (só o número em milhões, 1 casa) — evita sobreposição
const fmtBar = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'K'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

// Fallback com valores reais (substituído pelo fetch de /api/orcamento/graficos)
const _A2025 = [60899312.06, 59622020.95, 47029868.84, 60347748.41, 45822535.10, 49114933.97, 61364457.01, 45837000.04, 55988948.69, 51201371.49, 49437783.52, 92478116.43]
const _A2026 = [72824455.17, 60263870.41, 61773438.84, 55902811.85, 61842501.23, 37821665.45, 0, 0, 0, 0, 0, 0]
const FALLBACK_GRAF: Graficos = {
  porAno: [
    { ano: 2023, arrecadado: 575900000, previsto: 578980000 },
    { ano: 2024, arrecadado: 655300000, previsto: 660980000 },
    { ano: 2025, arrecadado: 739400000, previsto: 761140000 },
    { ano: 2026, arrecadado: 410900000, previsto: 829720000 },
  ],
  porMes: _A2025.map((ant, i) => {
    const atu = _A2026[i]
    const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
    return { mes: i + 1, nome: MESES_NOME[i], anoAnterior: ant, anoAtual: atu, pct }
  }),
  categoria: { correntes: 337489272, capital: 12939471 },
  categoriaTree: [
    { cat: 'RECEITAS CORRENTES', ori: 'IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA', esp: 'IMPOSTOS', ali: 'ISSQN', nat: 'ISSQN - IMPOSTO SERVIÇOS QUALQUER NATUREZA', v: 69880000 },
    { cat: 'RECEITAS CORRENTES', ori: 'IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA', esp: 'IMPOSTOS', ali: 'IPTU', nat: 'IPTU - IMPOSTO PROPR PREDIAL E TERRIT URBANA', v: 50590000 },
    { cat: 'RECEITAS CORRENTES', ori: 'IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA', esp: 'IMPOSTOS', ali: 'ITBI', nat: 'ITBI - IMPOSTO TRANSM INTER VIVOS - BENS IMÓVEIS', v: 25330000 },
    { cat: 'RECEITAS CORRENTES', ori: 'TRANSFERÊNCIAS CORRENTES', esp: 'TRANSFERÊNCIAS DA UNIÃO E DE SUAS ENTIDADES', ali: 'FPM', nat: 'COTA-PARTE DO FPM', v: 95520000 },
    { cat: 'RECEITAS CORRENTES', ori: 'IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA', esp: 'TAXAS', ali: 'TAXAS DE FISCALIZAÇÃO', nat: 'TFE', v: 8000000 },
    { cat: 'RECEITAS DE CAPITAL', ori: 'OPERAÇÕES DE CRÉDITO', esp: 'OPERAÇÕES DE CRÉDITO', ali: 'MERCADO INTERNO', nat: 'OPER CRED DESP CAPITAL', v: 18000000 },
  ],
  dividaAtiva: {
    total: 9618583, impostos: 7630496, taxas: 1979821, demais: 8266,
    tree: [
      { bucket: 'IMPOSTOS', nat: 'IPTU - DÍVIDA ATIVA', v: 5500000 },
      { bucket: 'IMPOSTOS', nat: 'ISSQN - DÍVIDA ATIVA', v: 1400000 },
      { bucket: 'IMPOSTOS', nat: 'ITBI - DÍVIDA ATIVA', v: 730496 },
      { bucket: 'TAXAS', nat: 'OUTROS TRIBUTOS - DÍVIDA ATIVA', v: 1979821 },
      { bucket: 'DEMAIS RECEITAS CORRENTES', nat: 'OUTRAS RECEITAS - DÍVIDA ATIVA', v: 8266 },
    ],
  },
  historico: { anos: [2023, 2024, 2025, 2026], linhas: TABELA.map(t => ({ mes: t.mes, vals: t.vals.map(parseBR) })) },
}

// Geometria — gráfico de linha "Arrecadação por Ano"
function geomLinha(d: PorAno[]) {
  const mi = (v: number) => v / 1e6
  const vals = d.flatMap(p => [mi(p.arrecadado), mi(p.previsto)])
  const hi = Math.ceil(Math.max(...vals) / 100) * 100
  const lo = Math.max(0, Math.floor(Math.min(...vals) / 100) * 100)
  const xL = 34, xR = 290, yT = 20, yB = 112, span = hi - lo || 1
  const n = d.length
  const X = (i: number) => n <= 1 ? (xL + xR) / 2 : xL + (i * (xR - xL)) / (n - 1)
  const Y = (vMi: number) => yT + ((hi - vMi) / span) * (yB - yT)
  const linha = d.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(mi(p.arrecadado)).toFixed(1)}`).join(' ')
  const area = `${linha} L${X(n - 1).toFixed(1)} ${yB} L${X(0).toFixed(1)} ${yB} Z`
  const ticks = [hi, (hi + lo) / 2, lo].map(t => ({ v: Math.round(t), y: Y(t) }))
  const labels = d.map((p, i) => ({ ano: p.ano, x: X(i) }))
  const dots = d.map((p, i) => ({ x: X(i), y: Y(mi(p.arrecadado)) }))
  const half = n > 1 ? (xR - xL) / (n - 1) / 2 : 40
  const hot = d.map((p, i) => ({
    x: X(i) - half, w: half * 2,
    tip: { chart: 'report' as const, title: String(p.ano), l1: `Arrecadado: ${fmtMi(p.arrecadado)}`, l1c: '#283e93', left: `${(X(i) / 300 * 100).toFixed(1)}%`, top: `${(Y(mi(p.arrecadado)) / 130 * 100).toFixed(1)}%` },
  }))
  return { linha, area, ticks, labels, dots, hot }
}

// Geometria — gráfico de barras "Arrecadação por Mês"
function geomBar(d: PorMes[]) {
  const W = 1080, H = 380, top = 40, bottom = 300
  const max = Math.max(1, ...d.flatMap(m => [m.anoAnterior, m.anoAtual]))
  const sc = (v: number) => (v / max) * (bottom - top - 10)
  const gw = W / 12
  const bars = d.map((m, i) => {
    const cx = i * gw + gw / 2
    const hAnt = sc(m.anoAnterior), hAtu = sc(m.anoAtual)
    return {
      cx, nome: m.nome, pct: fmtPct(m.pct), vAnt: m.anoAnterior, vAtu: m.anoAtual,
      ant: { x: cx - 28, y: bottom - hAnt, h: hAnt },
      atu: m.anoAtual > 0 ? { x: cx + 4, y: bottom - hAtu, h: hAtu } : null,
      tip: { chart: 'arrec' as const, title: `${m.nome} · ${fmtPct(m.pct)}`, l1: `Ano Anterior: ${fmtMi(m.anoAnterior)}`, l1c: '#283e93', l2: `Ano Atual: ${fmtMi(m.anoAtual)}`, l2c: '#e8962e', left: `${(cx / W * 100).toFixed(1)}%`, top: `${((bottom - Math.max(hAnt, hAtu)) / H * 100).toFixed(1)}%` },
    }
  })
  const media = d.reduce((s, m) => s + m.anoAnterior, 0) / 12
  return { bars, W, H, bottom, yMedia: bottom - sc(media), media }
}

interface KpiCard {
  label: string
  value: string
  subLabel: string
  subValue: string
  pct: string
  dir: 'up' | 'down' | 'flat'
}

// Fallback = valores reais mais recentes (exibidos enquanto a API carrega ou se falhar)
const KPIS_FALLBACK: KpiCard[] = [
  { label: 'Orçado', value: '829,72 mi', subLabel: 'Ano Anterior', subValue: '761,14 mi', pct: '9,01%', dir: 'up' },
  { label: 'Orçado Atualizado', value: '879,68 mi', subLabel: 'Ano Anterior', subValue: '816,64 mi', pct: '7,72%', dir: 'up' },
  { label: 'Arrecadação Mês', value: '0,40 mi', subLabel: 'Julho/25', subValue: '66,52 mi', pct: '-99,40%', dir: 'down' },
  { label: 'Arrecadação Até o Mês', value: '413,48 mi', subLabel: 'Ano Anterior', subValue: '420,51 mi', pct: '-1,67%', dir: 'down' },
  { label: 'Arrecadação Mês Anterior', value: '71,06 mi', subLabel: 'Julho/26', subValue: '0,40 mi', pct: '-99,44%', dir: 'down' },
]

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

const INSIGHTS_FALLBACK = [
  'Arrecadação acumulada de 2026 soma R$ 350,4 mi, +8,6% frente ao mesmo período de 2025.',
  'Impostos lideram a receita de 2026 com R$ 106,5 mi, seguidos das transferências estaduais.',
  'Junho/2026 arrecadou R$ 37,8 mi, abaixo do ritmo dos meses anteriores.',
]

export interface FiltrosReceita { ano: number | ''; mes: string; alinea: string; natureza: string }

function buildQS(f: FiltrosReceita): string {
  const p = new URLSearchParams()
  if (f.ano) p.set('ano', String(f.ano))
  if (f.mes) p.set('mes', f.mes)
  if (f.natureza) p.set('natureza', f.natureza)
  else if (f.alinea) p.set('alinea', f.alinea)
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Busca com retry — o túnel do agente às vezes devolve 502; sem isso o painel
// fica mostrando o fallback (ex.: ano 2022 e valores antigos) de forma intermitente.
async function fetchJsonRetry(url: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 8000) // evita fetch pendurado (túnel sem resposta)
    try {
      const r = await fetch(url, { signal: ctrl.signal })
      if (r.ok) { const d = await r.json(); if (d && !d.error) return d }
    } catch { /* timeout/rede — tenta de novo */ } finally { clearTimeout(to) }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 700 * (i + 1)))
  }
  return null
}

export default function PainelReceita({ filtros }: { filtros: FiltrosReceita }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [kpis, setKpis] = useState<KpiCard[]>(KPIS_FALLBACK)
  const [insights, setInsights] = useState<string[] | null>(null)
  const [graf, setGraf] = useState<Graficos | null>(null)
  const [drill, setDrill] = useState<string[]>([]) // caminho do drill Categoria→…→Natureza
  const [daDrill, setDaDrill] = useState<string | null>(null) // bucket selecionado na Dívida Ativa
  const [carregando, setCarregando] = useState(false)

  const qs = buildQS(filtros)

  // Ao trocar filtros, volta os drills para a raiz
  useEffect(() => { setDrill([]); setDaDrill(null) }, [qs])

  // Busca gráficos + KPIs juntos e controla o overlay de carregamento
  useEffect(() => {
    let vivo = true
    setCarregando(true)
    const safety = setTimeout(() => { if (vivo) setCarregando(false) }, 15000) // nunca trava o overlay
    Promise.all([
      fetchJsonRetry(`/api/orcamento/graficos${qs}`).then(d => { if (vivo && d) setGraf(d) }),
      fetchJsonRetry(`/api/orcamento/kpis${qs}`).then(d => { if (vivo && d?.kpis?.length) setKpis(d.kpis) }),
    ]).finally(() => { if (vivo) { clearTimeout(safety); setCarregando(false) } })
    return () => { vivo = false; clearTimeout(safety) }
  }, [qs])

  useEffect(() => {
    let vivo = true
    fetchJsonRetry('/api/orcamento/insights').then(d => { if (vivo) setInsights(d?.insights?.length ? d.insights : INSIGHTS_FALLBACK) })
    return () => { vivo = false }
  }, [])

  const tipReport = tip && tip.chart === 'report' ? tip : null
  const tipArrec = tip && tip.chart === 'arrec' ? tip : null

  const g = graf ?? FALLBACK_GRAF
  const gl = geomLinha(g.porAno)
  const gb = geomBar(g.porMes)

  // Donut Dívida Ativa
  const da = g.dividaAtiva
  const donutC = 2 * Math.PI * 66
  let _off = 0
  const donut = [
    { nome: 'IMPOSTOS', v: da.impostos, cor: '#283e93' },
    { nome: 'TAXAS', v: da.taxas, cor: '#e8962e' },
    { nome: 'DEMAIS RECEITAS CORRENTES', v: da.demais, cor: '#aab8e3' },
  ].map(p => {
    const len = da.total ? (p.v / da.total) * donutC : 0
    const seg = { ...p, len, off: -_off, pct: da.total ? (p.v / da.total) * 100 : 0 }
    _off += len
    return seg
  })

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
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

  // Ícones dos 5 KPIs (cor herdada do container via currentColor)
  const kpiIcons = [
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17.5" cy="9" r="2.3" /><path d="M16 19a4.5 4.5 0 0 1 5.5-4.4" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="11" height="18" rx="1" /><path d="M8 7h2M12 7h1.5M8 11h2M12 11h1.5M8 15h2M12 15h1.5" /><path d="M16 21h3V11h-3" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.6 3.1 3 7 3s7-1.4 7-3v-5" /><path d="M5 11.5v5c0 1.6 3.1 3 7 3s7-1.4 7-3v-5" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 11a8 8 0 1 0-.5 4" /><path d="M20 5v6h-6" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>,
  ]

  return (
    <div style={{ position: 'relative' }}>
      {carregando ? <LoadingOverlay /> : null}
      {/* ===== KPIs ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 20 }}>
        {kpis.map((k, i) => {
          const azul = k.label === 'Orçado Atualizado'
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

        {/* Arrecadação por Ano */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Arrecadação por Ano</span>
            <span style={reportBadge}>Anual</span>
          </div>
          <div style={{ marginTop: 16, height: 240 }}>
            <AreaSerie
              data={g.porAno.map(p => ({ ano: p.ano, valor: p.arrecadado }))}
              cor="#283e93"
              nome="Arrecadado"
              fmtValor={fmtMi}
              fmtEixoY={(v) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            />
          </div>
        </div>

        {/* Insights de Receita */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Receita</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de Receita</div>
          {insights === null ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 9, borderRadius: 5, width: i === 1 ? '85%' : '95%', background: 'rgba(255,255,255,0.18)' }} />
              ))}
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

        {/* Arrecadação por Categoria / Origem — com DRILL (Categoria→Espécie→Alínea→Natureza) */}
        <div style={card}>
          {(() => {
            const tree = g.categoriaTree ?? []
            const depth = Math.min(drill.length, DRILL_MAX)
            const filtered = tree.filter(n => drill.every((sel, i) => n[NIVEIS_DRILL[i].campo] === sel))
            const campo = NIVEIS_DRILL[depth].campo
            const agg = new Map<string, number>()
            for (const n of filtered) if (n[campo]) agg.set(String(n[campo]), (agg.get(String(n[campo])) ?? 0) + n.v)
            const itens = [...agg.entries()].map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v)
            const maxV = Math.max(1, ...itens.map(i => i.v))
            const canDrill = drill.length < DRILL_MAX
            const TOP = 7
            const vis = itens.slice(0, TOP)
            const resto = itens.slice(TOP)
            const restoV = resto.reduce((s, i) => s + i.v, 0)

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Arrecadação por Categoria / Origem</span>
                </div>

                {/* Trilha (breadcrumb) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 11 }}>
                  <button onClick={() => setDrill([])} style={{ border: 'none', background: drill.length ? '#eef1fb' : 'transparent', color: '#283e93', fontWeight: 600, cursor: drill.length ? 'pointer' : 'default', borderRadius: 8, padding: '3px 8px' }}>Todas</button>
                  {drill.map((sel, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: '#c2c9d6' }}>›</span>
                      <button onClick={() => setDrill(drill.slice(0, i + 1))} title={sel} style={{ border: 'none', background: i === drill.length - 1 ? 'transparent' : '#eef1fb', color: i === drill.length - 1 ? '#5b6477' : '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '3px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel}</button>
                    </span>
                  ))}
                </div>

                {/* Barras horizontais clicáveis */}
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {vis.map((it, i) => {
                    const w = Math.max(6, 100 * it.v / maxV)
                    return (
                      <div key={i} onClick={() => { if (canDrill) setDrill([...drill, it.label]) }} title={`${it.label}: ${fmtM(it.v)}`} style={{ cursor: canDrill ? 'pointer' : 'default' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 4 }}>
                          <span title={it.label} style={{ color: '#3a4256', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                          <span style={{ color: '#283e93', fontWeight: 700, flex: 'none' }}>{fmtM(it.v)}</span>
                        </div>
                        <div style={{ height: 22, borderRadius: 11, background: '#eef1f7', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${w.toFixed(1)}%`, borderRadius: 11, background: 'linear-gradient(90deg,#283e93 0%,#8094d6 100%)' }} />
                        </div>
                      </div>
                    )
                  })}
                  {resto.length ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#9098a8', paddingTop: 2 }}>
                      <span>+{resto.length} outras</span>
                      <span style={{ fontWeight: 600 }}>{fmtM(restoV)}</span>
                    </div>
                  ) : null}
                  {!vis.length ? <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>Sem dados neste nível.</div> : null}
                </div>
                {canDrill && vis.length ? <div style={{ marginTop: 12, fontSize: 10.5, color: '#aeb6c6' }}>Clique numa barra para detalhar</div> : null}
              </>
            )
          })()}
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
              <line x1="8" y1={gb.bottom} x2="1072" y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gb.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.ant.x.toFixed(1)} y={b.ant.y.toFixed(1)} width="24" height={b.ant.h.toFixed(1)} rx="6" fill="url(#arrAnt)" />
                  {b.atu ? <rect x={b.atu.x.toFixed(1)} y={b.atu.y.toFixed(1)} width="24" height={b.atu.h.toFixed(1)} rx="6" fill="url(#arrAtu)" /> : null}
                  {b.vAnt > 0 ? <text x={(b.ant.x + 12).toFixed(1)} y={(b.ant.y - 6).toFixed(1)} fontSize="11" fontWeight="600" fill="#283e93" style={axisFont} textAnchor="middle">{fmtBar(b.vAnt)}</text> : null}
                  {b.atu && b.vAtu > 0 ? <text x={(b.atu.x + 12).toFixed(1)} y={(b.atu.y - 6).toFixed(1)} fontSize="11" fontWeight="600" fill="#c0612a" style={axisFont} textAnchor="middle">{fmtBar(b.vAtu)}</text> : null}
                  <text x={b.cx.toFixed(1)} y="324" fontSize="13" fill="#3a4256" style={axisFont} textAnchor="middle">{b.nome}</text>
                  <text x={b.cx.toFixed(1)} y="350" fontSize="12" fill="#5b6477" style={axisFont} textAnchor="middle">{b.pct}</text>
                </g>
              ))}
              {gb.bars.map((b, i) => (
                <rect key={i} onMouseEnter={() => setTip(b.tip)} x={(b.cx - 44).toFixed(1)} y="40" width="88" height="260" fill="transparent" pointerEvents="all" />
              ))}
            </svg>
            {tipArrec ? <Tooltip t={tipArrec} /> : null}
          </div>
        </div>

        {/* Arrecadação Dívida Ativa — com DRILL para Natureza */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Arrecadação Dívida Ativa</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>{fmtReais(da.total)}</div>
          {daDrill ? (() => {
            const nats = (da.tree ?? []).filter(n => n.bucket === daDrill).sort((a, b) => b.v - a.v)
            const totalN = nats.reduce((s, n) => s + n.v, 0)
            const paleta = ['#283e93', '#1fa463', '#e8962e', '#8094d6', '#aab8e3', '#5870c4', '#d6a24a']
            let offN = 0
            const segN = nats.map((n, i) => {
              const len = totalN ? (n.v / totalN) * donutC : 0
              const seg = { nat: n.nat, v: n.v, cor: paleta[i % paleta.length], len, off: -offN, pct: totalN ? (n.v / totalN) * 100 : 0 }
              offN += len
              return seg
            })
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                  <span title={daDrill} style={{ fontSize: 11, fontWeight: 600, color: '#5b6477', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{daDrill}</span>
                  <button onClick={() => setDaDrill(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, flex: 'none' }}>‹ Voltar</button>
                </div>
                {segN.length ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                      <svg viewBox="0 0 200 200" width="200" height="200">
                        <g transform="rotate(-90 100 100)">
                          {segN.map((s, i) => (
                            <circle key={i} cx="100" cy="100" r="66" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)}>
                              <title>{`${s.nat}: ${fmtReais(s.v)} (${fmtPct(s.pct)})`}</title>
                            </circle>
                          ))}
                        </g>
                      </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
                      {segN.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                          <span title={s.nat} style={{ flex: 1, fontSize: 12, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nat}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44', flex: 'none' }}>{fmtCompact(s.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div style={{ fontSize: 12, color: '#9098a8', padding: '24px 0', textAlign: 'center' }}>Sem naturezas neste nível.</div>}
              </>
            )
          })() : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                <svg viewBox="0 0 200 200" width="210" height="210">
                  <g transform="rotate(-90 100 100)">
                    {donut.map((s, i) => {
                      const temNat = (da.tree ?? []).some(n => n.bucket === s.nome)
                      return (
                        <circle key={i} cx="100" cy="100" r="66" fill="none" stroke={s.cor} strokeWidth="30"
                          strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)}
                          onClick={() => { if (temNat) setDaDrill(s.nome) }} style={{ cursor: temNat ? 'pointer' : 'default' }}>
                          <title>{`${s.nome}: ${fmtReais(s.v)} (${fmtPct(s.pct)})`}</title>
                        </circle>
                      )
                    })}
                  </g>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 16 }}>
                {donut.map((s, i) => {
                  const temNat = (da.tree ?? []).some(n => n.bucket === s.nome)
                  return (
                    <div key={i} onClick={() => { if (temNat) setDaDrill(s.nome) }} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: temNat ? 'pointer' : 'default' }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                      <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.nome}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtCompact(s.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
                    </div>
                  )
                })}
              </div>
              {(da.tree ?? []).length ? <div style={{ marginTop: 12, fontSize: 10.5, color: '#aeb6c6' }}>Clique numa espécie para ver as naturezas</div> : null}
            </>
          )}
        </div>
      </div>

      {/* ===== Histórico Mensal (tabela) ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Histórico Mensal de Arrecadação por Ano</span>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Meses', ...g.historico.anos.map(String)].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.historico.linhas.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.mes}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.mes}</td>
                    {row.vals.map((v, ci) => (
                      <td key={ci} style={{ background: cellBg, color: v === 0 ? '#9098a8' : '#c0612a', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(v)}</td>
                    ))}
                  </tr>
                )
              })}
              <tr>
                <td style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 700, padding: '10px 16px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>Total</td>
                {g.historico.anos.map((_, ci) => {
                  const totalCol = g.historico.linhas.reduce((s, row) => s + (row.vals[ci] ?? 0), 0)
                  return (
                    <td key={ci} style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 700, padding: '10px 16px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{fmtReais(totalCol)}</td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
