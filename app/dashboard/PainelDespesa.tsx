'use client'

import { useState, useEffect } from 'react'
import AreaSerie from '../_components/AreaSerie'

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
interface Graficos {
  porAno: PorAno[]
  porMes: PorMes[]
  categoria: { correntes: number; capital: number }
  dividaAtiva: { total: number; impostos: number; taxas: number; demais: number }
  historico: { anos: number[]; linhas: { mes: string; vals: number[] }[] }
}

const parseBR = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
const fmtM = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
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
    { ano: 2022, arrecadado: 482473693, previsto: 341200000 },
    { ano: 2023, arrecadado: 525597074, previsto: 530000000 },
    { ano: 2024, arrecadado: 600375250, previsto: 606000000 },
    { ano: 2025, arrecadado: 679144097, previsto: 700000000 },
  ],
  porMes: _A2025.map((ant, i) => {
    const atu = _A2026[i]
    const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
    return { mes: i + 1, nome: MESES_NOME[i], anoAnterior: ant, anoAtual: atu, pct }
  }),
  categoria: { correntes: 337489272, capital: 12939471 },
  dividaAtiva: { total: 9618583, impostos: 7630496, taxas: 1979821, demais: 8266 },
  historico: { anos: [2023, 2024, 2025, 2026], linhas: TABELA.map(t => ({ mes: t.mes, vals: t.vals.map(parseBR) })) },
}

// Despesas por Ano — Valor Pago real (substituído pelo fetch de /api/despesa/graficos)
const FALLBACK_DESPESA_ANO: PorAno[] = [
  { ano: 2023, arrecadado: 552110000, previsto: 552110000 },
  { ano: 2024, arrecadado: 563610000, previsto: 563610000 },
  { ano: 2025, arrecadado: 628180000, previsto: 628180000 },
  { ano: 2026, arrecadado: 360600000, previsto: 360600000 },
]

interface FornecedorItem { doc: string; nome: string; empenhado: number; liquidado: number; pago: number }
interface FornecedoresData { ano: number; itens: FornecedorItem[]; total: { empenhado: number; liquidado: number; pago: number } }

// Fornecedores - Valor de Liquidado — real (substituído pelo fetch de /api/despesa/fornecedores)
const FALLBACK_FORNECEDORES: FornecedoresData = {
  ano: 2026,
  itens: [
    { doc: '012.828.423/0001-83', nome: 'FUNDO MUNICIPAL DE SAUDE DE ARUJA', empenhado: 145166542.04, liquidado: 145166542.04, pago: 143166542.04 },
    { doc: '056.901.275/0001-50', nome: 'PREFEITURA MUNICIPAL DE ARUJA', empenhado: 100140011.90, liquidado: 99192179.92, pago: 99172301.13 },
    { doc: '029.979.036/0001-40', nome: 'INSTITUTO NACIONAL DO SEGURO SOCIAL', empenhado: 39797417.26, liquidado: 39797417.26, pago: 39797417.26 },
    { doc: '058.478.652/0001-16', nome: 'CAMARA MUNICIPAL DE ARUJA', empenhado: 36585524.24, liquidado: 36585524.24, pago: 36585524.24 },
    { doc: '013.689.392/0001-90', nome: 'FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL DE ARUJA', empenhado: 26257482.58, liquidado: 26257482.58, pago: 26257482.58 },
    { doc: '017.508.792/0001-02', nome: 'AMIS- ASSOCIACAO MISSAO INTEGRAL SEMEAR DE GESTAO', empenhado: 31146538.53, liquidado: 24652708.78, pago: 24652708.78 },
    { doc: '000.360.305/1187-09', nome: 'CAIXA ECONOMICA FEDERAL', empenhado: 14857367.48, liquidado: 14821812.95, pago: 14821812.95 },
    { doc: '007.868.290/0001-39', nome: 'INSTITUTO BRASILEIRO DE GESTAO E ASSISTENCIA A SAU', empenhado: 32450787.32, liquidado: 13940323.85, pago: 13940323.85 },
    { doc: '000.884.554/0001-07', nome: 'ELECTRA SERVICOS DE INFRAESTRUTURA URBANA LTDA', empenhado: 15301388.60, liquidado: 10596603.85, pago: 10596603.85 },
    { doc: '000.338.763/0013-80', nome: 'PLENA SAUDE S.A.', empenhado: 15196896.94, liquidado: 9162965.58, pago: 9162965.58 },
  ],
  total: { empenhado: 771253883.97, liquidado: 579530624.32, pago: 575941807.44 },
}

// Liquidado por Mês — real (substituído pelo fetch de /api/despesa/graficos)
const _LIQ_ANT = [61400000, 55700000, 47300000, 50100000, 44700000, 52700000, 52400000, 47900000, 46100000, 49900000, 49700000, 74100000]
const _LIQ_ATU = [72100000, 55200000, 55900000, 56100000, 59300000, 27700000, 0, 0, 0, 0, 0, 0]
const FALLBACK_DESPESA_MES: PorMes[] = _LIQ_ANT.map((ant, i) => {
  const atu = _LIQ_ATU[i]
  const pct = ant ? ((atu - ant) / ant) * 100 : (atu > 0 ? 100 : 0)
  return { mes: i + 1, nome: MESES_NOME[i], anoAnterior: ant, anoAtual: atu, pct }
})

interface SubElementoItem { subelemento: string; elemento: string; liquidado: number }
interface SubElementoData { ano: number; elemento: string; elementos: string[]; itens: SubElementoItem[] }

// Liquidado por SubElemento — real (substituído pelo fetch de /api/despesa/liquidado-subelemento)
const FALLBACK_SUBELEMENTO: SubElementoData = {
  ano: 2026,
  elemento: 'TODOS',
  elementos: [],
  itens: [
    { subelemento: 'VENCIMENTOS E SALÁRIOS', elemento: 'VENCIMENTOS E VANTAGENS FIXAS - PESSOAL CIVIL', liquidado: 67525017.60 },
    { subelemento: 'CONTRATO DE GESTÃO', elemento: 'CONTRATO DE GESTÃO', liquidado: 52626420.89 },
    { subelemento: 'OUTROS SERVIÇOS DE TERCEIROS - PESSOA JURÍDICA', elemento: 'OUTROS SERVIÇOS DE TERCEIROS - PESSOA JURÍDICA', liquidado: 40871733.33 },
    { subelemento: 'SUBVENÇÕES SOCIAIS', elemento: 'SUBVENÇÕES SOCIAIS', liquidado: 17985918.46 },
    { subelemento: 'CONTRIBUIÇÕES PREVIDENCIÁRIAS - INSS', elemento: 'OBRIGAÇÕES PATRONAIS', liquidado: 16359914.83 },
    { subelemento: 'SERVIÇO MÉDICO-HOSPITALAR, ODONTOLÓGICO E LABORATORIAIS', elemento: 'OUTROS SERVIÇOS DE TERCEIROS - PESSOA JURÍDICA', liquidado: 12748719.69 },
    { subelemento: 'LIMPEZA E CONSERVAÇÃO', elemento: 'OUTROS SERVIÇOS DE TERCEIROS - PESSOA JURÍDICA', liquidado: 11965759.07 },
    { subelemento: 'INDENIZAÇÃO AUXÍLIO ALIMENTAÇÃO', elemento: 'AUXÍLIO ALIMENTAÇÃO', liquidado: 10756261.91 },
    { subelemento: 'GRATIFICAÇÃO POR TEMPO DE SERVIÇO', elemento: 'VENCIMENTOS E VANTAGENS FIXAS - PESSOAL CIVIL', liquidado: 9038209.06 },
  ],
}

// Liquidado por Categoria / Grupo — árvore para drill de 1 nível (Categoria → Grupo)
interface CatGrupo { cat: string; grupo: string; v: number }
const FALLBACK_CATTREE: CatGrupo[] = [
  { cat: 'DESPESAS CORRENTES', grupo: 'PESSOAL E ENCARGOS SOCIAIS', v: 210000000 },
  { cat: 'DESPESAS CORRENTES', grupo: 'OUTRAS DESPESAS CORRENTES', v: 180000000 },
  { cat: 'DESPESAS CORRENTES', grupo: 'JUROS E ENCARGOS DA DÍVIDA', v: 3000000 },
  { cat: 'DESPESAS DE CAPITAL', grupo: 'INVESTIMENTOS', v: 14480000 },
  { cat: 'DESPESAS DE CAPITAL', grupo: 'AMORTIZAÇÃO DA DÍVIDA', v: 3490000 },
]

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
    tip: { chart: 'report' as const, title: String(p.ano), l1: `Pago: ${fmtMi(p.arrecadado)}`, l1c: '#283e93', left: `${(X(i) / 300 * 100).toFixed(1)}%`, top: `${(Y(mi(p.arrecadado)) / 130 * 100).toFixed(1)}%` },
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
      cx, nome: m.nome, pct: fmtPct(m.pct),
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
  { label: 'Dotação Inicial', value: '724,00 mi', subLabel: 'Ano Anterior', subValue: '672,00 mi', pct: '7,74%', dir: 'up' },
  { label: 'Dotação Atualizada', value: '802,25 mi', subLabel: 'Ano Anterior', subValue: '727,50 mi', pct: '10,27%', dir: 'up' },
  { label: 'Valor Empenho', value: '545,82 mi', subLabel: 'Ano Anterior', subValue: '634,17 mi', pct: '-13,93%', dir: 'down' },
  { label: 'Valor Liquidado', value: '366,19 mi', subLabel: 'Ano Anterior', subValue: '632,31 mi', pct: '-42,09%', dir: 'down' },
  { label: 'Valor Pago', value: '360,60 mi', subLabel: 'Ano Anterior', subValue: '628,18 mi', pct: '-42,60%', dir: 'down' },
]

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

const INSIGHTS_FALLBACK = [
  'Despesa paga acumulada de 2026 soma R$ 575,9 mi, +10,5% frente ao mesmo período de 2025.',
  'Outras Despesas Correntes e Pessoal lideram os gastos pagos em 2026.',
  'Empenhado (R$ 771,3 mi) segue acima do liquidado e do pago no ano, ritmo a acompanhar.',
]

export interface FiltrosDespesa { ano: number | ''; mes: string; secretaria: string; indicador: string }

function buildQS(f: FiltrosDespesa): string {
  const p = new URLSearchParams()
  if (f.ano) p.set('ano', String(f.ano))
  if (f.mes) p.set('mes', f.mes)
  if (f.secretaria) p.set('secretaria', f.secretaria)
  if (f.indicador) p.set('indicador', f.indicador)
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Busca com retry — o túnel do agente às vezes devolve 502; sem isso o painel
// fica alternando entre dado real e o fallback antigo.
async function fetchJsonRetry(url: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) { const d = await r.json(); if (d && !d.error) return d }
    } catch { /* rede — tenta de novo */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 700 * (i + 1)))
  }
  return null
}

export default function PainelDespesa({ filtros }: { filtros: FiltrosDespesa }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [kpis, setKpis] = useState<KpiCard[]>(KPIS_FALLBACK)
  const [insights, setInsights] = useState<string[] | null>(null)
  const [despesaAno, setDespesaAno] = useState<PorAno[]>(FALLBACK_DESPESA_ANO)
  const [despesaMes, setDespesaMes] = useState<PorMes[]>(FALLBACK_DESPESA_MES)
  const [despesaCategoria, setDespesaCategoria] = useState({ correntes: 309320000, capital: 16980000 })
  const [catTree, setCatTree] = useState<CatGrupo[]>(FALLBACK_CATTREE)
  const [catDrill, setCatDrill] = useState<string | null>(null) // categoria selecionada (drill p/ grupo)
  const [fornecedores, setFornecedores] = useState<FornecedoresData>(FALLBACK_FORNECEDORES)
  const [subElemento, setSubElemento] = useState<SubElementoData>(FALLBACK_SUBELEMENTO)
  const [elementoSel, setElementoSel] = useState('TODOS')

  const qs = buildQS(filtros)

  // Ao trocar filtros, volta o drill da rosca para a raiz
  useEffect(() => { setCatDrill(null) }, [qs])

  useEffect(() => {
    let vivo = true
    fetchJsonRetry(`/api/despesa/fornecedores${qs}`).then(d => { if (vivo && d?.itens?.length) setFornecedores(d) })
    return () => { vivo = false }
  }, [qs])

  useEffect(() => {
    let vivo = true
    const sep = qs ? '&' : '?'
    fetchJsonRetry(`/api/despesa/liquidado-subelemento${qs}${sep}elemento=${encodeURIComponent(elementoSel)}`).then(d => { if (vivo && d) setSubElemento(d) })
    return () => { vivo = false }
  }, [elementoSel, qs])

  useEffect(() => {
    let vivo = true
    fetchJsonRetry(`/api/despesa/graficos${qs}`).then(d => {
      if (!vivo || !d) return
      if (d?.porAno?.length) setDespesaAno(d.porAno.map((p: { ano: number; pago: number }) => ({ ano: p.ano, arrecadado: p.pago, previsto: p.pago })))
      if (d?.porMes?.length) setDespesaMes(d.porMes)
      if (d?.categoria) setDespesaCategoria(d.categoria)
      if (d?.categoriaTree?.length) setCatTree(d.categoriaTree)
    })
    return () => { vivo = false }
  }, [qs])

  useEffect(() => {
    let vivo = true
    fetchJsonRetry(`/api/despesa/kpis${qs}`).then(d => { if (vivo && d?.kpis?.length) setKpis(d.kpis) })
    return () => { vivo = false }
  }, [qs])

  useEffect(() => {
    let vivo = true
    fetchJsonRetry('/api/despesa/insights').then(d => { if (vivo) setInsights(d?.insights?.length ? d.insights : INSIGHTS_FALLBACK) })
    return () => { vivo = false }
  }, [])

  const tipReport = tip && tip.chart === 'report' ? tip : null
  const tipArrec = tip && tip.chart === 'arrec' ? tip : null

  const gl = geomLinha(despesaAno)
  const gb = geomBar(despesaMes)

  // Donut Liquidado por Categoria/Grupo
  const catTotal = despesaCategoria.correntes + despesaCategoria.capital
  const donutC = 2 * Math.PI * 66
  let _off = 0
  const donut = [
    { nome: 'DESPESAS CORRENTES', v: despesaCategoria.correntes, cor: '#283e93' },
    { nome: 'DESPESAS DE CAPITAL', v: despesaCategoria.capital, cor: '#e8962e' },
  ].map(p => {
    const len = catTotal ? (p.v / catTotal) * donutC : 0
    const seg = { ...p, len, off: -_off, pct: catTotal ? (p.v / catTotal) * 100 : 0 }
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
    <>
      {/* ===== KPIs ===== */}
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
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Despesas por Ano</span>
            <span style={reportBadge}>Anual</span>
          </div>
          <div style={{ marginTop: 16, height: 240 }}>
            <AreaSerie
              data={despesaAno.map(p => ({ ano: p.ano, valor: p.arrecadado }))}
              cor="#283e93"
              nome="Pago"
              fmtValor={fmtMi}
              fmtEixoY={(v) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            />
          </div>
        </div>

        {/* Insights de Despesas */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Despesas</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de Despesas</div>
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

        {/* Liquidado por SubElemento */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Liquidado por SubElemento</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#9098a8' }}>Elemento:</span>
              <select
                value={elementoSel}
                onChange={e => setElementoSel(e.target.value)}
                style={{ fontSize: 11, fontWeight: 600, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 10, padding: '4px 8px', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', maxWidth: 140 }}
              >
                <option value="TODOS">TODOS</option>
                {subElemento.elementos.map(el => (
                  <option key={el} value={el}>{el}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {subElemento.itens.length === 0 ? (
              <span style={{ fontSize: 12, color: '#9098a8' }}>Sem dados para este elemento.</span>
            ) : (
              subElemento.itens.map((it, i) => {
                const max = subElemento.itens[0]?.liquidado || 1
                const pct = Math.max(2, (it.liquidado / max) * 100)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 140, flex: 'none', fontSize: 10.5, color: '#3a4256', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.subelemento}>{it.subelemento}</span>
                    <div style={{ flex: 1, height: 14, background: '#eef1f7', borderRadius: 7, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct.toFixed(1)}%`, background: 'linear-gradient(90deg,#283e93 0%,#5870c4 100%)', borderRadius: 7 }} />
                    </div>
                    <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: '#283e93', minWidth: 48, textAlign: 'right' }}>{fmtM(it.liquidado)}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ===== ROW 2 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.75fr 1fr', gap: 18, marginTop: 18 }}>

        {/* Liquidado por Mês */}
        <div style={{ position: 'relative', background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Liquidado por Mês</span>
            <div style={{ display: 'flex', gap: 22, fontSize: 12, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Ano Anterior</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#e8962e' }}></span>Ano Atual</span>
            </div>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 16, cursor: 'pointer' }}>
            <svg viewBox="0 0 1080 380" width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="arrAnt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#b9c4e8" /></linearGradient>
                <linearGradient id="arrAtu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8962e" /><stop offset="100%" stopColor="#f5d7a6" /></linearGradient>
              </defs>
              <line x1="8" y1={gb.bottom} x2="1072" y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              <line x1="8" y1={gb.yMedia.toFixed(1)} x2="1072" y2={gb.yMedia.toFixed(1)} stroke="#c9d6ee" strokeWidth="1.6" strokeDasharray="5 5" />
              <text x="1066" y={(gb.yMedia - 7).toFixed(1)} fontSize="12" fill="#5b6477" style={axisFont} textAnchor="end">Média {fmtMi(gb.media)}</text>
              {gb.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.ant.x.toFixed(1)} y={b.ant.y.toFixed(1)} width="24" height={b.ant.h.toFixed(1)} rx="6" fill="url(#arrAnt)" />
                  {b.atu ? <rect x={b.atu.x.toFixed(1)} y={b.atu.y.toFixed(1)} width="24" height={b.atu.h.toFixed(1)} rx="6" fill="url(#arrAtu)" /> : null}
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

        {/* Liquidado por Categoria/Grupo — com DRILL de 1 nível (Categoria → Grupo) */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Liquidado por Categoria / Grupo</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#283e93', marginTop: 4 }}>{fmtReais(catTotal)}</div>
          {catDrill ? (() => {
            const grupos = catTree.filter(n => n.cat === catDrill).sort((a, b) => b.v - a.v)
            const totalG = grupos.reduce((s, n) => s + n.v, 0)
            const paleta = ['#283e93', '#e8962e', '#1fa463', '#8094d6', '#aab8e3', '#5870c4', '#d6a24a']
            let offG = 0
            const segG = grupos.map((n, i) => {
              const len = totalG ? (n.v / totalG) * donutC : 0
              const seg = { grupo: n.grupo, v: n.v, cor: paleta[i % paleta.length], len, off: -offG, pct: totalG ? (n.v / totalG) * 100 : 0 }
              offG += len
              return seg
            })
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                  <span title={catDrill} style={{ fontSize: 11, fontWeight: 600, color: '#5b6477', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catDrill}</span>
                  <button onClick={() => setCatDrill(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, flex: 'none' }}>‹ Voltar</button>
                </div>
                {segG.length ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                      <svg viewBox="0 0 200 200" width="200" height="200">
                        <g transform="rotate(-90 100 100)">
                          {segG.map((s, i) => (
                            <circle key={i} cx="100" cy="100" r="66" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)} />
                          ))}
                        </g>
                      </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
                      {segG.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                          <span title={s.grupo} style={{ flex: 1, fontSize: 12, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.grupo}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44', flex: 'none' }}>{fmtCompact(s.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div style={{ fontSize: 12, color: '#9098a8', padding: '24px 0', textAlign: 'center' }}>Sem grupos neste nível.</div>}
              </>
            )
          })() : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                <svg viewBox="0 0 200 200" width="210" height="210">
                  <g transform="rotate(-90 100 100)">
                    {donut.map((s, i) => (
                      <circle key={i} cx="100" cy="100" r="66" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)} />
                    ))}
                  </g>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 16 }}>
                {donut.map((s, i) => {
                  const temGrupo = catTree.some(n => n.cat === s.nome)
                  return (
                    <div key={i} onClick={() => { if (temGrupo) setCatDrill(s.nome) }} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: temGrupo ? 'pointer' : 'default' }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                      <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.nome}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtCompact(s.v)} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
                    </div>
                  )
                })}
              </div>
              {catTree.length ? <div style={{ marginTop: 12, fontSize: 10.5, color: '#aeb6c6' }}>Clique numa categoria para ver os grupos</div> : null}
            </>
          )}
        </div>
      </div>

      {/* ===== Fornecedores - Valor de Liquidado (tabela) ===== */}
      <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Fornecedores - Valor de Liquidado</span>
          <span style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 14, padding: '6px 16px' }}>Top 10</span>
        </div>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Fornecedores', 'Empenhado', 'Liquidado', 'Pago'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedores.itens.map((f, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={f.doc}>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{f.doc} {f.nome}</td>
                    {[f.empenhado, f.liquidado, f.pago].map((v, ci) => (
                      <td key={ci} style={{ background: cellBg, color: v === 0 ? '#9098a8' : '#c0612a', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{v === 0 ? '—' : fmtReais(v)}</td>
                    ))}
                  </tr>
                )
              })}
              <tr>
                <td style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 700, padding: '10px 16px', borderRight: '1px solid rgba(255,255,255,0.18)' }}>Total</td>
                {[fornecedores.total.empenhado, fornecedores.total.liquidado, fornecedores.total.pago].map((v, ci) => (
                  <td key={ci} style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 700, padding: '10px 16px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{fmtReais(v)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
