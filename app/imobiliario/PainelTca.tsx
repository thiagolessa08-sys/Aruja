'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import LoadingOverlay, { Spinner } from '../_components/LoadingOverlay'
import SecaoBairros from '../_components/SecaoBairros'
import { baixarRelatorioPdf, baixarRelatorioExcel, type DadosRelatorio } from '../_components/relatorioTributo'
import { fmtAbrev } from '@/lib/fmt-grafico'

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
  mesRef: number | null
  cards: { lancado: Cmp; arrecadado: Cmp; inadimplencia: Cmp; emAberto: Cmp; isento: Cmp; suspenso: Cmp; imoveis: Cmp }
  evolucao: { ano: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; isento: number; suspenso: number; previsto: boolean; arrecPct: number; inadPct: number }[]
}

const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => (p >= 0 ? '+' : '') + p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const fmtData = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'

const CORES: Record<string, [string, string]> = {
  lancado: ['#283e93', '#aab8e3'],
  arrecadado: ['#1fa463', '#a7e0c2'],
  emAberto: ['#e8962e', '#f4cf9e'],
  inadimplencia: ['#d64545', '#f0b0b0'],
  isento: ['#8094d6', '#c3ccec'],
  suspenso: ['#5b6477', '#b9bec8'],
}
const svg = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
)
function EixoTick({ x, y, payload }: any) {
  return <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fill="#8a93a6" fontWeight={600}>{payload.value}</text>
}
const MESES_R = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
interface Mes { mes: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }
interface Resumo { situacao: { situacao: string; qt: number }[]; pagamento: { status: string; categoria: string; qt: number; cor: string }[] }

// Insights da TCA — frases derivadas dos cards.
function insightsTca(v: Visao): string[] {
  const c = v.cards
  const p1 = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
  const pctLanc = (x: number) => c.lancado.atual ? (x / c.lancado.atual) * 100 : 0
  const arr: string[] = []
  arr.push(`Em ${v.anoRef}, a TCA lançada soma ${fmtAbrev(c.lancado.atual)}${c.imoveis.atual ? ` em ${fmtInt(c.imoveis.atual)} imóveis` : ''} (${fmtPct(c.lancado.pct)} vs ${v.anoRef - 1}).`)
  arr.push(`Arrecadado ${fmtAbrev(c.arrecadado.atual)} — ${p1(pctLanc(c.arrecadado.atual))} do lançado (${fmtPct(c.arrecadado.pct)} vs ${v.anoRef - 1}).`)
  arr.push(`Inadimplência ${fmtAbrev(c.inadimplencia.atual)} (${p1(pctLanc(c.inadimplencia.atual))} do lançado); em aberto ${fmtAbrev(c.emAberto.atual)}.`)
  if (c.isento.atual || c.suspenso.atual) arr.push(`Isento ${fmtAbrev(c.isento.atual)} e suspenso ${fmtAbrev(c.suspenso.atual)} no exercício.`)
  arr.push('As análises de TCA consideram os dados a partir de 2025.')
  return arr
}

export default function PainelTca({ ano, mes }: { ano: number | ''; mes?: number | '' }) {
  const [v, setV] = useState<Visao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [recarregar, setRecarregar] = useState(0)
  const [drillAno, setDrillAno] = useState<number | null>(null)
  const [serieMes, setSerieMes] = useState<Mes[] | null>(null)
  const [carregMes, setCarregMes] = useState(false)
  // Drill por dia ao clicar num mês (dentro do drill de ano) — "Arrecadação Diária"
  const [drillMes, setDrillMes] = useState<number | null>(null)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [diario, setDiario] = useState<{ de: string; ate: string; dias: { dia: string; valor: number }[]; total: number } | null>(null)
  const [carregDiario, setCarregDiario] = useState(false)
  const [diarioErro, setDiarioErro] = useState(false)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const [res, setRes] = useState<Resumo | null>(null)
  // Bairro/rua/imóvel selecionados no drill de "TCA por Bairro" — passam a filtrar tanto
  // os quadros de situação/pagamento quanto o gráfico "Evolução da TCA" (cards + tabela +
  // previsão), interação entre os gráficos.
  const [bairroFiltro, setBairroFiltro] = useState<string | null>(null)
  const [ruaFiltro, setRuaFiltro] = useState<string | null>(null)
  const [imovelFiltro, setImovelFiltro] = useState<number | null>(null)
  const filtroBairroQ = bairroFiltro ? `&bairro=${encodeURIComponent(bairroFiltro)}` : ''
  const filtroRuaQ = bairroFiltro && ruaFiltro ? `&rua=${encodeURIComponent(ruaFiltro)}` : ''
  const filtroImovelQ = imovelFiltro ? `&imovel=${imovelFiltro}` : ''
  const filtroLabel = imovelFiltro ? `Imóvel ${imovelFiltro}${ruaFiltro ? ` — ${ruaFiltro}` : ''}` : bairroFiltro ? (ruaFiltro ? `${ruaFiltro} — ${bairroFiltro}` : bairroFiltro) : null

  // Drill do gráfico "Imóveis por situação da guia": clique numa situação → lista de imóveis
  const [situacaoSel, setSituacaoSel] = useState<string | null>(null)
  const [buscaSituacao, setBuscaSituacao] = useState('')
  const [imoveisSituacao, setImoveisSituacao] = useState<{ cd: number; nome: string; inscricao: string; numero: string }[]>([])
  const [carregSituacao, setCarregSituacao] = useState(false)

  // Drill do gráfico "Imóveis por status de pagamento": clique num status → lista de imóveis
  const [pagtoSel, setPagtoSel] = useState<{ status: string; categoria: string } | null>(null)
  const [buscaPagto, setBuscaPagto] = useState('')
  const [imoveisPagto, setImoveisPagto] = useState<{ cd: number; nome: string; inscricao: string; numero: string }[]>([])
  const [carregPagto, setCarregPagto] = useState(false)

  // Imóveis por situação da guia × status de pagamento
  useEffect(() => {
    if (!ano) return
    let vivo = true; setRes(null)
    fetchJson(`/api/tca/resumo?ano=${ano}${filtroBairroQ}${filtroRuaQ}${filtroImovelQ}`).then(d => { if (vivo && d && !d.error) setRes(d) })
    return () => { vivo = false }
  }, [ano, filtroBairroQ, filtroRuaQ, filtroImovelQ])

  // Volta os drills p/ raiz quando ano ou bairro/rua/imóvel filtrados mudam
  useEffect(() => { setSituacaoSel(null); setBuscaSituacao(''); setPagtoSel(null); setBuscaPagto('') }, [ano, filtroBairroQ, filtroRuaQ, filtroImovelQ])

  useEffect(() => {
    if (!situacaoSel || !ano) { setImoveisSituacao([]); return }
    let vivo = true
    setCarregSituacao(true)
    const t = setTimeout(() => {
      const p = new URLSearchParams({ ano: String(ano), situacao: situacaoSel })
      if (bairroFiltro) p.set('bairro', bairroFiltro)
      if (bairroFiltro && ruaFiltro) p.set('rua', ruaFiltro)
      if (imovelFiltro) p.set('imovel', String(imovelFiltro))
      fetchJson(`/api/tca/situacao-imoveis?${p}`).then(d => { if (vivo && d?.itens) setImoveisSituacao(d.itens) })
        .finally(() => { if (vivo) setCarregSituacao(false) })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [situacaoSel, ano, bairroFiltro, ruaFiltro, imovelFiltro])

  useEffect(() => {
    if (!pagtoSel || !ano) { setImoveisPagto([]); return }
    let vivo = true
    setCarregPagto(true)
    const t = setTimeout(() => {
      const p = new URLSearchParams({ ano: String(ano), categoria: pagtoSel.categoria })
      if (bairroFiltro) p.set('bairro', bairroFiltro)
      if (bairroFiltro && ruaFiltro) p.set('rua', ruaFiltro)
      if (imovelFiltro) p.set('imovel', String(imovelFiltro))
      fetchJson(`/api/tca/pagamento-imoveis?${p}`).then(d => { if (vivo && d?.itens) setImoveisPagto(d.itens) })
        .finally(() => { if (vivo) setCarregPagto(false) })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [pagtoSel, ano, bairroFiltro, ruaFiltro, imovelFiltro])

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(false)
    const p = new URLSearchParams()
    if (ano) p.set('ano', String(ano))
    if (mes) p.set('mes', String(mes))
    fetchJson(`/api/tca/visao?${p}${filtroBairroQ}${filtroRuaQ}${filtroImovelQ}`)
      .then(d => { if (!vivo) return; if (d) setV(d); else setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [ano, mes, filtroBairroQ, filtroRuaQ, filtroImovelQ, recarregar])

  // Drill por mês ao clicar num ano do gráfico
  useEffect(() => {
    if (!drillAno) { setSerieMes(null); return }
    let vivo = true; setCarregMes(true)
    fetchJson(`/api/tca/mensal?ano=${drillAno}`)
      .then(d => { if (vivo) setSerieMes(d?.meses ?? null) })
      .finally(() => { if (vivo) setCarregMes(false) })
    return () => { vivo = false }
  }, [drillAno])
  // volta para a visão anual quando o exercício selecionado muda
  useEffect(() => { setDrillAno(null) }, [ano])
  // volta para a visão mensal quando o ano do drill muda
  useEffect(() => { setDrillMes(null) }, [drillAno])

  // Drill por dia ao clicar num mês (dentro do drill de ano) — "Arrecadação Diária".
  // De/Até começam no período do mês clicado, mas ficam editáveis (mesmo padrão do IPTU).
  useEffect(() => {
    if (!drillAno || !drillMes) return
    const ld = new Date(drillAno, drillMes, 0).getDate()
    setDe(`${drillAno}-${String(drillMes).padStart(2, '0')}-01`)
    setAte(`${drillAno}-${String(drillMes).padStart(2, '0')}-${String(ld).padStart(2, '0')}`)
  }, [drillAno, drillMes])
  useEffect(() => {
    if (!drillMes || !de || !ate) { setDiario(null); return }
    let vivo = true; setCarregDiario(true); setDiarioErro(false)
    fetchJson(`/api/tca/diario?de=${de}&ate=${ate}`)
      .then(d => { if (!vivo) return; if (d) setDiario(d); else setDiarioErro(true) })
      .finally(() => { if (vivo) setCarregDiario(false) })
    return () => { vivo = false }
  }, [drillMes, de, ate])

  // Relatório (PDF/Excel) a partir dos cards + evolução do exercício atual.
  async function gerarRelatorio(tipo: 'pdf' | 'excel') {
    if (!v || gerandoRelatorio) return
    setGerandoRelatorio(true)
    try {
      const c = v.cards
      const money = (x: number) => 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const dados: DadosRelatorio = {
        titulo: `TCA — Exercício ${v.anoRef}${filtroLabel ? ' · ' + filtroLabel : ''}`,
        subtitulo: `Dados atualizados em ${fmtData(v.dataAtualizacao)}${mes ? ` · acumulado até ${MESES_LONGO[Number(mes) - 1]}` : ''}${filtroLabel ? ` · filtrado por ${filtroLabel}` : ''}`,
        cards: [
          { rotulo: 'Lançado', valor: money(c.lancado.atual) },
          { rotulo: 'Arrecadado', valor: money(c.arrecadado.atual) },
          { rotulo: 'Em aberto', valor: money(c.emAberto.atual) },
          { rotulo: 'Inadimplência', valor: money(c.inadimplencia.atual) },
          { rotulo: 'Isento', valor: money(c.isento.atual) },
          { rotulo: 'Suspenso', valor: money(c.suspenso.atual) },
        ],
        colunas: ['Exercício', 'Lançado', 'Arrecadado', '% Arrec.', 'Em aberto', 'Inadimplência', 'Isento', 'Suspenso'],
        // Uma única tabela: linhas de exercício (todas as 8 colunas) seguidas das linhas de
        // situação da guia e status de pagamento (só as 2 primeiras colunas preenchidas —
        // as demais ficam em "—", já que não fazem sentido para essas linhas). Respeitam o
        // bairro/rua selecionados no gráfico "TCA por Bairro" (ou tudo, se nada selecionado).
        linhas: [
          ...v.evolucao.map(e => [
            e.previsto ? `${e.ano} *` : e.ano, money(e.lancado), money(e.arrecadado),
            `${e.arrecPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, money(e.emAberto), money(e.inadimplencia), money(e.isento), money(e.suspenso),
          ]),
          ...(res ? [
            ...res.situacao.map(s => [`${s.situacao} (situação)`, s.qt.toLocaleString('pt-BR'), '—', '—', '—', '—', '—', '—']),
            ...res.pagamento.map(p => [`${p.status} (pagamento)`, p.qt.toLocaleString('pt-BR'), '—', '—', '—', '—', '—', '—']),
          ] : []),
        ],
        arquivo: `TCA-${v.anoRef}${bairroFiltro ? '-' + bairroFiltro.replace(/\s+/g, '-') : ''}`,
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

  const cardsDef = v ? [
    { label: 'Total Lançado', cmp: v.cards.lancado, cor: '#283e93', sub: `${fmtInt(v.cards.imoveis.atual)} imóveis`, icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>) },
    { label: 'Total Arrecadado', cmp: v.cards.arrecadado, cor: '#1fa463', sub: '', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.2-1.1 1.9-2.5 1.9A2.6 2 0 0 1 9.4 15M12 6v1.5M12 16.5V18" /></>) },
    { label: 'Total em Aberto', cmp: v.cards.emAberto, cor: '#e8962e', sub: 'a receber (total)', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
    { label: 'Total Inadimplência', cmp: v.cards.inadimplencia, cor: '#d64545', sub: 'vencido (atrasado)', icon: svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>) },
    { label: 'Total Isento', cmp: v.cards.isento, cor: '#8094d6', sub: 'isento de taxas', icon: svg(<><path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>) },
    { label: 'Total Suspenso', cmp: v.cards.suspenso, cor: '#5b6477', sub: '', icon: svg(<><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></>) },
  ] : []

  const serie = (v?.evolucao ?? []).map(e => ({ ...e, rot: e.previsto ? `${e.ano}*` : String(e.ano) }))
  const anoPrevisto = v?.evolucao.find(e => e.previsto)?.ano
  const insights = v ? insightsTca(v) : null
  const chartData = drillAno && serieMes
    ? serieMes.map(m => ({ rot: MESES_R[m.mes - 1], ano: 0, mes: m.mes, previsto: false, arrecPct: 0, inadPct: 0, lancado: m.lancado, arrecadado: m.arrecadado, emAberto: m.emAberto, inadimplencia: m.inadimplencia, isento: 0, suspenso: 0 }))
    : serie

  if (erro && !v) {
    return (
      <div style={{ ...card, marginTop: 20, textAlign: 'center', padding: 40, color: '#9098a8', fontSize: 13 }}>
        Não foi possível carregar os dados de TCA (instabilidade do agente/banco).{' '}
        <button onClick={() => setRecarregar(n => n + 1)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '6px 14px', fontSize: 12, marginLeft: 6 }}>Recarregar</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {carregando && !v ? <div style={{ ...card, marginTop: 20 }}><Spinner label="Carregando TCA…" /></div> : null}

      {v ? (
        <>
          {/* Barra de relatórios (Excel/PDF a partir dos cards + evolução) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            {([['pdf', 'Baixar PDF'], ['excel', 'Baixar Excel']] as const).map(([tipo, lbl]) => (
              <button key={tipo} onClick={() => gerarRelatorio(tipo)} disabled={gerandoRelatorio} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e3e9f5', background: '#fff', color: '#283e93', fontWeight: 600, cursor: gerandoRelatorio ? 'default' : 'pointer', opacity: gerandoRelatorio ? 0.6 : 1, borderRadius: 12, padding: '7px 14px', fontSize: 12, fontFamily: 'inherit' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>{gerandoRelatorio ? 'Gerando…' : lbl}
              </button>
            ))}
          </div>

          {/* Data de atualização */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <span style={{ fontSize: 11, color: '#9098a8' }}>Dados atualizados em <span style={{ color: '#5b6477', fontWeight: 600 }}>{fmtData(v.dataAtualizacao)}</span>{mes ? ` · acumulado até ${MESES_LONGO[Number(mes) - 1]}` : ''}</span>
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
              {carregMes || carregDiario ? <LoadingOverlay label={drillMes ? 'Carregando dias…' : 'Carregando meses…'} /> : null}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>
                  {drillMes ? `Arrecadação Diária · ${MESES_LONGO[drillMes - 1]}/${drillAno}${diario ? ` · ${fmtAbrev(diario.total)}` : ''}` : drillAno ? `Evolução mensal · ${drillAno}` : 'Evolução da TCA (3 anos)'}{filtroLabel ? ` · ${filtroLabel}` : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {drillMes ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5b6477' }}>
                      <span>De</span>
                      <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ border: '1.5px solid #e3e9f5', borderRadius: 10, padding: '5px 8px', fontSize: 12, color: '#283e93', fontFamily: 'inherit' }} />
                      <span>até</span>
                      <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ border: '1.5px solid #e3e9f5', borderRadius: 10, padding: '5px 8px', fontSize: 12, color: '#283e93', fontFamily: 'inherit' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#5b6477' }}>
                      {[{ label: 'Lançado', cor: '#283e93' }, { label: 'Arrecadado', cor: '#1fa463' }, { label: 'Em aberto', cor: '#e8962e' }, { label: 'Inadimplência', cor: '#d64545' }, { label: 'Isento', cor: '#8094d6' }, { label: 'Suspenso', cor: '#5b6477' }].map(m => (
                        <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: m.cor }} />{m.label}</span>
                      ))}
                    </div>
                  )}
                  {drillMes ? <button onClick={() => setDrillMes(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11 }}>‹ Voltar aos meses</button>
                    : drillAno ? <button onClick={() => setDrillAno(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11 }}>‹ Voltar</button> : null}
                </div>
              </div>
              {drillMes ? (
                diario && diario.dias.length ? (() => {
                  const data = diario.dias.map(x => ({ t: new Date(x.dia + 'T00:00:00').getTime(), valor: x.valor }))
                  const ticks: number[] = []
                  if (data.length) {
                    const step = Math.max(1, Math.ceil(data.length / 8))
                    for (let i = 0; i < data.length; i += step) ticks.push(data[i].t)
                    const last = data[data.length - 1].t
                    if (ticks[ticks.length - 1] !== last) ticks.push(last)
                  }
                  return (
                    <div style={{ marginTop: 16, height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs><linearGradient id="tcaDiaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" stopOpacity="0.25" /><stop offset="100%" stopColor="#283e93" stopOpacity="0" /></linearGradient></defs>
                          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks.length ? ticks : undefined}
                            tickFormatter={(t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 10.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} minTickGap={0} />
                          <YAxis width={44} tickFormatter={(v: number) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            labelFormatter={(t) => new Date(t as number).toLocaleDateString('pt-BR')}
                            formatter={(v) => ['R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Arrecadado'] as [string, string]}
                            contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                          <Area dataKey="valor" stroke="#283e93" strokeWidth={1.8} fill="url(#tcaDiaGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })() : diarioErro ? (
                  <div style={{ fontSize: 12, color: '#9098a8', padding: '40px 0', textAlign: 'center' }}>Não foi possível carregar.</div>
                ) : !carregDiario ? (
                  <div style={{ fontSize: 12, color: '#9098a8', padding: '40px 0', textAlign: 'center' }}>Sem arrecadação no período.</div>
                ) : null
              ) : (
                <div style={{ marginTop: 16, height: 300, cursor: !drillMes ? 'pointer' : 'default' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%"
                      onClick={(e) => {
                        const st = e as unknown as { activePayload?: { payload?: { ano?: number; mes?: number; previsto?: boolean } }[]; activeLabel?: string }
                        const pl = st?.activePayload?.[0]?.payload
                        if (drillAno) {
                          // Já em visão mensal: clique num mês abre a Arrecadação Diária daquele mês.
                          if (pl?.mes) setDrillMes(pl.mes)
                          return
                        }
                        // Clique caiu exatamente na barra → usa o payload (respeita previsto).
                        if (pl?.ano) { if (!pl.previsto) setDrillAno(pl.ano); return }
                        // Fallback: clique na coluna mas fora da barra — activeLabel é "2027*" p/ previsão
                        // (Number(...) vira NaN, então já exclui o ano previsto naturalmente).
                        const anoFallback = Number(st?.activeLabel)
                        if (anoFallback) setDrillAno(anoFallback)
                      }}>
                      <XAxis dataKey="rot" interval={0} height={24} tick={<EixoTick />} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                      <YAxis width={44} tickFormatter={(val: number) => (val / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
                        formatter={(val, name) => ['R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name] as [string, string]}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                      {(['lancado', 'arrecadado', 'emAberto', 'inadimplencia', 'isento', 'suspenso'] as const).map(dk => (
                        <Bar key={dk} dataKey={dk} name={{ lancado: 'Lançado', arrecadado: 'Arrecadado', emAberto: 'Em aberto', inadimplencia: 'Inadimplência', isento: 'Isento', suspenso: 'Suspenso' }[dk]} radius={[3, 3, 0, 0]} maxBarSize={32} stroke="none">
                          {chartData.map((s, i) => <Cell key={i} fill={CORES[dk][s.previsto ? 1 : 0]} stroke="none" />)}
                          <LabelList dataKey={dk} position="top" formatter={(val) => (Number(val) ? fmtAbrev(Number(val)) : '')} fontSize={8.5} fill="#8a93a6" />
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 4 }}>
                {drillMes ? 'Arrecadado por dia de baixa — ajuste o período acima para ver outro intervalo.'
                  : drillAno ? `Meses de ${drillAno} · lançado/em aberto por mês de vencimento, arrecadado por mês de baixa · clique num mês para detalhar por dia`
                  : `Clique num ano para detalhar por mês · barras claras = previsão ${anoPrevisto ?? ''} (regressão linear dos últimos 5 anos)`}
              </div>
            </div>

            {/* Insights */}
            <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
                </div>
                <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>TCA</span>
              </div>
              <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights de TCA</div>
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

          {/* Análise por bairro/rua/imóvel — a seleção interage com a Evolução da TCA (cards +
              tabela + previsão, acima) e com os quadros de situação/pagamento (abaixo) */}
          <SecaoBairros endpoint="/api/tca/bairros" ano={ano} titulo="TCA por Bairro" mostrarNaoLancados permitirDrillImovel
            onSelecao={(b, r, im) => { setBairroFiltro(b); setRuaFiltro(r); setImovelFiltro(im) }} />

          {/* Quadros situação × status de pagamento (igual ao IPTU) — respeitam o bairro/rua/
              imóvel selecionados no gráfico "TCA por Bairro" acima */}
          {filtroLabel ? (
            <div style={{ fontSize: 11, color: '#5b6477', marginTop: 14 }}>
              Evolução, situação e forma de pagamento filtrados por: <b style={{ color: '#283e93' }}>{filtroLabel}</b>
            </div>
          ) : null}
          {res ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: filtroLabel ? 8 : 18 }}>
              {/* Imóveis por situação da guia — clique numa situação faz drill para os imóveis */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  {situacaoSel ? (
                    <button onClick={() => { setSituacaoSel(null); setBuscaSituacao('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#283e93', fontSize: 15, fontWeight: 600 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" /></svg>
                      {situacaoSel}
                    </button>
                  ) : (
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Imóveis por situação da guia</span>
                  )}
                </div>
                {situacaoSel ? (
                  <div style={{ marginTop: 12, position: 'relative' }}>
                    {carregSituacao ? <LoadingOverlay label="Carregando imóveis…" /> : null}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '7px 12px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                      <input value={buscaSituacao} onChange={e => setBuscaSituacao(e.target.value)} placeholder="Buscar proprietário ou inscrição…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
                    </div>
                    {(() => {
                      const q = buscaSituacao.trim().toUpperCase()
                      const lista = q ? imoveisSituacao.filter(im => im.nome.toUpperCase().includes(q) || im.inscricao.toUpperCase().includes(q)) : imoveisSituacao
                      return (
                        <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {lista.length ? lista.map(im => (
                            <div key={im.cd} style={{ padding: '8px 6px', borderRadius: 8, borderBottom: '1px solid #f0f2f8' }}>
                              <div style={{ fontSize: 12, color: '#1f2a44', fontWeight: 600 }}>{im.nome || '—'}</div>
                              <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 1 }}>{[im.inscricao ? `Insc. ${im.inscricao}` : '', im.numero ? `Nº ${im.numero}` : ''].filter(Boolean).join(' · ') || '—'}</div>
                            </div>
                          )) : !carregSituacao ? (
                            <div style={{ fontSize: 12, color: '#9098a8', padding: '16px 0', textAlign: 'center' }}>Nenhum imóvel encontrado.</div>
                          ) : null}
                          {imoveisSituacao.length >= 300 ? <div style={{ fontSize: 10, color: '#aeb6c6', textAlign: 'center', marginTop: 4 }}>Mostrando os 300 primeiros — refine a busca para ver mais.</div> : null}
                        </div>
                      )
                    })()}
                  </div>
                ) : (() => {
                  const mx = Math.max(1, ...res.situacao.map(s => s.qt))
                  return (
                    <>
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
                        {res.situacao.map(s => (
                          <div key={s.situacao} onClick={() => setSituacaoSel(s.situacao)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ color: '#3a4256', fontWeight: 600 }}>{s.situacao}</span>
                              <span style={{ color: '#283e93', fontWeight: 700 }}>{s.qt.toLocaleString('pt-BR')}</span>
                            </div>
                            <div style={{ height: 16, borderRadius: 8, background: '#eef1f7', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.max(3, 100 * s.qt / mx).toFixed(1)}%`, borderRadius: 8, background: '#283e93' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique numa situação para ver os imóveis</div>
                    </>
                  )
                })()}
              </div>

              {/* Imóveis por status de pagamento — clique num status faz drill para os imóveis */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  {pagtoSel ? (
                    <button onClick={() => { setPagtoSel(null); setBuscaPagto('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#283e93', fontSize: 15, fontWeight: 600 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" /></svg>
                      {pagtoSel.status}
                    </button>
                  ) : (
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Imóveis por status de pagamento</span>
                  )}
                </div>
                {pagtoSel ? (
                  <div style={{ marginTop: 12, position: 'relative' }}>
                    {carregPagto ? <LoadingOverlay label="Carregando imóveis…" /> : null}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '7px 12px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                      <input value={buscaPagto} onChange={e => setBuscaPagto(e.target.value)} placeholder="Buscar proprietário ou inscrição…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
                    </div>
                    {(() => {
                      const q = buscaPagto.trim().toUpperCase()
                      const lista = q ? imoveisPagto.filter(im => im.nome.toUpperCase().includes(q) || im.inscricao.toUpperCase().includes(q)) : imoveisPagto
                      return (
                        <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {lista.length ? lista.map(im => (
                            <div key={im.cd} style={{ padding: '8px 6px', borderRadius: 8, borderBottom: '1px solid #f0f2f8' }}>
                              <div style={{ fontSize: 12, color: '#1f2a44', fontWeight: 600 }}>{im.nome || '—'}</div>
                              <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 1 }}>{[im.inscricao ? `Insc. ${im.inscricao}` : '', im.numero ? `Nº ${im.numero}` : ''].filter(Boolean).join(' · ') || '—'}</div>
                            </div>
                          )) : !carregPagto ? (
                            <div style={{ fontSize: 12, color: '#9098a8', padding: '16px 0', textAlign: 'center' }}>Nenhum imóvel encontrado.</div>
                          ) : null}
                          {imoveisPagto.length >= 300 ? <div style={{ fontSize: 10, color: '#aeb6c6', textAlign: 'center', marginTop: 4 }}>Mostrando os 300 primeiros — refine a busca para ver mais.</div> : null}
                        </div>
                      )
                    })()}
                  </div>
                ) : (() => {
                  const mx = Math.max(1, ...res.pagamento.map(p => p.qt))
                  return (
                    <>
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
                        {res.pagamento.map(p => (
                          <div key={p.status} onClick={() => setPagtoSel({ status: p.status, categoria: p.categoria })} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ color: '#3a4256', fontWeight: 600 }}>{p.status}</span>
                              <span style={{ color: p.cor, fontWeight: 700 }}>{p.qt.toLocaleString('pt-BR')}</span>
                            </div>
                            <div style={{ height: 16, borderRadius: 8, background: '#eef1f7', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.max(3, 100 * p.qt / mx).toFixed(1)}%`, borderRadius: 8, background: p.cor }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique num status para ver os imóveis</div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}

          {/* Tabela de exercícios */}
          <div style={{ ...card, marginTop: 18, overflowX: 'auto' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Exercícios de TCA</span>
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
            <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 8 }}>* exercício previsto (regressão linear). Valores por exercício de lançamento da guia (cd_tributo 67).</div>
          </div>
        </>
      ) : null}
    </div>
  )
}
