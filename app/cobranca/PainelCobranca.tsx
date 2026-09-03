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
interface DevedorBairro { bairro: string; saldo: number; qtd: number }
interface DamMes { mes: number; qt: number }
interface DamTributo { nome: string; codigos: number[]; qt: number }
interface DamTributoMes { nome: string; qt: number }
interface DamOperador { nome: string; qt: number }
interface DamsGeradas { ano: number; total: number; porMes: DamMes[]; porTributo: DamTributo[]; porOperador: DamOperador[] }
interface ResultadoMes { mes: number; geradas: number; pagas: number }
interface ResultadoMensal { ano: number; totalGeradas: number; totalPagas: number; porMes: ResultadoMes[] }
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
  ano: 2025, total: 513481,
  porMes: [
    { mes: 1, qt: 65350 }, { mes: 2, qt: 42336 }, { mes: 3, qt: 34010 }, { mes: 4, qt: 21050 },
    { mes: 5, qt: 22111 }, { mes: 6, qt: 29879 }, { mes: 7, qt: 22797 }, { mes: 8, qt: 22434 },
    { mes: 9, qt: 22981 }, { mes: 10, qt: 22625 }, { mes: 11, qt: 41174 }, { mes: 12, qt: 166734 },
  ],
  porTributo: [
    { nome: 'Documento de Arrecadacao', codigos: [20], qt: 421000 },
    { nome: 'ISS - Simples Nacional', codigos: [301], qt: 27000 },
    { nome: 'IPTU', codigos: [1], qt: 13200 },
    { nome: 'Taxa de Contribuição Ambiental (TCA)', codigos: [67], qt: 12800 },
    { nome: 'ISS - Simples Nacional Dívida Ativa', codigos: [303], qt: 10200 },
    { nome: 'I.S.S.Q.N.', codigos: [3], qt: 4300 },
    { nome: 'Taxa de Fiscalização de Estabelecimento', codigos: [2002], qt: 4200 },
  ],
  porOperador: [
    { nome: 'CalebeAM', qt: 344000 }, { nome: 'Schedule', qt: 44600 }, { nome: 'Internet', qt: 20000 },
    { nome: 'KellyCPS', qt: 17100 }, { nome: 'BeatrizPS', qt: 13800 }, { nome: 'Arquimedes', qt: 7900 },
  ],
}

const FALLBACK_RESULTADO: ResultadoMensal = {
  ano: 2025, totalGeradas: 1240924, totalPagas: 268000,
  porMes: [
    { mes: 1, geradas: 73192, pagas: 14000 }, { mes: 2, geradas: 43244, pagas: 28706 },
    { mes: 3, geradas: 44118, pagas: 27675 }, { mes: 4, geradas: 30754, pagas: 25276 },
    { mes: 5, geradas: 22646, pagas: 24265 }, { mes: 6, geradas: 42330, pagas: 24114 },
    { mes: 7, geradas: 23636, pagas: 24057 }, { mes: 8, geradas: 23447, pagas: 23250 },
    { mes: 9, geradas: 24308, pagas: 23668 }, { mes: 10, geradas: 23563, pagas: 23178 },
    { mes: 11, geradas: 42396, pagas: 19201 }, { mes: 12, geradas: 847290, pagas: 10367 },
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
  const [tipDam, setTipDam] = useState<{ left: number; top: number; label: string; qt: number } | null>(null)
  const [tipResultado, setTipResultado] = useState<{ left: number; top: number; label: string; geradas: number; pagas: number } | null>(null)
  const [tipCompDamId, setTipCompDamId] = useState<{ left: number; top: number; label: string; geradas: number; pagas: number } | null>(null)
  const [potencial, setPotencial] = useState<Potencial | null>(null)
  const [potSel, setPotSel] = useState<PotTrib | null>(null)
  const [potMensal, setPotMensal] = useState<PotMes[] | null>(null)
  const [potMesSel, setPotMesSel] = useState<PotMes | null>(null)
  const [devedoresMes, setDevedoresMes] = useState<Devedor[] | null>(null)
  const [devedoresMesErro, setDevedoresMesErro] = useState(false)
  // Drill "por bairro" do Potencial de Arrecadação — mesmo princípio do "IPTU por Bairro"
  // (nível geográfico in-place, com "‹ Voltar"), inserido ENTRE o mês e os devedores: ao
  // clicar num mês, mostra o saldo agrupado por bairro (endereço cadastral do contribuinte,
  // já que Potencial cobre todos os tributos, não só os ligados a imóvel) em vez de já pular
  // pros devedores; só ao clicar num bairro é que a lista de devedores aparece, filtrada
  // aquele bairro.
  const [potBairros, setPotBairros] = useState<DevedorBairro[] | null>(null)
  const [potBairrosErro, setPotBairrosErro] = useState(false)
  const [potBairroSel, setPotBairroSel] = useState<string | null>(null)
  const [dams, setDams] = useState<DamsGeradas | null>(null)
  const [resultado, setResultado] = useState<ResultadoMensal | null>(null)
  const [compDamId, setCompDamId] = useState<ComparativoDamId | null>(null)
  const [analise, setAnalise] = useState<AnaliseConversao | null>(null)
  // Default 'tributo' (não null): Análise de Conversão e o painel de DAM ao lado devem
  // nascer sincronizados no mesmo ano corrente + mesma lente, sem exigir clique — antes o
  // botão "Por Tributo" já aparecia realçado (padrão visual só na Análise de Conversão), mas
  // o painel de DAM ficava preso em "Selecione uma lente" até o usuário clicar de verdade.
  const [conversaoDim, setConversaoDim] = useState<'tributo' | 'periodo' | 'operador' | null>('tributo')
  const [buscaConversao, setBuscaConversao] = useState('')
  const [ordemConversao, setOrdemConversao] = useState<'desc' | 'asc'>('desc')
  // Drill de 2º nível do painel DAM — ao clicar num tributo/operador em "Por Tributo"/"Por
  // Operador", mostra geradas por mês só daquele item (não os 3 podem coexistir: um exclui o
  // outro, e trocar de lente ou de ano/mês limpa a seleção).
  const [damDrillTributo, setDamDrillTributo] = useState<DamTributo | null>(null)
  const [damDrillOperador, setDamDrillOperador] = useState<DamOperador | null>(null)
  const [damDrillMesData, setDamDrillMesData] = useState<DamMes[] | null>(null)
  const [tipDamDrill, setTipDamDrill] = useState<{ left: number; top: number; label: string; qt: number } | null>(null)
  const [buscaDam, setBuscaDam] = useState('')
  // Ao clicar num ano em "Por Período" (Análise de Conversão), o gráfico "Por período (mês)"
  // do painel DAM passa a mostrar os meses DAQUELE ano em vez do exercício global da tela.
  const [conversaoPeriodoAno, setConversaoPeriodoAno] = useState<number | null>(null)
  const [damsPeriodo, setDamsPeriodo] = useState<DamsGeradas | null>(null)
  // Drill de 2º nível DENTRO da própria "Análise de Conversão" — ao clicar num item nas
  // lentes "Por Período" ou "Por Operador", a mesma card troca pra mostrar a conversão
  // daquele período/operador quebrada por tributo (in-place, com botão "‹ Voltar"; "Por
  // Tributo" já É essa visão, então não tem pra onde descer mais). Em "Por Período" o clique
  // também continua disparando selecionarPeriodoAno (efeito existente no painel DAM ao lado)
  // — os dois convivem, cada um com seu próprio toggle.
  const [conversaoDrillItem, setConversaoDrillItem] = useState<ConversaoItem | null>(null)
  const [conversaoDrillData, setConversaoDrillData] = useState<ConversaoItem[] | null>(null)
  const [conversaoDrillErro, setConversaoDrillErro] = useState(false)
  // Drill de 3º nível do painel DAM, só na lente "Por Período" — ao clicar num mês no gráfico
  // "Por período (mês)", quebra aquele mês específico (do ano ativo, seja o padrão ou um
  // selecionado via Análise de Conversão) por tributo, substituindo o gráfico pela lista
  // (com "‹ Voltar" pro gráfico).
  const [damPeriodoDrillMes, setDamPeriodoDrillMes] = useState<number | null>(null)
  const [damPeriodoDrillData, setDamPeriodoDrillData] = useState<DamTributoMes[] | null>(null)
  const [damPeriodoDrillErro, setDamPeriodoDrillErro] = useState(false)
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
    setPotBairros(null)
    setPotBairrosErro(false)
    setPotBairroSel(null)
    setDamDrillTributo(null)
    setDamDrillOperador(null)
    setDamDrillMesData(null)
    setBuscaDam('')
    setConversaoPeriodoAno(null)
    setDamsPeriodo(null)
    setConversaoDrillItem(null)
    setConversaoDrillData(null)
    setConversaoDrillErro(false)
    setDamPeriodoDrillMes(null)
    setDamPeriodoDrillData(null)
    setDamPeriodoDrillErro(false)
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
    setPotBairros(null)
    setPotBairrosErro(false)
    setPotBairroSel(null)
    if (potSel?.nome === t.nome) { setPotSel(null); setPotMensal(null); return }
    setPotSel(t)
    setPotMensal(null)
    const qs = new URLSearchParams({ codigos: t.codigos.join(','), ano: String(g.ano), ...(mes ? { mes: String(mes) } : {}) })
    fetch(`/api/cobranca/potencial-mensal?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => { if (res && !res.error && Array.isArray(res.itens)) setPotMensal(res.itens) }).catch(() => {})
  }

  function buscarDevedoresMes(m: PotMes, bairro?: string) {
    if (!potSel) return
    setDevedoresMes(null)
    setDevedoresMesErro(false)
    const qs = new URLSearchParams({ codigos: potSel.codigos.join(','), anoVenc: String(m.ano), mesVenc: String(m.mes), ...(bairro ? { bairro } : {}) })
    fetch(`/api/cobranca/devedores-tributo-mes?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res && !res.error && Array.isArray(res.itens)) setDevedoresMes(res.itens)
        else setDevedoresMesErro(true)
      }).catch(() => setDevedoresMesErro(true))
  }

  function buscarPotBairros(m: PotMes) {
    if (!potSel) return
    setPotBairros(null)
    setPotBairrosErro(false)
    const qs = new URLSearchParams({ codigos: potSel.codigos.join(','), anoVenc: String(m.ano), mesVenc: String(m.mes) })
    fetch(`/api/cobranca/devedores-bairro-tributo-mes?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res && !res.error && Array.isArray(res.itens)) setPotBairros(res.itens)
        else setPotBairrosErro(true)
      }).catch(() => setPotBairrosErro(true))
  }

  function selecionarMes(m: PotMes) {
    if (!potSel) return
    setPotBairroSel(null)
    setPotBairros(null)
    setPotBairrosErro(false)
    setDevedoresMes(null)
    setDevedoresMesErro(false)
    if (potMesSel && potMesSel.ano === m.ano && potMesSel.mes === m.mes) { setPotMesSel(null); return }
    setPotMesSel(m)
    buscarPotBairros(m)
  }

  // Clique num bairro do drill "Saldo por Bairro" (Potencial de Arrecadação) — desce mais um
  // nível mostrando os devedores daquele bairro específico, igual ao bairro→rua→imóvel do
  // IPTU por Bairro (in-place, com Voltar). O balde "Demais bairros (N)" não é clicável — a
  // cauda longa de bairros (nomes cadastrais em texto livre, com muita variação) não vale a
  // pena listar devedor a devedor.
  function selecionarPotBairro(b: DevedorBairro) {
    if (!potSel || !potMesSel || /^Demais bairros/.test(b.bairro)) return
    if (potBairroSel === b.bairro) { setPotBairroSel(null); setDevedoresMes(null); setDevedoresMesErro(false); return }
    setPotBairroSel(b.bairro)
    buscarDevedoresMes(potMesSel, b.bairro)
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

  function selecionarPeriodoAno(anoSel: number) {
    setDamPeriodoDrillMes(null)
    setDamPeriodoDrillData(null)
    setDamPeriodoDrillErro(false)
    if (conversaoPeriodoAno === anoSel) { setConversaoPeriodoAno(null); setDamsPeriodo(null); return }
    setConversaoPeriodoAno(anoSel)
    setDamsPeriodo(null)
    const sufMes = mes ? `&mes=${mes}` : ''
    fetch(`/api/cobranca/dams?ano=${anoSel}${sufMes}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.total === 'number') setDamsPeriodo(x) }).catch(() => {})
  }

  function buscarDamPeriodoTributoMes(anoAlvo: number, mesAlvo: number) {
    setDamPeriodoDrillData(null)
    setDamPeriodoDrillErro(false)
    fetch(`/api/cobranca/dams-periodo-tributo-mes?ano=${anoAlvo}&mes=${mesAlvo}`).then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res && !res.error && Array.isArray(res.itens)) setDamPeriodoDrillData(res.itens)
        else setDamPeriodoDrillErro(true)
      }).catch(() => setDamPeriodoDrillErro(true))
  }

  // Clique numa barra de mês no gráfico "Por período (mês)" do painel DAM — desce mais um
  // nível quebrando aquele mês específico por tributo, substituindo o gráfico (não abre outra
  // card).
  function selecionarDamPeriodoMes(anoAlvo: number, mesAlvo: number) {
    if (damPeriodoDrillMes === mesAlvo) { setDamPeriodoDrillMes(null); setDamPeriodoDrillData(null); setDamPeriodoDrillErro(false); return }
    setDamPeriodoDrillMes(mesAlvo)
    buscarDamPeriodoTributoMes(anoAlvo, mesAlvo)
  }

  function buscarConversaoDrill(dim: 'periodo' | 'operador', item: ConversaoItem) {
    setConversaoDrillData(null)
    setConversaoDrillErro(false)
    const qs = new URLSearchParams({
      tipo: dim, ano: String(ano), ...(mes ? { mes: String(mes) } : {}),
      ...(dim === 'periodo' ? { anoDrill: item.nome } : { nome: item.nome }),
    })
    fetch(`/api/cobranca/analise-conversao-drill?${qs}`).then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res && !res.error && Array.isArray(res.itens)) setConversaoDrillData(res.itens)
        else setConversaoDrillErro(true)
      }).catch(() => setConversaoDrillErro(true))
  }

  // Clique num item de "Por Período"/"Por Operador" na Análise de Conversão — desce um
  // nível mostrando aquele período/operador quebrado por tributo, na própria card.
  function selecionarConversaoItem(dim: 'periodo' | 'operador', item: ConversaoItem) {
    if (conversaoDrillItem?.nome === item.nome) {
      setConversaoDrillItem(null); setConversaoDrillData(null); setConversaoDrillErro(false)
    } else {
      setConversaoDrillItem(item)
      buscarConversaoDrill(dim, item)
    }
    if (dim === 'periodo') selecionarPeriodoAno(Number(item.nome))
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

  // Relatório (PDF/Excel) — reflete a análise ativa em "Potencial de Arrecadação"/"Quando
  // Vence" (tributo selecionado, opcionalmente aprofundado por mês e por bairro), sempre com
  // o Exercício/Mês do filtro superior no título. Sem nenhuma análise selecionada (potSel
  // nulo), volta ao relatório geral: os 5 KPIs do topo + conversão por tributo (mesma tabela
  // final da página) — comportamento a pedido do usuário.
  async function gerarRelatorio(tipo: 'pdf' | 'excel') {
    if (gerandoRelatorio) return
    const sufMes = mes ? ` (até ${MESES_ABREV[mes - 1]})` : ''
    let dados: DadosRelatorio
    if (potSel) {
      const cardsPot = [
        { rotulo: 'Vencido · cobrável agora', valor: fmtReais(potSel.vencido) },
        { rotulo: 'A Vencer · potencial futuro', valor: fmtReais(potSel.aVencer) },
      ]
      if (potBairroSel) {
        dados = {
          titulo: `Cobrança — Potencial de Arrecadação · ${potSel.nome} · ${potBairroSel}`,
          subtitulo: `Exercício ${g.ano}${sufMes}${potMesSel ? ` · Vencimento ${String(potMesSel.mes).padStart(2, '0')}/${potMesSel.ano}` : ''} · Devedores do bairro selecionado`,
          cards: cardsPot,
          colunas: ['Devedor', 'CPF/CNPJ', 'Saldo', 'Endereço'],
          linhas: (devedoresMes ?? []).map(dv => [dv.nome, dv.cpfCnpj, fmtReais(dv.saldo), dv.endereco ?? '']),
          arquivo: `Cobranca-Potencial-${potSel.nome}-${potBairroSel}`,
        }
      } else if (potMesSel) {
        dados = {
          titulo: `Cobrança — Potencial de Arrecadação · ${potSel.nome} — vencimento ${String(potMesSel.mes).padStart(2, '0')}/${potMesSel.ano}`,
          subtitulo: `Exercício ${g.ano}${sufMes} · Saldo por bairro`,
          cards: cardsPot,
          colunas: ['Bairro', 'Contribuintes', 'Saldo'],
          linhas: (potBairros ?? []).map(b => [b.bairro, fmtInt(b.qtd), fmtReais(b.saldo)]),
          arquivo: `Cobranca-Potencial-${potSel.nome}-${potMesSel.mes}-${potMesSel.ano}`,
        }
      } else {
        dados = {
          titulo: `Cobrança — Potencial de Arrecadação · ${potSel.nome}`,
          subtitulo: `Exercício ${g.ano}${sufMes} · Saldo por mês de vencimento`,
          cards: cardsPot,
          colunas: ['Mês/Ano', 'Situação', 'Saldo'],
          linhas: (potMensal ?? []).map(m => [`${String(m.mes).padStart(2, '0')}/${m.ano}`, m.vencido ? 'Vencido' : 'A Vencer', fmtReais(m.saldo)]),
          arquivo: `Cobranca-Potencial-${potSel.nome}`,
        }
      }
    } else {
      if (!g.tributos.length) return
      dados = {
        titulo: `Cobrança — Exercício ${g.ano}${sufMes}`,
        subtitulo: `Lançado ${fmtReais(g.lancado)} · Arrecadado ${fmtReais(g.arrecadado)} (${fmtPct(g.conversao)})`,
        cards: kpis.map(k => ({ rotulo: k.label, valor: k.value })),
        colunas: ['Tributo', 'Lançado', 'Arrecadado', 'A Recuperar', 'Conversão'],
        linhas: g.tributos.map(t => [t.nome, fmtReais(t.lancado), fmtReais(t.arrecadado), fmtReais(t.saldo), fmtPct(t.conversao)]),
        arquivo: `Cobranca-${g.ano}`,
      }
    }
    setGerandoRelatorio(true)
    try {
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

      {/* Barra de relatórios (Excel/PDF) — reflete a análise ativa em "Potencial de
          Arrecadação"/"Quando Vence" quando houver uma; senão, os 5 KPIs + conversão por
          tributo do Exercício/Mês selecionado. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, margin: '0 4px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['pdf', 'Baixar PDF'], ['excel', 'Baixar Excel']] as const).map(([tp, lbl]) => (
            <button key={tp} onClick={() => gerarRelatorio(tp)} disabled={gerandoRelatorio}
              title={potSel ? `Relatório da análise selecionada em Potencial de Arrecadação (${potSel.nome})` : 'Relatório com os KPIs e a conversão por tributo do período selecionado'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e3e9f5', background: '#fff', color: '#283e93', fontWeight: 600, cursor: gerandoRelatorio ? 'default' : 'pointer', opacity: gerandoRelatorio ? 0.6 : 1, borderRadius: 12, padding: '7px 14px', fontSize: 12, fontFamily: 'inherit' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>{gerandoRelatorio ? 'Gerando…' : lbl}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#5b6477', background: '#fff', borderRadius: 20, padding: '6px 14px', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
          Dados atualizados em <b style={{ color: '#283e93' }}>{fmtData(dataAtualizacao)}</b>
        </span>
        {/* "Limpar filtro" sobe pra junto de Baixar PDF/Excel — a pedido do usuário, com
            imagem de referência. Some o botão duplicado do banner abaixo (que fica só com o
            texto informativo) pra não ter dois botões fazendo a mesma coisa na tela ao mesmo
            tempo. */}
        {mes ? (
          <button onClick={onLimparMes} style={{ border: 'none', background: '#283e93', color: '#fff', fontWeight: 600, cursor: 'pointer', borderRadius: 20, padding: '9px 18px', fontSize: 12.5, fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(40,62,147,0.18)' }}>Limpar filtro</button>
        ) : null}
      </div>

      {/* Banner de filtro global por mês (acumulado até o mês selecionado) */}
      {mes ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#eef1fb', border: '1px solid #d6ddf6', borderRadius: 12, padding: '8px 14px', margin: '14px 4px 0' }}>
          <span style={{ fontSize: 12.5, color: '#283e93', fontWeight: 600 }}>Toda a tela filtrada pelo mês: <b>até {MESES[mes - 1]}</b></span>
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
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Lançado × Arrecadado — {(analise ?? FALLBACK_ANALISE).ano}, sob 3 lentes.</div>
            </div>
            <div style={{ display: 'flex', background: '#f4f7fc', borderRadius: 12, padding: 3, gap: 2 }}>
              {([['tributo', 'Por Tributo'], ['periodo', 'Por Período'], ['operador', 'Por Operador']] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setConversaoDim(key); setBuscaConversao(''); setDamDrillTributo(null); setDamDrillOperador(null); setBuscaDam(''); setConversaoPeriodoAno(null); setDamsPeriodo(null); setConversaoDrillItem(null); setConversaoDrillData(null); setConversaoDrillErro(false); setDamPeriodoDrillMes(null); setDamPeriodoDrillData(null); setDamPeriodoDrillErro(false) }}
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
            const podeDrill = dimAtual === 'periodo' || dimAtual === 'operador'

            // Drill in-place: item selecionado em Por Período/Por Operador, quebrado por
            // tributo — troca o conteúdo da própria card (não abre uma card nova).
            if (podeDrill && conversaoDrillItem) {
              const rotulo = dimAtual === 'periodo' ? `Exercício ${conversaoDrillItem.nome}` : conversaoDrillItem.nome
              const maxLancDrill = Math.max(1, ...(conversaoDrillData ?? []).flatMap(i => [i.lancado, i.arrecadado]))
              return (
                <>
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span title={rotulo} style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotulo} — por tributo</span>
                    <button onClick={() => { setConversaoDrillItem(null); setConversaoDrillData(null); setConversaoDrillErro(false) }}
                      style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, flex: 'none' }}>‹ Voltar</button>
                  </div>
                  {conversaoDrillErro ? (
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                      <div style={{ fontSize: 12, color: '#9098a8' }}>Não foi possível carregar o detalhe por tributo.</div>
                      <button onClick={() => buscarConversaoDrill(dimAtual as 'periodo' | 'operador', conversaoDrillItem)}
                        style={{ marginTop: 8, border: '1px solid #e3e8f1', background: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#283e93', cursor: 'pointer' }}>Tentar novamente</button>
                    </div>
                  ) : !conversaoDrillData ? (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 13 }}>
                      {[0, 1, 2, 3].map(i => (<div key={i} style={{ height: 32, borderRadius: 8, background: '#eef1f7' }} />))}
                    </div>
                  ) : !conversaoDrillData.length ? (
                    <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem lançamento por tributo para esta seleção.</div>
                  ) : (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 13, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
                      {conversaoDrillData.map(item => {
                        const wLanc = Math.max(3, 100 * item.lancado / maxLancDrill)
                        const wArr = Math.max(3, 100 * item.arrecadado / maxLancDrill)
                        return (
                          <div key={item.nome}>
                            <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', marginBottom: 4 }}>{item.nome}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${wLanc.toFixed(1)}%`, background: '#283e93', borderRadius: 5 }} />
                              </div>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#283e93', flex: 'none', minWidth: 54, textAlign: 'right' }}>{fmtAbrev(item.lancado)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${wArr.toFixed(1)}%`, background: '#1fa463', borderRadius: 5 }} />
                              </div>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1fa463', flex: 'none', minWidth: 54, textAlign: 'right' }}>{fmtAbrev(item.arrecadado)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            }

            const itens = dimAtual === 'tributo' ? an.porTributo : dimAtual === 'periodo' ? an.porPeriodo : an.porOperador
            if (!itens.length) return <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem dados para esta visão.</div>
            // Por Período ordena pelo ano (não pelo lançado) — "maior p/ menor" = mais recente
            // primeiro (ex.: 2026, 2025, 2024…), a pedido do usuário; Por Tributo/Por Operador
            // continuam ordenando pelo lançado.
            const valorOrdenacao = (item: ConversaoItem) => dimAtual === 'periodo' ? Number(item.nome) : item.lancado
            const itensFiltrados = (buscaConversao.trim()
              ? itens.filter(i => i.nome.toLowerCase().includes(buscaConversao.trim().toLowerCase()))
              : [...itens]
            ).sort((a, b) => ordemConversao === 'desc' ? valorOrdenacao(b) - valorOrdenacao(a) : valorOrdenacao(a) - valorOrdenacao(b))
            const maxLanc = Math.max(1, ...itensFiltrados.flatMap(i => [i.lancado, i.arrecadado]))
            const placeholderLabel = dimAtual === 'tributo' ? 'tributo' : dimAtual === 'periodo' ? 'período' : 'operador'
            // "Por Operador" traz todos os atendentes nomeados (sem cortar num "Demais") — pode
            // passar de 80 linhas. Altura travada com scroll interno pra não esticar o card;
            // Por Tributo/Por Período (poucos itens) cabem inteiros aqui, sem barra de rolagem.
            return (
              <>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#5b6477' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#283e93' }} />Lançado</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#5b6477' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#1fa463' }} />Arrecadado</span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  const wLanc = Math.max(3, 100 * item.lancado / maxLanc)
                  const wArr = Math.max(3, 100 * item.arrecadado / maxLanc)
                  const selecionado = podeDrill && conversaoDrillItem?.nome === item.nome
                  return (
                    <div key={item.nome}
                      onClick={podeDrill ? () => selecionarConversaoItem(dimAtual as 'periodo' | 'operador', item) : undefined}
                      title={podeDrill ? 'Clique para detalhar por tributo' : undefined}
                      style={podeDrill ? { cursor: 'pointer', padding: 6, margin: -6, borderRadius: 8, background: selecionado ? '#eef1fb' : 'transparent' } : undefined}>
                      <span style={{ fontSize: 11.5, color: selecionado ? '#283e93' : '#3a4256', fontWeight: selecionado ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', marginBottom: 4 }}>{item.nome}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${wLanc.toFixed(1)}%`, background: '#283e93', borderRadius: 5 }} />
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#283e93', flex: 'none', minWidth: 54, textAlign: 'right' }}>{fmtAbrev(item.lancado)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${wArr.toFixed(1)}%`, background: '#1fa463', borderRadius: 5 }} />
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1fa463', flex: 'none', minWidth: 54, textAlign: 'right' }}>{fmtAbrev(item.arrecadado)}</span>
                      </div>
                    </div>
                  )
                })}
                </div>
                )}
              </>
            )
          })()}

          {/* Informativo fixo abaixo do gráfico — melhor desempenho por Tributo × Usuário,
              independente da lente/drill selecionados acima (por isso é um IIFE separado, não
              dentro do bloco de cima). Só considera itens com lançado > R$ 1 milhão (mesmo
              piso de "menor conversão" já usado nos Insights de Cobrança, evita destacar um
              tributo/usuário com volume irrisório por coincidência) e exclui "Demais
              tributos" (balde agregado), "Internet" (autoemissão pelo portal) e "Schedule"
              (geração automática agendada) do ranking de usuário — nenhum dos dois é uma
              pessoa de verdade pra ganhar um "melhor usuário".*/}
          {(() => {
            const an = analise ?? FALLBACK_ANALISE
            const PISO_LANCADO = 1e6
            const candidatosTrib = an.porTributo.filter(t => t.lancado > PISO_LANCADO && !/^Demais tributos/.test(t.nome))
            const candidatosOper = an.porOperador.filter(o => o.lancado > PISO_LANCADO && o.nome !== 'Internet' && o.nome !== 'Schedule')
            const melhorTrib = [...candidatosTrib].sort((a, b) => b.conversao - a.conversao)[0]
            const melhorOper = [...candidatosOper].sort((a, b) => b.conversao - a.conversao)[0]
            if (!melhorTrib && !melhorOper) return null
            const melhorGeral = !melhorTrib ? melhorOper! : !melhorOper ? melhorTrib : melhorTrib.conversao >= melhorOper.conversao ? melhorTrib : melhorOper
            const origemGeral = melhorGeral === melhorTrib ? 'tributo' : 'usuário'
            return (
              <div style={{ marginTop: 16, background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', marginBottom: 10 }}>Melhor desempenho — Por Tributo × Usuário</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: '#5b6477' }}>Melhor desempenho geral <span style={{ color: '#aeb6c6' }}>({origemGeral})</span></span>
                    <span title={melhorGeral.nome} style={{ fontSize: 11.5, fontWeight: 700, color: '#1fa463', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{melhorGeral.nome} · {fmtPct(melhorGeral.conversao)}</span>
                  </div>
                  {melhorTrib ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: '#5b6477' }}>Melhor tributo</span>
                      <span title={melhorTrib.nome} style={{ fontSize: 11.5, fontWeight: 700, color: '#283e93', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{melhorTrib.nome} · {fmtPct(melhorTrib.conversao)}</span>
                    </div>
                  ) : null}
                  {melhorOper ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: '#5b6477' }}>Melhor usuário</span>
                      <span title={melhorOper.nome} style={{ fontSize: 11.5, fontWeight: 700, color: '#e8962e', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{melhorOper.nome} · {fmtPct(melhorOper.conversao)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Companion panel — Documentos de Arrecadação Municipal (DAM) gerados. Só a
            informação de DAM (Geradas), baseada no exercício de lançamento — "Pagas" removida
            do painel a pedido do usuário. O total fica sempre visível; o detalhe por
            tributo/período(mês)/operador acompanha a lente escolhida em "Análise de Conversão"
            (mesmo estado conversaoDim, default "Por Tributo"), mostrando só a lente
            correspondente — os dois painéis nascem no mesmo ano corrente (prop `ano`, vindo do
            Exercício selecionado na página) e reagem juntos quando ele muda. "Internet" =
            autoatendimento pelo portal; "Schedule" = geração automática agendada. */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Documentos de Arrecadação Municipal (DAM)</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Guias geradas (DAM distintas), por exercício de lançamento — {(dams ?? FALLBACK_DAMS).ano}. Detalhe por tributo, período ou operador conforme a lente escolhida em Análise de Conversão.</div>
            </div>
            <span style={reportBadge}>Geradas</span>
          </div>

          {(() => {
            const dm = dams ?? FALLBACK_DAMS
            const mesPico = [...dm.porMes].sort((a, b) => b.qt - a.qt)[0]
            const operPico = dm.porOperador[0]
            const pctMesPico = dm.total ? (mesPico.qt / dm.total) * 100 : 0
            const pctOperPico = dm.total && operPico ? (operPico.qt / dm.total) * 100 : 0
            return (
              <>
                <div style={{ marginTop: 12, background: '#283e93', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total de DAMs geradas em {dm.ano}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtInt(dm.total)}</span>
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
                ) : conversaoDim === 'periodo' ? (() => {
                  // Selecionar um ano em "Por Período" (Análise de Conversão) troca os meses
                  // exibidos aqui pelos daquele ano, em vez do exercício global da tela.
                  const anoAtivo = conversaoPeriodoAno ?? dm.ano
                  const dmPeriodo = conversaoPeriodoAno ? damsPeriodo : dm
                  return (
                    <>
                      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por período (mês) — {anoAtivo}</span>
                        {conversaoPeriodoAno ? (
                          <button onClick={() => { setConversaoPeriodoAno(null); setDamsPeriodo(null); setDamPeriodoDrillMes(null); setDamPeriodoDrillData(null); setDamPeriodoDrillErro(false) }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, flex: 'none' }}>‹ Voltar</button>
                        ) : null}
                      </div>
                      {damPeriodoDrillMes ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5b6477' }}>{MESES_ABREV[damPeriodoDrillMes - 1]}/{anoAtivo} — por tributo</span>
                            <button onClick={() => { setDamPeriodoDrillMes(null); setDamPeriodoDrillData(null); setDamPeriodoDrillErro(false) }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '3px 10px', fontSize: 10.5, flex: 'none' }}>‹ Voltar</button>
                          </div>
                          {damPeriodoDrillErro ? (
                            <div style={{ textAlign: 'center', padding: '18px 0' }}>
                              <div style={{ fontSize: 11.5, color: '#9098a8' }}>Não foi possível carregar o detalhe por tributo.</div>
                              <button onClick={() => buscarDamPeriodoTributoMes(anoAtivo, damPeriodoDrillMes)} style={{ marginTop: 6, border: '1px solid #e3e8f1', background: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#283e93', cursor: 'pointer' }}>Tentar novamente</button>
                            </div>
                          ) : !damPeriodoDrillData ? (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {[0, 1, 2].map(i => (<div key={i} style={{ height: 26, borderRadius: 8, background: '#eef1f7' }} />))}
                            </div>
                          ) : !damPeriodoDrillData.length ? (
                            <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '16px 0' }}>Sem guias geradas neste mês.</div>
                          ) : (() => {
                            const maxQt = Math.max(1, ...damPeriodoDrillData.map(t => t.qt))
                            return (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                {damPeriodoDrillData.map((t, i) => (
                                  <div key={t.nome}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                                      <span style={{ fontSize: 11, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtInt(t.qt)}</span>
                                    </div>
                                    <div style={{ height: 9, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.max(3, 100 * t.qt / maxQt).toFixed(1)}%`, borderRadius: 5, background: /^Demais tributos/.test(t.nome) ? '#c2c9d6' : DAM_CORES[i % DAM_CORES.length] }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      ) : !dmPeriodo ? (
                        <div style={{ height: 180, marginTop: 10, borderRadius: 12, background: '#eef1f7' }} />
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 180, position: 'relative' }} onMouseLeave={() => setTipDam(null)}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={dmPeriodo.porMes.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                                <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={1} />
                                <YAxis width={40} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                                <Legend wrapperStyle={{ fontSize: 10.5 }} />
                                <Bar dataKey="qt" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={22}
                                  onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDam({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt }) }}
                                  onMouseLeave={() => setTipDam(null)} />
                              </BarChart>
                            </ResponsiveContainer>
                            {tipDam ? (
                              <div style={{ position: 'absolute', left: tipDam.left, top: tipDam.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                                {tipBox(tipDam.label, [
                                  { texto: `Geradas: ${fmtInt(tipDam.qt)} guias`, cor: '#283e93' },
                                ])}
                              </div>
                            ) : null}
                          </div>
                          {/* Chips de mês pra descer o nível por tributo — clicar direto numa
                              barra do recharts é impreciso (barras finas, poucos px de largura);
                              um alvo de clique dedicado é mais confiável e consistente com o
                              padrão do resto da tela (linhas/itens clicáveis, não a própria
                              barra do gráfico). */}
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {dmPeriodo.porMes.filter(m => m.qt > 0).map(m => {
                              const ativo = damPeriodoDrillMes === m.mes
                              return (
                                <button key={m.mes} onClick={() => selecionarDamPeriodoMes(anoAtivo, m.mes)}
                                  title={`Detalhar ${MESES_ABREV[m.mes - 1]}/${anoAtivo} por tributo`}
                                  style={{
                                    border: 'none', borderRadius: 7, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                                    background: ativo ? '#283e93' : '#f4f7fc', color: ativo ? '#fff' : '#5b6477',
                                  }}>
                                  {MESES_ABREV[m.mes - 1]}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })() : conversaoDim === 'tributo' ? (
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
                            <BarChart data={damDrillMesData.filter(m => m.qt > 0).map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 30, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={1} />
                              <YAxis width={40} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                              <Legend wrapperStyle={{ fontSize: 10.5 }} />
                              <Bar dataKey="qt" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={22}
                                onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDamDrill({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt }) }}
                                onMouseLeave={() => setTipDamDrill(null)} />
                            </BarChart>
                          </ResponsiveContainer>
                          {tipDamDrill ? (
                            <div style={{ position: 'absolute', left: tipDamDrill.left, top: tipDamDrill.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                              {tipBox(tipDamDrill.label, [
                                { texto: `Geradas: ${fmtInt(tipDamDrill.qt)} guias`, cor: '#283e93' },
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
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtInt(t.qt)}</span>
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
                            <BarChart data={damDrillMesData.filter(m => m.qt > 0).map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 30, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} interval={1} />
                              <YAxis width={40} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                              <Legend wrapperStyle={{ fontSize: 10.5 }} />
                              <Bar dataKey="qt" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={22}
                                onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as DamMes & { label: string }; setTipDamDrill({ left: data.x + data.width / 2, top: data.y, label: p.label, qt: p.qt }) }}
                                onMouseLeave={() => setTipDamDrill(null)} />
                            </BarChart>
                          </ResponsiveContainer>
                          {tipDamDrill ? (
                            <div style={{ position: 'absolute', left: tipDamDrill.left, top: tipDamDrill.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                              {tipBox(tipDamDrill.label, [
                                { texto: `Geradas: ${fmtInt(tipDamDrill.qt)} guias`, cor: '#283e93' },
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
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtInt(o.qt)}</span>
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

      {/* Resultado Mensal da Arrecadação lado a lado com Comparativo de DAM por ID — a pedido
          do usuário, mesma largura (repeat(2,1fr)), já que os dois cards têm a mesma
          estrutura (2 KPIs + 1 gráfico de barras por mês). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 18, marginTop: 18, alignItems: 'start' }}>
      {/* Resultado Mensal da Arrecadação — DAM Geradas × DAM Pagas pelo setor de Cobrança,
          por mês. São eventos independentes (data de geração da guia vs. data da
          baixa/pagamento); uma guia gerada num mês só "vira" paga quando o contribuinte
          efetivamente paga, meses depois. Sobe pra ficar logo abaixo de "Análise de Conversão",
          a pedido do usuário. "DAM Recebidas" (todo tipo de baixa, não só pagamento) removida
          a pedido do usuário — ficou só Geradas × Pagas. */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Resultado Mensal da Arrecadação</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>DAM Geradas × DAM Pagas pelo setor de Cobrança, por mês — {(resultado ?? FALLBACK_RESULTADO).ano}.</div>
          </div>
          <span style={reportBadge}>Geradas × Pagas</span>
        </div>

        {(() => {
          const rm = resultado ?? FALLBACK_RESULTADO
          const pctPagas = rm.totalGeradas ? (rm.totalPagas / rm.totalGeradas) * 100 : 0
          return (
            <>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                <div style={{ background: '#eef1fb', border: '1px solid #cdd5ef', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>DAM Geradas em {rm.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(rm.totalGeradas)}</div>
                </div>
                <div style={{ background: '#eafaf0', border: '1px solid #bfe8d1', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1fa463' }}>DAM Pagas em {rm.ano}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(rm.totalPagas)}</div>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctPagas)} das geradas no ano</div>
                </div>
              </div>

              <div style={{ height: 220, marginTop: 16, position: 'relative' }} onMouseLeave={() => setTipResultado(null)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rm.porMes.map(m => ({ ...m, label: MESES_ABREV[m.mes - 1] }))} margin={{ top: 48, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                    <YAxis width={44} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={() => null} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="geradas" name="Geradas" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ResultadoMes & { label: string }; setTipResultado({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipResultado(null)} />
                    <Bar dataKey="pagas" name="Pagas" fill="#1fa463" radius={[4, 4, 0, 0]} maxBarSize={26}
                      onMouseEnter={(data: BarRectangleItem) => { const p = data.payload as ResultadoMes & { label: string }; setTipResultado({ left: data.x + data.width / 2, top: data.y, label: p.label, geradas: p.geradas, pagas: p.pagas }) }}
                      onMouseLeave={() => setTipResultado(null)} />
                  </BarChart>
                </ResponsiveContainer>
                {tipResultado ? (
                  <div style={{ position: 'absolute', left: tipResultado.left, top: tipResultado.top, transform: 'translate(-50%,-115%)', pointerEvents: 'none', zIndex: 5 }}>
                    {tipBox(tipResultado.label, [
                      { texto: `Geradas: ${fmtInt(tipResultado.geradas)} DAMs`, cor: '#283e93' },
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
      <div style={card}>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 4px 8px' }}>
                    <span style={{ fontSize: 10.5, color: '#5b6477', fontWeight: 600 }}>
                      {potBairroSel ? `Devedores · ${potBairroSel}` : 'Saldo por bairro'} · vencimento {String(potMesSel.mes).padStart(2, '0')}/{potMesSel.ano}
                    </span>
                    {potBairroSel ? (
                      <button onClick={() => { setPotBairroSel(null); setDevedoresMes(null); setDevedoresMesErro(false) }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '3px 10px', fontSize: 10.5, flex: 'none' }}>‹ Voltar aos bairros</button>
                    ) : null}
                  </div>

                  {!potBairroSel ? (
                    // Nível "por bairro" — igual ao 1º nível de IPTU por Bairro (in-place,
                    // ordenado por saldo, "Demais bairros (N)" agrupa a cauda longa).
                    potBairrosErro ? (
                      <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ fontSize: 11.5, color: '#d64545' }}>Não foi possível carregar os bairros.</div>
                        <button onClick={() => buscarPotBairros(potMesSel)} style={{ marginTop: 6, border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontFamily: 'inherit' }}>Tentar novamente</button>
                      </div>
                    ) : !potBairros ? <Spinner label="Carregando…" size={26} padding={16} />
                      : !potBairros.length ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '10px 0' }}>Nenhum bairro identificado.</div>
                      : (() => {
                        const maxBairro = Math.max(1, ...potBairros.map(x => x.saldo))
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 6, maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
                            {potBairros.map((b, i) => {
                              const demais = /^Demais bairros/.test(b.bairro)
                              return (
                                <div key={b.bairro} onClick={demais ? undefined : () => selecionarPotBairro(b)} style={{ cursor: demais ? 'default' : 'pointer' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 1 }}>
                                    <span style={{ color: demais ? '#9098a8' : '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                                      {!demais ? <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="3" style={{ flex: 'none' }}><path d="M9 6l6 6-6 6" /></svg> : null}
                                      {i + 1}. {b.bairro} <span style={{ color: '#9098a8', fontWeight: 500 }}>· {fmtInt(b.qtd)} contrib.</span>
                                    </span>
                                    <span style={{ color: '#d64545', fontWeight: 700, flex: 'none' }}>{fmtAbrev(b.saldo)}</span>
                                  </div>
                                  <div style={{ height: 10, borderRadius: 5, background: '#eef1f7', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.max(3, 100 * b.saldo / maxBairro).toFixed(1)}%`, borderRadius: 5, background: demais ? '#c2c9d6' : '#d64545' }} />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()
                  ) : devedoresMesErro ? (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 11.5, color: '#d64545' }}>Não foi possível carregar os devedores.</div>
                      <button onClick={() => potMesSel && potBairroSel && buscarDevedoresMes(potMesSel, potBairroSel)} style={{ marginTop: 6, border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontFamily: 'inherit' }}>Tentar novamente</button>
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
