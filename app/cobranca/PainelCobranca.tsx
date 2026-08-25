'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, type BarRectangleItem } from 'recharts'
import LoadingOverlay, { Spinner } from '../_components/LoadingOverlay'
import { fmtAbrev } from '@/lib/fmt-grafico'
import { baixarRelatorioPdf, baixarRelatorioExcel, type DadosRelatorio } from '../_components/relatorioTributo'

interface Trib { nome: string; lancado: number; arrecadado: number; saldo: number; conversao: number }
interface Devedor { cd: number; nome: string; cpfCnpj: string; saldo: number; endereco?: string }
interface PotTrib { nome: string; codigos: number[]; vencido: number; aVencer: number }
interface Potencial { vencido: number; aVencer: number; porTributo: PotTrib[] }
interface PotMes { ano: number; mes: number; saldo: number; vencido: boolean }
interface DamMes { mes: number; qt: number; pagas: number }
interface DamTributo { nome: string; codigos: number[]; qt: number; pagas: number }
interface DamOperador { nome: string; qt: number; pagas: number }
interface DamsGeradas { ano: number; total: number; totalPagas: number; porMes: DamMes[]; porTributo: DamTributo[]; porOperador: DamOperador[] }
interface ResultadoMes { mes: number; geradas: number; recebidas: number; pagas: number }
interface ResultadoMensal { ano: number; totalGeradas: number; totalRecebidas: number; totalPagas: number; porMes: ResultadoMes[] }
interface ComparativoDamIdMes { mes: number; geradas: number; pagas: number }
interface ComparativoDamId { ano: number; totalGeradas: number; totalPagas: number; porMes: ComparativoDamIdMes[] }
interface ConversaoItem { nome: string; lancado: number; arrecadado: number; conversao: number }
interface AnaliseConversao { ano: number; porTributo: ConversaoItem[]; porPeriodo: ConversaoItem[]; porOperador: ConversaoItem[] }
interface Resumo {
  ano: number; lancado: number; arrecadado: number; saldo: number; conversao: number; totalBaixas: number
  tributos: Trib[]
  canais: { nome: string; n: number }[]
  baixasPorAno: { ano: number; n: number }[]
}

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const fmtData = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'

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

const FALLBACK_DAMS: DamsGeradas = {
  ano: 2025, total: 1240924, totalPagas: 247272,
  porMes: [
    { mes: 1, qt: 73192, pagas: 13894 }, { mes: 2, qt: 43244, pagas: 28583 }, { mes: 3, qt: 44118, pagas: 27506 }, { mes: 4, qt: 30754, pagas: 25113 },
    { mes: 5, qt: 22646, pagas: 24119 }, { mes: 6, qt: 42330, pagas: 23982 }, { mes: 7, qt: 23636, pagas: 23929 }, { mes: 8, qt: 23447, pagas: 23123 },
    { mes: 9, qt: 24308, pagas: 23499 }, { mes: 10, qt: 23563, pagas: 23066 }, { mes: 11, qt: 42396, pagas: 19145 }, { mes: 12, qt: 847290, pagas: 10238 },
  ],
  porTributo: [
    { nome: 'Documento de Arrecadacao', codigos: [20], qt: 1033997, pagas: 206799 },
    { nome: 'ISS - Simples Nacional', codigos: [301], qt: 66095, pagas: 13219 },
    { nome: 'IPTU', codigos: [1], qt: 31689, pagas: 6338 },
    { nome: 'Taxa de Contribuição Ambiental (TCA)', codigos: [67], qt: 30786, pagas: 6157 },
    { nome: 'ISS - Simples Nacional Dívida Ativa', codigos: [303], qt: 24434, pagas: 4887 },
    { nome: 'I.S.S.Q.N.', codigos: [3], qt: 10390, pagas: 2078 },
    { nome: 'Taxa de Fiscalização de Estabelecimento', codigos: [2002], qt: 10051, pagas: 2010 },
  ],
  porOperador: [
    { nome: 'CalebeAM', qt: 827806, pagas: 165561 }, { nome: 'Schedule', qt: 107300, pagas: 21460 }, { nome: 'Internet', qt: 48198, pagas: 9640 },
    { nome: 'KellyCPS', qt: 41174, pagas: 8235 }, { nome: 'BeatrizPS', qt: 33249, pagas: 6650 }, { nome: 'Arquimedes', qt: 18910, pagas: 3782 },
  ],
}

const FALLBACK_RESULTADO: ResultadoMensal = {
  ano: 2025, totalGeradas: 1240924, totalRecebidas: 294786, totalPagas: 268000,
  porMes: [
    { mes: 1, geradas: 73192, recebidas: 16297, pagas: 14000 }, { mes: 2, geradas: 43244, recebidas: 30827, pagas: 28706 },
    { mes: 3, geradas: 44118, recebidas: 29493, pagas: 27675 }, { mes: 4, geradas: 30754, recebidas: 27124, pagas: 25276 },
    { mes: 5, geradas: 22646, recebidas: 26331, pagas: 24265 }, { mes: 6, geradas: 42330, recebidas: 26188, pagas: 24114 },
    { mes: 7, geradas: 23636, recebidas: 25939, pagas: 24057 }, { mes: 8, geradas: 23447, recebidas: 24847, pagas: 23250 },
    { mes: 9, geradas: 24308, recebidas: 25272, pagas: 23668 }, { mes: 10, geradas: 23563, recebidas: 25477, pagas: 23178 },
    { mes: 11, geradas: 42396, recebidas: 24687, pagas: 19201 }, { mes: 12, geradas: 847290, recebidas: 12304, pagas: 10367 },
  ],
}

const FALLBACK_COMP_DAM_ID: ComparativoDamId = {
  ano: 2025, totalGeradas: 1240924, totalPagas: 247272,
  porMes: [
    { mes: 1, geradas: 73192, pagas: 13894 }, { mes: 2, geradas: 43244, pagas: 28583 },
    { mes: 3, geradas: 44118, pagas: 27506 }, { mes: 4, geradas: 30754, pagas: 25113 },
    { mes: 5, geradas: 22646, pagas: 24119 }, { mes: 6, geradas: 42330, pagas: 23982 },
    { mes: 7, geradas: 23636, pagas: 23929 }, { mes: 8, geradas: 23447, pagas: 23123 },
    { mes: 9, geradas: 24308, pagas: 23499 }, { mes: 10, geradas: 23563, pagas: 23066 },
    { mes: 11, geradas: 42396, pagas: 19145 }, { mes: 12, geradas: 847290, pagas: 10238 },
  ],
}

const FALLBACK_ANALISE: AnaliseConversao = {
  ano: 2025,
  porTributo: [
    { nome: 'IPTU', lancado: 124458245.38, arrecadado: 69722847.06, conversao: 56.0 },
    { nome: 'ITBI', lancado: 46855166.3, arrecadado: 22786236.26, conversao: 48.6 },
    { nome: 'I.S.S.Q.N. - Tomador', lancado: 32784232.05, arrecadado: 30951146.65, conversao: 94.4 },
    { nome: 'I.S.S.Q.N.', lancado: 28623756.56, arrecadado: 23370130.1, conversao: 81.6 },
    { nome: 'Taxa de Fiscalização de Estabelecimento', lancado: 17615267.82, arrecadado: 6181592.52, conversao: 35.1 },
  ],
  porPeriodo: [
    { nome: '2021', lancado: 289801861.8, arrecadado: 123971395.34, conversao: 42.8 },
    { nome: '2022', lancado: 287222858.68, arrecadado: 126163038.17, conversao: 43.9 },
    { nome: '2023', lancado: 298463992.66, arrecadado: 149773589.34, conversao: 50.2 },
    { nome: '2024', lancado: 359866298.18, arrecadado: 166314389.46, conversao: 46.2 },
    { nome: '2025', lancado: 305107766.15, arrecadado: 186251990.56, conversao: 61.0 },
  ],
  porOperador: [
    { nome: 'Arquimedes', lancado: 139095937.47, arrecadado: 77725602.16, conversao: 55.9 },
    { nome: 'BeatrizPS', lancado: 21721801.66, arrecadado: 6879338.74, conversao: 31.7 },
    { nome: 'Schedule', lancado: 8996615.25, arrecadado: 6967863.25, conversao: 77.4 },
    { nome: 'JoaoRSN', lancado: 5419757.08, arrecadado: 3645521.15, conversao: 67.3 },
    { nome: 'Internet', lancado: 98290260.28, arrecadado: 75503551.26, conversao: 76.8 },
  ],
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const CANAL_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e']
const convCor = (c: number) => c >= 75 ? '#1fa463' : c >= 50 ? '#e8962e' : '#d64545'
const DAM_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#eaa957', '#f0bb7c']

// Tooltip padrão da tela — mesmo visual do gráfico "Baixas Processadas por Ano" (caixa
// escura, título em branco, linhas em cinza-claro), reaproveitado nos gráficos Recharts via
// o prop `content`.
function tipBox(titulo: React.ReactNode, linhas: { texto: string; cor?: string }[]) {
  return (
    <div style={{ background: '#23304b', borderRadius: 10, padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{titulo}</div>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: i === 0 ? 3 : 2 }}>
          {l.cor ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.cor, flex: 'none' }} /> : null}
          {l.texto}
        </div>
      ))}
    </div>
  )
}

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

export default function PainelCobranca({ ano, mes, onLimparMes }: { ano: number; mes?: number; onLimparMes?: () => void }) {
  const [d, setD] = useState<Resumo | null>(null)
  const [tip, setTip] = useState<{ left: string; top: string; ano: number; n: number } | null>(null)
  const [tipQV, setTipQV] = useState<{ left: number; top: number; label: string; saldo: number } | null>(null)
  const [tipDam, setTipDam] = useState<{ left: number; top: number; label: string; qt: number; pagas: number } | null>(null)
  const [tipResultado, setTipResultado] = useState<{ left: number; top: number; label: string; geradas: number; recebidas: number; pagas: number } | null>(null)
  const [tipCompDamId, setTipCompDamId] = useState<{ left: number; top: number; label: string; geradas: number; pagas: number } | null>(null)
  const [potencial, setPotencial] = useState<Potencial | null>(null)
  const [potSel, setPotSel] = useState<PotTrib | null>(null)
  const [potMensal, setPotMensal] = useState<PotMes[] | null>(null)
  const [potMesSel, setPotMesSel] = useState<PotMes | null>(null)
  const [devedoresMes, setDevedoresMes] = useState<Devedor[] | null>(null)
  const [devedoresMesErro, setDevedoresMesErro] = useState(false)
  const [dams, setDams] = useState<DamsGeradas | null>(null)
  const [resultado, setResultado] = useState<ResultadoMensal | null>(null)
  const [compDamId, setCompDamId] = useState<ComparativoDamId | null>(null)
  const [analise, setAnalise] = useState<AnaliseConversao | null>(null)
  // null = usuário ainda não escolheu uma lente — a Análise de Conversão exibe "Por Tributo"
  // como padrão visual, mas o painel de DAM ao lado só detalha por tributo/período/operador
  // depois que uma lente for de fato clicada (ver uso de conversaoDim no painel de DAM).
  const [conversaoDim, setConversaoDim] = useState<'tributo' | 'periodo' | 'operador' | null>(null)
  const [buscaConversao, setBuscaConversao] = useState('')
  const [ordemConversao, setOrdemConversao] = useState<'desc' | 'asc'>('desc')
  // Drill de 2º nível do painel DAM — ao clicar num tributo/operador em "Por Tributo"/"Por
  // Operador", mostra geradas × pagas por mês só daquele item (não os 3 podem coexistir: um
  // exclui o outro, e trocar de lente ou de ano/mês limpa a seleção).
  const [damDrillTributo, setDamDrillTributo] = useState<DamTributo | null>(null)
  const [damDrillOperador, setDamDrillOperador] = useState<DamOperador | null>(null)
  const [damDrillMesData, setDamDrillMesData] = useState<DamMes[] | null>(null)
  const [tipDamDrill, setTipDamDrill] = useState<{ left: number; top: number; label: string; qt: number; pagas: number } | null>(null)
  const [buscaDam, setBuscaDam] = useState('')
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const [dataAtualizacao, setDataAtualizacao] = useState<string | null>(null)

  useEffect(() => {
    setD(null)
    setPotencial(null)
    setDams(null)
    setResultado(null)
    setCompDamId(null)
    setAnalise(null)
    setPotSel(null)
    setPotMensal(null)
    setPotMesSel(null)
    setDevedoresMes(null)
    setDevedoresMesErro(false)
    setDamDrillTributo(null)
    setDamDrillOperador(null)
    setDamDrillMesData(null)
    setBuscaDam('')
    const sufMes = mes ? `&mes=${mes}` : ''
    fetch(`/api/cobranca/resumo?ano=${ano}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => {
        if (x && !x.error && typeof x.lancado === 'number') setD(x)
        if (x && !x.error) setDataAtualizacao(x.dataAtualizacao ?? null)
      }).catch(() => {})
    fetch(`/api/cobranca/potencial?ano=${ano}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.vencido === 'number') setPotencial(x) }).catch(() => {})
    fetch(`/api/cobranca/dams?ano=${ano}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.total === 'number') setDams(x) }).catch(() => {})
    fetch(`/api/cobranca/resultado-mensal?ano=${ano}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.totalGeradas === 'number') setResultado(x) }).catch(() => {})
    fetch(`/api/cobranca/comparativo-dam-id?ano=${ano}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.totalGeradas === 'number') setCompDamId(x) }).catch(() => {})
    fetch(`/api/cobranca/analise-conversao?ano=${ano}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && Array.isArray(x.porTributo)) setAnalise(x) }).catch(() => {})
  }, [ano, mes])

  function selecionarPotencial(t: PotTrib) {
    setPotMesSel(null)
    setDevedoresMes(null)
    setDevedoresMesErro(false)
    if (potSel?.nome === t.nome) { setPotSel(null); setPotMensal(null); return }
    setPotSel(t)
    setPotMensal(null)
    const qs = new URLSearchParams({ codigos: t.codigos.join(','), ano: String(g.ano), ...(mes ? { mes: String(mes) } : {}) })
    fetch(`/api/cobranca/potencial-mensal?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => { if (res && !res.error && Array.isArray(res.itens)) setPotMensal(res.itens) }).catch(() => {})
  }

  function buscarDevedoresMes(m: PotMes) {
    if (!potSel) return
    setDevedoresMes(null)
    setDevedoresMesErro(false)
    const qs = new URLSearchParams({ codigos: potSel.codigos.join(','), anoVenc: String(m.ano), mesVenc: String(m.mes) })
    fetch(`/api/cobranca/devedores-tributo-mes?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res && !res.error && Array.isArray(res.itens)) setDevedoresMes(res.itens)
        else setDevedoresMesErro(true)
      }).catch(() => setDevedoresMesErro(true))
  }

  function selecionarMes(m: PotMes) {
    if (!potSel) return
    if (potMesSel && potMesSel.ano === m.ano && potMesSel.mes === m.mes) { setPotMesSel(null); setDevedoresMes(null); setDevedoresMesErro(false); return }
    setPotMesSel(m)
    buscarDevedoresMes(m)
  }

  function selecionarDamTributo(t: DamTributo) {
    if (damDrillTributo?.nome === t.nome) { setDamDrillTributo(null); setDamDrillMesData(null); return }
    setDamDrillOperador(null)
    setDamDrillTributo(t)
    setDamDrillMesData(null)
    const qs = new URLSearchParams({ tipo: 'tributo', codigos: t.codigos.join(','), ano: String(ano), ...(mes ? { mes: String(mes) } : {}) })
    fetch(`/api/cobranca/dams-drill-mes?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => { if (res && !res.error && Array.isArray(res.porMes)) setDamDrillMesData(res.porMes) }).catch(() => {})
  }

  function selecionarDamOperador(o: DamOperador) {
    if (damDrillOperador?.nome === o.nome) { setDamDrillOperador(null); setDamDrillMesData(null); return }
    setDamDrillTributo(null)
    setDamDrillOperador(o)
    setDamDrillMesData(null)
    const qs = new URLSearchParams({ tipo: 'operador', nome: o.nome, ano: String(ano), ...(mes ? { mes: String(mes) } : {}) })
    fetch(`/api/cobranca/dams-drill-mes?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => { if (res && !res.error && Array.isArray(res.porMes)) setDamDrillMesData(res.porMes) }).catch(() => {})
  }

  const g = d ?? FALLBACK
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
    febraban ? `O canal bancário (Febraban) processa ${fmtPct(febraban.n / totCanais * 100)} das baixas — principal meio de arrecadação.` : `${fmtInt(g.totalBaixas)} baixas processadas em ${g.ano}.`,
  ]

  const kpis = [
    { label: `Lançado ${g.ano}`, value: fmtMoney(g.lancado), subLabel: 'todos os tributos', subValue: '', pct: '', cor: '#fff' },
    { label: 'Arrecadado', value: fmtMoney(g.arrecadado), subLabel: 'do lançado', subValue: fmtPct(g.conversao), pct: '', cor: '' },
    { label: 'Conversão', value: fmtPct(g.conversao), subLabel: 'arrecadado / lançado', subValue: '', pct: '', cor: '' },
    { label: 'Potencial a Recuperar', value: fmtMoney(g.saldo), subLabel: 'inadimplência', subValue: '', pct: '', cor: '' },
    { label: 'Baixas Processadas', value: fmtInt(g.totalBaixas), subLabel: `no exercício ${g.ano}`, subValue: '', pct: '', cor: '' },
  ]

  // Relatório (PDF/Excel): cards = KPIs da tela; tabela = conversão por tributo (mesma
  // usada na tabela final da página).
  async function gerarRelatorio(tipo: 'pdf' | 'excel') {
    if (!g.tributos.length || gerandoRelatorio) return
    setGerandoRelatorio(true)
    try {
      const dados: DadosRelatorio = {
        titulo: `Cobrança — Exercício ${g.ano}${mes ? ` (até ${MESES_ABREV[mes - 1]})` : ''}`,
        subtitulo: `Lançado ${fmtReais(g.lancado)} · Arrecadado ${fmtReais(g.arrecadado)} (${fmtPct(g.conversao)})`,
        cards: kpis.map(k => ({ rotulo: k.label, valor: k.value })),
        colunas: ['Tributo', 'Lançado', 'Arrecadado', 'A Recuperar', 'Conversão'],
        linhas: g.tributos.map(t => [t.nome, fmtReais(t.lancado), fmtReais(t.arrecadado), fmtReais(t.saldo), fmtPct(t.conversao)]),
        arquivo: `Cobranca-${g.ano}`,
      }
      const fn = tipo === 'pdf' ? baixarRelatorioPdf : baixarRelatorioExcel
      await fn(dados)
    } catch {
      alert('Não foi possível gerar o relatório. Tente novamente.')
    } finally {
      setGerandoRelatorio(false)
    }
  }

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

      {/* Barra de relatórios (Excel/PDF a partir dos KPIs + conversão por tributo) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, margin: '0 4px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['pdf', 'Baixar PDF'], ['excel', 'Baixar Excel']] as const).map(([tp, lbl]) => (
            <button key={tp} onClick={() => gerarRelatorio(tp)} disabled={gerandoRelatorio} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e3e9f5', background: '#fff', color: '#283e93', fontWeight: 600, cursor: gerandoRelatorio ? 'default' : 'pointer', opacity: gerandoRelatorio ? 0.6 : 1, borderRadius: 12, padding: '7px 14px', fontSize: 12, fontFamily: 'inherit' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>{gerandoRelatorio ? 'Gerando…' : lbl}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#5b6477', background: '#fff', borderRadius: 20, padding: '6px 14px', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
          Dados atualizados em <b style={{ color: '#283e93' }}>{fmtData(dataAtualizacao)}</b>
        </span>
      </div>

      {/* Banner de filtro global por mês (acumulado até o mês selecionado) */}
      {mes ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#eef1fb', border: '1px solid #d6ddf6', borderRadius: 12, padding: '8px 14px', margin: '14px 4px 0' }}>
          <span style={{ fontSize: 12.5, color: '#283e93', fontWeight: 600 }}>Toda a tela filtrada pelo mês: <b>até {MESES[mes - 1]}</b></span>
          <button onClick={onLimparMes} style={{ border: 'none', background: '#283e93', color: '#fff', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontFamily: 'inherit' }}>Limpar filtro</button>
        </div>
      ) : null}

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

      {/* Análise de Conversão — arrecadado ÷ lançado sob 3 lentes selecionáveis: por tributo,
          por período (exercício de lançamento) e por operador (cd_usuario_gerador da guia,
          pesando o valor $ em vez da contagem — revela se guias autoemitidas têm conversão
          pior do que as trabalhadas por atendentes). Painel ao lado: DAMs geradas por data,
          tributo e operador (tb_dsod_guias, dt_geracao). Sobe pra ficar logo abaixo dos KPIs,
          a pedido do usuário. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginTop: 20, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Análise de Conversão</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Arrecadado ÷ lançado — {(analise ?? FALLBACK_ANALISE).ano}, sob 3 lentes.</div>
            </div>
            <div style={{ display: 'flex', background: '#f4f7fc', borderRadius: 12, padding: 3, gap: 2 }}>
              {([['tributo', 'Por Tributo'], ['periodo', 'Por Período'], ['operador', 'Por Operador']] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setConversaoDim(key); setBuscaConversao(''); setDamDrillTributo(null); setDamDrillOperador(null); setBuscaDam('') }}
                  style={{
                    border: 'none', borderRadius: 9, padding: '6px 13px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    background: (conversaoDim ?? 'tributo') === key ? '#283e93' : 'transparent',
                    color: (conversaoDim ?? 'tributo') === key ? '#fff' : '#5b6477',
                    transition: 'background .15s, color .15s',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const an = analise ?? FALLBACK_ANALISE
            const dimAtual = conversaoDim ?? 'tributo'
            const itens = dimAtual === 'tributo' ? an.porTributo : dimAtual === 'periodo' ? an.porPeriodo : an.porOperador
            if (!itens.length) return <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem dados para esta visão.</div>
            // Por Período ordena pelo ano (não pelo lançado) — "maior p/ menor" = mais recente
            // primeiro, o que faz mais sentido pra uma linha do tempo do que ordenar por valor.
            const valorOrdenacao = (item: ConversaoItem) => dimAtual === 'periodo' ? Number(item.nome) : item.lancado
            const itensFiltrados = (buscaConversao.trim()
              ? itens.filter(i => i.nome.toLowerCase().includes(buscaConversao.trim().toLowerCase()))
              : [...itens]
            ).sort((a, b) => ordemConversao === 'desc' ? valorOrdenacao(b) - valorOrdenacao(a) : valorOrdenacao(a) - valorOrdenacao(b))
            const maxLanc = Math.max(1, ...itensFiltrados.map(i => i.lancado))
            const placeholderLabel = dimAtual === 'tributo' ? 'tributo' : dimAtual === 'periodo' ? 'período' : 'operador'
            // "Por Operador" traz todos os atendentes nomeados (sem cortar num "Demais") — pode
            // passar de 80 linhas. Altura travada com scroll interno pra não esticar o card;
            // Por Tributo/Por Período (poucos itens) cabem inteiros aqui, sem barra de rolagem.
            return (
              <>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '7px 12px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <input value={buscaConversao} onChange={e => setBuscaConversao(e.target.value)} placeholder={`Buscar por ${placeholderLabel}…`}
                      style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
                    {buscaConversao ? (
                      <button onClick={() => setBuscaConversao('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9098a8', fontSize: 13, padding: 0, flex: 'none', lineHeight: 1 }}>✕</button>
                    ) : null}
                  </div>
                  <button onClick={() => setOrdemConversao(o => o === 'desc' ? 'asc' : 'desc')} title={dimAtual === 'periodo' ? 'Ordenar por ano' : 'Ordenar por lançado'}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #e3e8f1', background: '#fff', borderRadius: 12, padding: '7px 12px', fontSize: 11.5, fontWeight: 600, color: '#3a4256', cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}>
                    {ordemConversao === 'desc' ? '↓ Maior p/ menor' : '↑ Menor p/ maior'}
                  </button>
                </div>
                {!itensFiltrados.length ? (
                  <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Nenhum resultado para &quot;{buscaConversao}&quot;.</div>
                ) : (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 13, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
                {itensFiltrados.map(item => {
                  const cor = convCor(item.conversao)
                  const w = Math.max(3, 100 * item.lancado / maxLanc)
                  return (
                    <div key={item.nome}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4, gap: 8 }}>
                        <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, flex: 'none', textAlign: 'right' }}>
                          {fmtPct(item.conversao)}
                          <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#9098a8' }}>{fmtAbrev(item.arrecadado)} de {fmtAbrev(item.lancado)} lançado</span>
                        </span>
                      </div>
                      <div style={{ height: 13, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: cor, borderRadius: 5 }} />
                      </div>
                    </div>
                  )
                })}
                </div>
                )}
              </>
            )
          })()}
        </div>

        {/* Companion panel — Documentos de Arrecadação Municipal (DAM) gerados. O total fica
            sempre visível; o detalhe por tributo/período(mês)/operador só aparece depois que
            uma lente for escolhida em "Análise de Conversão" (mesmo estado conversaoDim),
            mostrando só a lente correspondente. "Internet" = autoatendimento pelo portal;
            "Schedule" = geração automática agendada. */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Documentos de Arrecadação Municipal (DAM)</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Guias geradas × pagas (DAM distintas) — {(dams ?? FALLBACK_DAMS).ano}. Detalhe por tributo, período ou operador conforme a lente escolhida em Análise de Conversão.</div>
            </div>
            <span style={reportBadge}>Geradas × Pagas</span>
          </div>

          {(() => {
            const dm = dams ?? FALLBACK_DAMS
            const mesPico = [...dm.porMes].sort((a, b) => b.qt - a.qt)[0]
            const operPico = dm.porOperador[0]
            const pctMesPico = dm.total ? (mesPico.qt / dm.total) * 100 : 0
            const pctOperPico = dm.total && operPico ? (operPico.qt / dm.total) * 100 : 0
            const pctPagasTotal = dm.total ? (dm.totalPagas / dm.total) * 100 : 0
            return (
              <>
                <div style={{ marginTop: 12, background: '#283e93', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total de DAMs geradas em {dm.ano}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtInt(dm.total)}</span>
                </div>
                <div style={{ marginTop: 8, background: '#1fa463', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total de DAMs pagas em {dm.ano}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtInt(dm.totalPagas)} <span style={{ fontSize: 11, fontWeight: 600 }}>({fmtPct(pctPagasTotal)})</span></span>
                </div>
                {!dams ? null : (
                  <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 8, lineHeight: 1.5 }}>
                    {MESES_ABREV[mesPico.mes - 1]}/{dm.ano} concentra {fmtInt(mesPico.qt)} guias ({fmtPct(pctMesPico)} do ano){operPico ? ` · ${operPico.nome} gerou ${fmtInt(operPico.qt)} (${fmtPct(pctOperPico)} do total)` : ''}.
                  </div>
                )}

                {!conversaoDim ? (
                  <div style={{ marginTop: 18, minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#9098a8', maxWidth: 260 }}>
                      Selecione uma lente em &quot;Análise de Conversão&quot; (Por Tributo, Por Período ou Por Operador) para detalhar as DAMs geradas.
                    </div>
                  </div>
                ) : conversaoDim === 'periodo' ? (
                  <>
                    <div style={{ marginTop: 18, fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por período (mês)</div>
                    <div style={{ height: 180, marginTop: 10, position: 'relative' }} onMouseLeave={() => setTipDam(null)}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dm.porMes.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 30, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                          <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={1} />
                          <YAxis width={40} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                          <Legend wrapperStyle={{ fontSize: 10.5 }} />
                          <Bar dataKey="qt" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={22}
                            onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDam({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt, pagas: p.pagas }) }}
                            onMouseLeave={() => setTipDam(null)} />
                          <Bar dataKey="pagas" name="Pagas" fill="#1fa463" radius={[4, 4, 0, 0]} maxBarSize={22}
                            onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDam({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt, pagas: p.pagas }) }}
                            onMouseLeave={() => setTipDam(null)} />
                        </BarChart>
                      </ResponsiveContainer>
                      {tipDam ? (
                        <div style={{ position: 'absolute', left: tipDam.left, top: tipDam.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                          {tipBox(tipDam.label, [
                            { texto: `Geradas: ${fmtInt(tipDam.qt)} guias`, cor: '#283e93' },
                            { texto: `Pagas: ${fmtInt(tipDam.pagas)} guias`, cor: '#1fa463' },
                          ])}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : conversaoDim === 'tributo' ? (
                  damDrillTributo ? (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span title={damDrillTributo.nome} style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{damDrillTributo.nome} — por mês</span>
                        <button onClick={() => { setDamDrillTributo(null); setDamDrillMesData(null) }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, flex: 'none' }}>‹ Voltar</button>
                      </div>
                      {!damDrillMesData ? (
                        <div style={{ height: 180, marginTop: 10, borderRadius: 12, background: '#eef1f7' }} />
                      ) : (
                        <div style={{ height: 180, marginTop: 10, position: 'relative' }} onMouseLeave={() => setTipDamDrill(null)}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={damDrillMesData.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 30, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={1} />
                              <YAxis width={40} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                              <Legend wrapperStyle={{ fontSize: 10.5 }} />
                              <Bar dataKey="qt" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={22}
                                onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDamDrill({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt, pagas: p.pagas }) }}
                                onMouseLeave={() => setTipDamDrill(null)} />
                              <Bar dataKey="pagas" name="Pagas" fill="#1fa463" radius={[4, 4, 0, 0]} maxBarSize={22}
                                onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDamDrill({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt, pagas: p.pagas }) }}
                                onMouseLeave={() => setTipDamDrill(null)} />
                            </BarChart>
                          </ResponsiveContainer>
                          {tipDamDrill ? (
                            <div style={{ position: 'absolute', left: tipDamDrill.left, top: tipDamDrill.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                              {tipBox(tipDamDrill.label, [
                                { texto: `Geradas: ${fmtInt(tipDamDrill.qt)} guias`, cor: '#283e93' },
                                { texto: `Pagas: ${fmtInt(tipDamDrill.pagas)} guias`, cor: '#1fa463' },
                              ])}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por tributo</div>
                    <div style={{ fontSize: 10, color: '#9098a8', marginTop: 2 }}>Clique num tributo pra detalhar por mês.</div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '6px 12px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                      <input value={buscaDam} onChange={e => setBuscaDam(e.target.value)} placeholder="Buscar por tributo…"
                        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 11.5, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
                      {buscaDam ? (
                        <button onClick={() => setBuscaDam('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9098a8', fontSize: 12, padding: 0, flex: 'none', lineHeight: 1 }}>✕</button>
                      ) : null}
                    </div>
                    {(() => {
                      const itens = dm.porTributo.filter(t => t.nome.toLowerCase().includes(buscaDam.trim().toLowerCase()))
                      if (!itens.length) return <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '20px 0' }}>Nenhum resultado para &quot;{buscaDam}&quot;.</div>
                      const maxTrib = Math.max(1, ...itens.map(t => t.qt))
                      return (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 11 }}>
                          {itens.map((t, i) => (
                            <div key={t.nome} onClick={() => selecionarDamTributo(t)} style={{ cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                                <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtInt(t.qt)} <span style={{ fontSize: 10, fontWeight: 600, color: '#1fa463' }}>({fmtInt(t.pagas)} pagas)</span></span>
                              </div>
                              <div style={{ height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.max(3, 100 * t.qt / maxTrib).toFixed(1)}%`, borderRadius: 5, background: /^Demais tributos/.test(t.nome) ? '#c2c9d6' : DAM_CORES[i % DAM_CORES.length] }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  )
                ) : (
                  damDrillOperador ? (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span title={damDrillOperador.nome} style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{damDrillOperador.nome} — por mês</span>
                        <button onClick={() => { setDamDrillOperador(null); setDamDrillMesData(null) }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, flex: 'none' }}>‹ Voltar</button>
                      </div>
                      {!damDrillMesData ? (
                        <div style={{ height: 180, marginTop: 10, borderRadius: 12, background: '#eef1f7' }} />
                      ) : (
                        <div style={{ height: 180, marginTop: 10, position: 'relative' }} onMouseLeave={() => setTipDamDrill(null)}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={damDrillMesData.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 30, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={1} />
                              <YAxis width={40} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                              <Legend wrapperStyle={{ fontSize: 10.5 }} />
                              <Bar dataKey="qt" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={22}
                                onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDamDrill({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt, pagas: p.pagas }) }}
                                onMouseLeave={() => setTipDamDrill(null)} />
                              <Bar dataKey="pagas" name="Pagas" fill="#1fa463" radius={[4, 4, 0, 0]} maxBarSize={22}
                                onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDamDrill({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt, pagas: p.pagas }) }}
                                onMouseLeave={() => setTipDamDrill(null)} />
                            </BarChart>
                          </ResponsiveContainer>
                          {tipDamDrill ? (
                            <div style={{ position: 'absolute', left: tipDamDrill.left, top: tipDamDrill.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                              {tipBox(tipDamDrill.label, [
                                { texto: `Geradas: ${fmtInt(tipDamDrill.qt)} guias`, cor: '#283e93' },
                                { texto: `Pagas: ${fmtInt(tipDamDrill.pagas)} guias`, cor: '#1fa463' },
                              ])}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por operador</div>
                    <div style={{ fontSize: 10, color: '#9098a8', marginTop: 2 }}>Clique num operador pra detalhar por mês.</div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '6px 12px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                      <input value={buscaDam} onChange={e => setBuscaDam(e.target.value)} placeholder="Buscar por operador…"
                        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 11.5, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
                      {buscaDam ? (
                        <button onClick={() => setBuscaDam('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9098a8', fontSize: 12, padding: 0, flex: 'none', lineHeight: 1 }}>✕</button>
                      ) : null}
                    </div>
                    {/* Traz todos os atendentes nomeados (sem cortar num "Demais") — pode passar
                        de 70 linhas. Altura travada com scroll interno pra não esticar o card. */}
                    {(() => {
                      const itens = dm.porOperador.filter(o => o.nome.toLowerCase().includes(buscaDam.trim().toLowerCase()))
                      if (!itens.length) return <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '20px 0' }}>Nenhum resultado para &quot;{buscaDam}&quot;.</div>
                      const maxOper = Math.max(1, ...itens.map(o => o.qt))
                      return (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 11, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                          {itens.map((o, i) => (
                            <div key={o.nome} onClick={() => selecionarDamOperador(o)} style={{ cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                                <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nome}</span>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtInt(o.qt)} <span style={{ fontSize: 10, fontWeight: 600, color: '#1fa463' }}>({fmtInt(o.pagas)} pagas)</span></span>
                              </div>
                              <div style={{ height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.max(3, 100 * o.qt / maxOper).toFixed(1)}%`, borderRadius: 5, background: o.nome === 'Internet' ? '#c2c9d6' : CANAL_CORES[i % CANAL_CORES.length] }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  )
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Resultado Mensal da Arrecadação — DAM Geradas × DAM Recebidas pelo setor de
          Cobrança, por mês. São eventos independentes (data de geração da guia vs. data da
          baixa/pagamento); uma guia gerada num mês só "vira" recebida quando o contribuinte
          efetivamente paga, meses depois. Sobe pra ficar logo abaixo de "Análise de Conversão",
          a pedido do usuário. */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Resultado Mensal da Arrecadação</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>DAM Geradas × DAM Recebidas × DAM Pagas pelo setor de Cobrança, por mês — {(resultado ?? FALLBACK_RESULTADO).ano}.</div>
          </div>
          <span style={reportBadge}>Geradas × Recebidas × Pagas</span>
        </div>

        {(() => {
          const rm = resultado ?? FALLBACK_RESULTADO
          const pctRecebidas = rm.totalGeradas ? (rm.totalRecebidas / rm.totalGeradas) * 100 : 0
          const pctPagas = rm.totalRecebidas ? (rm.totalPagas / rm.totalRecebidas) * 100 : 0
          const mesDestaque = [...rm.porMes].sort((a, b) => (b.geradas - b.recebidas) - (a.geradas - a.recebidas))[0]
          return (
            <>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                <div style={{ background: '#eef1fb', border: '1px solid #cdd5ef', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>DAM Geradas em {rm.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(rm.totalGeradas)}</div>
                </div>
                <div style={{ background: '#fdf3e6', border: '1px solid #f2ddb8', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#c07a2e' }}>DAM Recebidas em {rm.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(rm.totalRecebidas)}</div>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctRecebidas)} das geradas no ano</div>
                </div>
                <div style={{ background: '#eafaf0', border: '1px solid #bfe8d1', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1fa463' }}>DAM Pagas em {rm.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(rm.totalPagas)}</div>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctPagas)} das recebidas no ano</div>
                </div>
              </div>

              {!resultado ? null : (
                <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 8, lineHeight: 1.5 }}>
                  {MESES_ABREV[mesDestaque.mes - 1]}/{rm.ano} tem o maior descompasso: {fmtInt(mesDestaque.geradas)} geradas × {fmtInt(mesDestaque.recebidas)} recebidas — geração e recebimento são eventos independentes (guia gerada num mês só é recebida quando o contribuinte paga, meses depois).
                </div>
              )}

              <div style={{ height: 220, marginTop: 16, position: 'relative' }} onMouseLeave={() => setTipResultado(null)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rm.porMes.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 48, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                    <YAxis width={44} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="geradas" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ResultadoMes & { label: string }; setTipResultado({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, recebidas: p.recebidas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipResultado(null)} />
                    <Bar dataKey="recebidas" name="Recebidas" fill="#e8962e" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ResultadoMes & { label: string }; setTipResultado({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, recebidas: p.recebidas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipResultado(null)} />
                    <Bar dataKey="pagas" name="Pagas" fill="#1fa463" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ResultadoMes & { label: string }; setTipResultado({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, recebidas: p.recebidas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipResultado(null)} />
                  </BarChart>
                </ResponsiveContainer>
                {tipResultado ? (
                  <div style={{ position: 'absolute', left: tipResultado.left, top: tipResultado.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                    {tipBox(tipResultado.label, [
                      { texto: `Geradas: ${fmtInt(tipResultado.geradas)} DAMs`, cor: '#283e93' },
                      { texto: `Recebidas: ${fmtInt(tipResultado.recebidas)} DAMs`, cor: '#e8962e' },
                      { texto: `Pagas: ${fmtInt(tipResultado.pagas)} DAMs`, cor: '#1fa463' },
                    ])}
                  </div>
                ) : null}
              </div>
            </>
          )
        })()}
      </div>

      {/* Comparativo de DAM por ID — GERADAS × PAGAS contando DOCUMENTOS distintos (COUNT
          DISTINCT cd_guia), não eventos de baixa como no gráfico anterior. Uma guia parcelada
          (ex.: IPTU em várias cotas) gera uma baixa "paga" por parcela — por isso o número de
          eventos pagos (gráfico acima) é sempre maior que o número de DAMs distintas pagas
          (aqui). Uma DAM com parcelas pagas em meses diferentes conta em mais de um mês. */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Comparativo de DAM por ID — Geradas × Pagas</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Quantidade de documentos (DAM) distintos, não de eventos de baixa — {(compDamId ?? FALLBACK_COMP_DAM_ID).ano}.</div>
          </div>
          <span style={reportBadge}>Por documento (ID)</span>
        </div>

        {(() => {
          const cd = compDamId ?? FALLBACK_COMP_DAM_ID
          const pctPagas = cd.totalGeradas ? (cd.totalPagas / cd.totalGeradas) * 100 : 0
          return (
            <>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                <div style={{ background: '#eef1fb', border: '1px solid #cdd5ef', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>DAM Geradas (IDs distintos) em {cd.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(cd.totalGeradas)}</div>
                </div>
                <div style={{ background: '#eafaf0', border: '1px solid #bfe8d1', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1fa463' }}>DAM Pagas (IDs distintos) em {cd.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(cd.totalPagas)}</div>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctPagas)} das geradas no ano</div>
                </div>
              </div>

              <div style={{ height: 220, marginTop: 16, position: 'relative' }} onMouseLeave={() => setTipCompDamId(null)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cd.porMes.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 48, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                    <YAxis width={44} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="geradas" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ComparativoDamIdMes & { label: string }; setTipCompDamId({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipCompDamId(null)} />
                    <Bar dataKey="pagas" name="Pagas" fill="#1fa463" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ComparativoDamIdMes & { label: string }; setTipCompDamId({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipCompDamId(null)} />
                  </BarChart>
                </ResponsiveContainer>
                {tipCompDamId ? (
                  <div style={{ position: 'absolute', left: tipCompDamId.left, top: tipCompDamId.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                    {tipBox(tipCompDamId.label, [
                      { texto: `Geradas: ${fmtInt(tipCompDamId.geradas)} DAMs`, cor: '#283e93' },
                      { texto: `Pagas: ${fmtInt(tipCompDamId.pagas)} DAMs`, cor: '#1fa463' },
                    ])}
                  </div>
                ) : null}
              </div>
            </>
          )
        })()}
      </div>

      {/* Potencial de Arrecadação — painel: do saldo devedor, quanto já VENCEU (inadimplência
          genuína, ação de cobrança já cabível) × quanto ainda NÃO VENCEU (potencial futuro,
          não cobrável ainda), por tributo analítico. Ao clicar num tributo, abre um painel ao
          lado com o drill "quando vence" (saldo por mês de vencimento). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginTop: 18, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Potencial de Arrecadação</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Do saldo devedor, quanto já venceu (cobrável agora) × quanto ainda não venceu (potencial futuro), por tributo — {g.ano}. Clique num item para ver quando vence.</div>
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
                    const ativo = potSel?.nome === t.nome
                    return (
                      <div key={t.nome} onClick={() => selecionarPotencial(t)}
                        style={{ cursor: 'pointer', borderRadius: 8, padding: '4px 6px', margin: '-4px -6px', background: ativo ? '#eef1fb' : 'transparent', border: ativo ? '1px solid #cdd5ef' : '1px solid transparent' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                          <span style={{ fontSize: 11.5, color: ativo ? '#283e93' : '#3a4256', fontWeight: ativo ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="3" style={{ flex: 'none', transform: ativo ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
                            {t.nome}
                          </span>
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

        {/* Companion panel — drill "quando vence" (saldo por mês de vencimento) do tributo
            selecionado ao lado. */}
        <div style={card}>
          {!potSel ? (
            <div style={{ minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Quando Vence</span>
              <div style={{ fontSize: 12, color: '#9098a8', marginTop: 10, maxWidth: 260 }}>
                Selecione um item em &quot;Potencial de Arrecadação&quot; para ver o saldo devedor por mês de vencimento.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Quando Vence · {potSel.nome}</span>
                <span style={reportBadge}>Por mês</span>
              </div>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
                Saldo devedor por mês de vencimento{potSel.codigos.length > 1 ? ` — soma de ${potSel.codigos.length} códigos` : ''}. Barras vermelhas já venceram; laranjas ainda vão vencer. Clique num mês pra ver os devedores.
              </div>

              {!potMensal ? (
                <div style={{ marginTop: 16, height: 220, borderRadius: 12, background: '#eef1f7' }} />
              ) : !potMensal.length ? (
                <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem parcelas com saldo para este item.</div>
              ) : (
                <div style={{ height: 240, marginTop: 16, position: 'relative' }} onMouseLeave={() => setTipQV(null)}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={potMensal.map(m => ({ ...m, label: `${String(m.mes).padStart(2, '0')}/${String(m.ano).slice(2)}` }))} margin={{ top: 30, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
                      <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={potMensal.length > 14 ? 1 : 0} />
                      <YAxis width={44} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                      <Bar dataKey="saldo" radius={[4, 4, 0, 0]} maxBarSize={26} cursor="pointer"
                        onClick={(data: { payload?: PotMes }) => { if (data.payload) selecionarMes(data.payload) }}
                        onMouseEnter={(data: BarRectangleItem) => setTipQV({ left: data.x + data.width / 2, top: data.y, label: String((data.payload as { label: string }).label), saldo: (data.payload as PotMes).saldo })}
                        onMouseLeave={() => setTipQV(null)}>
                        {potMensal.map((m, i) => {
                          const sel = potMesSel && potMesSel.ano === m.ano && potMesSel.mes === m.mes
                          return <Cell key={i} fill={m.vencido ? '#d64545' : '#e8962e'} stroke={sel ? '#1f2a44' : 'none'} strokeWidth={sel ? 2 : 0} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {tipQV ? (
                    <div style={{ position: 'absolute', left: tipQV.left, top: tipQV.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                      {tipBox(tipQV.label, [{ texto: `Saldo: R$ ${tipQV.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }])}
                    </div>
                  ) : null}
                </div>
              )}

              {potMesSel ? (
                <div style={{ marginTop: 16, background: '#f7f9fd', borderRadius: 10, padding: '10px 10px 4px' }}>
                  <div style={{ fontSize: 10.5, color: '#5b6477', fontWeight: 600, padding: '0 4px 8px' }}>
                    Maiores devedores · vencimento {String(potMesSel.mes).padStart(2, '0')}/{potMesSel.ano}
                  </div>
                  {devedoresMesErro ? (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 11.5, color: '#d64545' }}>Não foi possível carregar os devedores.</div>
                      <button onClick={() => potMesSel && buscarDevedoresMes(potMesSel)} style={{ marginTop: 6, border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontFamily: 'inherit' }}>Tentar novamente</button>
                    </div>
                  ) : !devedoresMes ? <Spinner label="Carregando…" size={26} padding={16} />
                    : !devedoresMes.length ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '10px 0' }}>Nenhum devedor identificado.</div>
                    : (() => {
                      const maxDev = Math.max(1, ...devedoresMes.map(x => x.saldo))
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 6 }}>
                          {devedoresMes.map((dv, di) => (
                            <div key={dv.cd}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 1 }}>
                                <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{di + 1}. {dv.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>{dv.cpfCnpj ? `· ${dv.cpfCnpj}` : ''}</span></span>
                                <span style={{ color: '#d64545', fontWeight: 700, flex: 'none' }}>{fmtAbrev(dv.saldo)}</span>
                              </div>
                              {dv.endereco ? <div style={{ fontSize: 10, color: '#9098a8', marginBottom: 3, paddingLeft: 14 }}>{dv.endereco}</div> : null}
                              <div style={{ height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.max(3, 100 * dv.saldo / maxDev).toFixed(1)}%`, borderRadius: 5, background: '#d64545' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ROW 2 — baixas por ano, com Insights de Cobrança ao lado (largura menor, mesma altura
          do gráfico) a pedido do usuário. preserveAspectRatio="none" faz o SVG esticar só na
          largura — a altura fica travada em gb.H (280), não encolhe com a coluna. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 18, alignItems: 'stretch' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Baixas Processadas por Ano</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>volume de DAMs recebidas pelo setor de Cobrança{mes ? ` — acumulado até ${MESES_ABREV[mes - 1]}, em cada ano` : ''}. Exercício selecionado ({g.ano}) em destaque.</div>
            </div>
            <span style={reportBadge}>Volume</span>
          </div>
          <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, height: gb.H, cursor: 'pointer' }}>
            <svg viewBox={`0 0 ${gb.W} ${gb.H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="cobBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#7d8fce" /></linearGradient>
                <linearGradient id="cobBarSel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8962e" /><stop offset="100%" stopColor="#f0bb7c" /></linearGradient>
              </defs>
              {gb.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(gb.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 2).toFixed(1)} fontSize="8" fill="#aeb6c6" style={axisFont}>{t.v}k</text></g>))}
              <line x1="0" y1={gb.bottom} x2={String(gb.W)} y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gb.bars.map((b, i) => {
                const sel = b.ano === g.ano
                return (
                  <g key={i}>
                    <rect x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.h.toFixed(1)} rx="5" fill={sel ? 'url(#cobBarSel)' : 'url(#cobBar)'} />
                    <text x={b.cx.toFixed(1)} y={String(gb.H - 6)} fontSize="9" fontWeight={sel ? 700 : 400} fill={sel ? '#c07a2e' : '#3a4256'} textAnchor="middle" style={axisFont}>{b.ano}</text>
                  </g>
                )
              })}
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
      </div>

      {/* Tabela por tributo, com Canais de Arrecadação ao lado (largura menor, mesma altura
          da tabela) a pedido do usuário. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 18, alignItems: 'stretch' }}>
        <div style={card}>
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

        {/* Canais donut */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Canais de Arrecadação</span>
            <span style={dots}>···</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <svg viewBox="0 0 200 200" width="220" height="220" style={{ maxWidth: '100%' }}>
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
    </div>
  )
}
