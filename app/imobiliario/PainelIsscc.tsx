'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend } from 'recharts'
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
  cards: { lancado: Cmp; arrecadado: Cmp; inadimplencia: Cmp; emAberto: Cmp; isento: Cmp; suspenso: Cmp; quantidade: Cmp }
  evolucao: { ano: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; previsto: boolean; arrecPct: number; inadPct: number }[]
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
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
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

export default function PainelIsscc({ ano, mes }: { ano: number | ''; mes?: number | '' }) {
  const [v, setV] = useState<Visao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [recarregar, setRecarregar] = useState(0)
  const [drillAno, setDrillAno] = useState<number | null>(null)
  const [serieMes, setSerieMes] = useState<Mes[] | null>(null)
  const [carregMes, setCarregMes] = useState(false)
  // Item 2 — histórico de área edificada × quantidade de ISSCC
  const [areaHist, setAreaHist] = useState<{ ano: number; imoveisAlterados: number; areaEdificada: number; qtdIsscc: number; valorIsscc: number }[] | null>(null)
  // Vínculos mobiliários/imobiliários (agregado)
  const [vinculos, setVinculos] = useState<{ imoveis: number; comMobiliario: number; proprietarioPJ: number } | null>(null)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  // Drill do quadro "Vínculos mobiliários e imobiliários": clique numa categoria → lista de imóveis
  const [vinculoSel, setVinculoSel] = useState<{ categoria: 'imoveis' | 'comMobiliario' | 'proprietarioPJ'; label: string } | null>(null)
  const [buscaVinculo, setBuscaVinculo] = useState('')
  const [imoveisVinculo, setImoveisVinculo] = useState<{ cd: number; inscricao: string; numero: string; proprietario: string }[]>([])
  const [carregandoVinculo, setCarregandoVinculo] = useState(false)
  // Bairro/rua/imóvel selecionados no drill de "ISSCC por Bairro" — só usados pro banner
  // "Limpar filtro" (igual IPTU/TCA/ITBI): esse filtro não afeta KPIs/Evolução do ISSCC,
  // só o próprio gráfico. Força o remount de <SecaoBairros> ao limpar (via key incremental),
  // já que o componente só expõe a seleção pro pai via onSelecao (fluxo filho→pai).
  const [bairroFiltro, setBairroFiltro] = useState<string | null>(null)
  const [ruaFiltro, setRuaFiltro] = useState<string | null>(null)
  const [imovelFiltro, setImovelFiltro] = useState<number | null>(null)
  const [resetBairros, setResetBairros] = useState(0)
  const filtroLabelBairro = imovelFiltro ? `Imóvel ${imovelFiltro}${ruaFiltro ? ` — ${ruaFiltro}` : ''}` : bairroFiltro ? (ruaFiltro ? `${ruaFiltro} — ${bairroFiltro}` : bairroFiltro) : null
  function limparFiltroBairro() { setBairroFiltro(null); setRuaFiltro(null); setImovelFiltro(null); setResetBairros(n => n + 1) }

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(false)
    const p = new URLSearchParams()
    if (ano) p.set('ano', String(ano))
    if (mes) p.set('mes', String(mes))
    fetchJson(`/api/isscc/visao?${p}`)
      .then(d => { if (!vivo) return; if (d) setV(d); else setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [ano, mes, recarregar])

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

  // Vínculos (agregado) por exercício — acumulado até o mês (YTD), quando selecionado
  useEffect(() => {
    if (!ano) return
    let vivo = true; setVinculos(null)
    const p = new URLSearchParams({ ano: String(ano) })
    if (mes) p.set('mes', String(mes))
    fetchJson(`/api/isscc/vinculos?${p}`).then(d => { if (vivo && d && !d.error) setVinculos(d) })
    return () => { vivo = false }
  }, [ano, mes])
  useEffect(() => { setVinculoSel(null); setBuscaVinculo('') }, [ano, mes])

  // Drill "Vínculos mobiliários e imobiliários": busca a lista quando uma categoria está selecionada
  useEffect(() => {
    if (!vinculoSel || !ano) { setImoveisVinculo([]); return }
    let vivo = true
    setCarregandoVinculo(true)
    const t = setTimeout(() => {
      const p = new URLSearchParams({ ano: String(ano), categoria: vinculoSel.categoria })
      if (mes) p.set('mes', String(mes))
      if (buscaVinculo.trim()) p.set('q', buscaVinculo.trim())
      fetchJson(`/api/isscc/vinculos-imoveis?${p}`).then(d => { if (vivo && d?.itens) setImoveisVinculo(d.itens) })
        .finally(() => { if (vivo) setCarregandoVinculo(false) })
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [vinculoSel, buscaVinculo, ano, mes])

  useEffect(() => {
    let vivo = true; setAreaHist(null)
    const p = new URLSearchParams()
    if (mes) p.set('mes', String(mes))
    fetchJson(`/api/isscc/area-historico?${p}`).then(d => { if (vivo && d?.serie) setAreaHist(d.serie) })
    return () => { vivo = false }
  }, [mes])

  // Relatório (PDF/Excel) a partir dos cards + evolução do exercício atual.
  async function gerarRelatorio(tipo: 'pdf' | 'excel') {
    if (!v || gerandoRelatorio) return
    setGerandoRelatorio(true)
    try {
      const c = v.cards
      const money = (x: number) => 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const dados: DadosRelatorio = {
        titulo: `ISSCC — Exercício ${v.anoRef}`,
        subtitulo: `Dados atualizados em ${fmtData(v.dataAtualizacao)}${mes ? ` · acumulado até ${MESES_LONGO[Number(mes) - 1]}` : ''}`,
        cards: [
          { rotulo: 'Lançado', valor: money(c.lancado.atual) },
          { rotulo: 'Arrecadado', valor: money(c.arrecadado.atual) },
          { rotulo: 'Em aberto', valor: money(c.emAberto.atual) },
          { rotulo: 'Inadimplência', valor: money(c.inadimplencia.atual) },
          { rotulo: 'Isento', valor: money(c.isento.atual) },
          { rotulo: 'Suspenso', valor: money(c.suspenso.atual) },
        ],
        colunas: ['Exercício', 'Lançado', 'Arrecadado', '% Arrec.', 'Em aberto', 'Inadimplência'],
        linhas: v.evolucao.map(e => [
          e.previsto ? `${e.ano} *` : e.ano, money(e.lancado), money(e.arrecadado),
          `${e.arrecPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, money(e.emAberto), money(e.inadimplencia),
        ]),
        arquivo: `ISSCC-${v.anoRef}`,
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
    { label: 'Total Lançado', cmp: v.cards.lancado, cor: '#283e93', sub: `${fmtInt(v.cards.quantidade.atual)} lançamentos`, icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>) },
    { label: 'Total Arrecadado', cmp: v.cards.arrecadado, cor: '#1fa463', sub: '', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.2-1.1 1.9-2.5 1.9A2.6 2 0 0 1 9.4 15M12 6v1.5M12 16.5V18" /></>) },
    { label: 'Total em Aberto', cmp: v.cards.emAberto, cor: '#e8962e', sub: 'a receber (total)', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
    { label: 'Total Inadimplência', cmp: v.cards.inadimplencia, cor: '#d64545', sub: 'vencido (atrasado)', icon: svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>) },
    { label: 'Total Isento', cmp: v.cards.isento, cor: '#8094d6', sub: 'isento', icon: svg(<><path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>) },
    { label: 'Total Suspenso', cmp: v.cards.suspenso, cor: '#5b6477', sub: '', icon: svg(<><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></>) },
  ] : []

  const LABELS_EVOL: Record<string, string> = { lancado: 'Lançado', arrecadado: 'Arrecadado', emAberto: 'Em aberto', inadimplencia: 'Inadimplência' }
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
      {carregando && !v ? <div style={{ ...card, marginTop: 20 }}><Spinner label="Carregando ISSCC…" /></div> : null}

      {v ? (
        <>
          {/* Cabeçalho — exercício/mês em análise, igual ao padrão do IPTU. Repetido (com
              rótulo próprio) em cada gráfico abaixo, a pedido do usuário. */}
          <div style={{ margin: '14px 4px 0' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#283e93' }}>Visão Geral do ISSCC · Exercício {v.anoRef}{mes ? ` · até ${MESES_LONGO[Number(mes) - 1]}` : ''}</span>
          </div>

          {/* Barra de relatórios (Excel/PDF a partir dos cards + evolução) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            {([['pdf', 'Baixar PDF'], ['excel', 'Baixar Excel']] as const).map(([tipo, lbl]) => (
              <button key={tipo} onClick={() => gerarRelatorio(tipo)} disabled={gerandoRelatorio} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e3e9f5', background: '#fff', color: '#283e93', fontWeight: 600, cursor: gerandoRelatorio ? 'default' : 'pointer', opacity: gerandoRelatorio ? 0.6 : 1, borderRadius: 12, padding: '7px 14px', fontSize: 12, fontFamily: 'inherit' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>{gerandoRelatorio ? 'Gerando…' : lbl}
              </button>
            ))}
          </div>

          {/* Data de atualização */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: '#5b6477', background: '#fff', borderRadius: 20, padding: '6px 14px', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              Dados atualizados em <b style={{ color: '#283e93' }}>{fmtData(v.dataAtualizacao)}</b>{mes ? ` · acumulado até ${MESES_LONGO[Number(mes) - 1]}` : ''}
            </span>
          </div>

          {/* Banner de filtro do gráfico "ISSCC por Bairro" (igual ao IPTU/TCA/ITBI) — aqui o
              filtro só afeta esse gráfico (KPIs e Evolução não usam bairro). */}
          {filtroLabelBairro ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#eef1fb', border: '1px solid #d6ddf6', borderRadius: 12, padding: '8px 14px', margin: '8px 4px 0' }}>
              <span style={{ fontSize: 12.5, color: '#283e93', fontWeight: 600 }}>"ISSCC por Bairro" filtrado por: <b>{filtroLabelBairro}</b></span>
              <button onClick={limparFiltroBairro} style={{ border: 'none', background: '#283e93', color: '#fff', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>Limpar filtro</button>
            </div>
          ) : null}

          {/* 6 KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginTop: 8, position: 'relative' }}>
            {carregando ? <LoadingOverlay label="Atualizando…" /> : null}
            {cardsDef.map(c => (
              <div key={c.label} style={card}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5b6477', display: 'block' }}>{c.label}</span>
                <span style={{ fontSize: 9.5, color: '#aeb6c6', display: 'block', height: 12 }}>{mes ? `até ${MESES_LONGO[Number(mes) - 1]}` : (c.sub || ' ')}</span>
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
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>{drillAno ? `Evolução mensal · ${drillAno}` : `Evolução do ISSCC (5 anos)${mes ? ` · até ${MESES_LONGO[Number(mes) - 1]}` : ''}`}</span>
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
                      const st = e as unknown as { activePayload?: { payload?: { ano?: number; previsto?: boolean } }[]; activeLabel?: string }
                      const pl = st?.activePayload?.[0]?.payload
                      if (drillAno) return
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
                      content={(props) => {
                        const { active, label, payload } = props as unknown as { active?: boolean; label?: string | number; payload?: { dataKey?: string; value?: number; payload?: { previsto?: boolean } }[] }
                        if (!active || !payload || !payload.length) return null
                        const previsto = !!payload[0]?.payload?.previsto
                        const itens = payload.filter(p => Number(p.value) > 0)
                        if (!itens.length) return null
                        return (
                          <div style={{ background: '#23304b', borderRadius: 10, padding: '9px 12px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{label}{previsto ? ' (previsto)' : ''}</div>
                            {itens.map((p, i) => (
                              <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: i === 0 ? 4 : 2 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: CORES[p.dataKey as string]?.[previsto ? 1 : 0] ?? '#8094d6', flex: 'none' }} />
                                {LABELS_EVOL[p.dataKey as string] ?? p.dataKey}: R$ {(Number(p.value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            ))}
                          </div>
                        )
                      }} />
                    {(['lancado', 'arrecadado', 'emAberto', 'inadimplencia'] as const).map(dk => (
                      <Bar key={dk} dataKey={dk} name={LABELS_EVOL[dk]} radius={[3, 3, 0, 0]} maxBarSize={drillAno ? 16 : 22} stroke="none">
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

          {/* Análise por bairro/rua (todos os tipos de lançamento) */}
          <SecaoBairros key={resetBairros} endpoint="/api/isscc/bairros" ano={ano} mes={mes}
            titulo={`ISSCC por Bairro · Exercício ${ano}${mes ? ` até ${MESES_LONGO[Number(mes) - 1]}` : ''}`}
            mostrarNaoLancados permitirDrillImovel
            onSelecao={(b, r, im) => { setBairroFiltro(b); setRuaFiltro(r); setImovelFiltro(im) }} />

          {/* Vínculos mobiliários e imobiliários (agregado) — clique numa categoria faz drill pra lista de imóveis */}
          <div style={{ ...card, marginTop: 18, position: 'relative' }}>
            {carregandoVinculo ? <LoadingOverlay label="Carregando imóveis…" /> : null}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              {vinculoSel ? (
                <button onClick={() => { setVinculoSel(null); setBuscaVinculo('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#283e93', fontSize: 15, fontWeight: 600 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" /></svg>
                  {vinculoSel.label}
                </button>
              ) : (
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Vínculos mobiliários e imobiliários</span>
                  <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Imóveis com lançamento de ISSCC no exercício de {v.anoRef}{mes ? ` até ${MESES_LONGO[Number(mes) - 1]}` : ''} e seus vínculos</div>
                </div>
              )}
              {vinculoSel ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '5px 10px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  <input value={buscaVinculo} onChange={e => setBuscaVinculo(e.target.value)} placeholder="Buscar inscrição ou proprietário…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 170, fontFamily: 'inherit' }} />
                </div>
              ) : null}
            </div>
            {vinculoSel ? (
              <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {imoveisVinculo.length ? imoveisVinculo.map(it => (
                  <div key={it.cd} style={{ padding: '8px 4px', borderRadius: 8, borderBottom: '1px solid #f0f2f8' }}>
                    <div style={{ fontSize: 12, color: '#1f2a44', fontWeight: 600 }}>{it.proprietario || `Imóvel ${it.cd}`}</div>
                    <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 1 }}>{it.inscricao ? `Insc. ${it.inscricao}` : `Código ${it.cd}`}{it.numero ? ` · Nº ${it.numero}` : ''}</div>
                  </div>
                )) : !carregandoVinculo ? (
                  <div style={{ fontSize: 12, color: '#9098a8', padding: '16px 0', textAlign: 'center' }}>Nenhum imóvel encontrado.</div>
                ) : null}
                {imoveisVinculo.length >= 300 ? <div style={{ fontSize: 10, color: '#aeb6c6', textAlign: 'center', marginTop: 6 }}>Mostrando os 300 primeiros — refine a busca para ver mais.</div> : null}
              </div>
            ) : vinculos ? (() => {
              const base = Math.max(1, vinculos.imoveis)
              const itens = [
                { l: 'Imóveis com ISSCC', v: vinculos.imoveis, c: '#283e93', pct: 100, categoria: 'imoveis' as const },
                { l: 'Com empresa no endereço (mobiliário)', v: vinculos.comMobiliario, c: '#e8962e', pct: 100 * vinculos.comMobiliario / base, categoria: 'comMobiliario' as const },
                { l: 'Proprietário PJ (imobiliário)', v: vinculos.proprietarioPJ, c: '#1fa463', pct: 100 * vinculos.proprietarioPJ / base, categoria: 'proprietarioPJ' as const },
              ]
              return (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {itens.map((it, i) => (
                    <div key={i} onClick={() => setVinculoSel({ categoria: it.categoria, label: it.l })} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#3a4256', fontWeight: 600 }}>{it.l}</span>
                        <span style={{ color: it.c, fontWeight: 700 }}>{it.v.toLocaleString('pt-BR')} {i > 0 ? <span style={{ color: '#9098a8', fontWeight: 400 }}>({it.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)</span> : null}</span>
                      </div>
                      <div style={{ height: 15, borderRadius: 8, background: '#eef1f7', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, it.pct).toFixed(1)}%`, borderRadius: 8, background: it.c }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#aeb6c6' }}>Mobiliário = empresa registrada no endereço do imóvel. Imobiliário = proprietário pessoa jurídica. Clique numa categoria para ver os imóveis.</div>
                </div>
              )
            })() : <Spinner label="Carregando vínculos…" padding={20} />}
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
            <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 8 }}>* exercício previsto (regressão linear). Valores por exercício de lançamento da guia (cd_tributo 40/17/18).{mes ? ` Acumulado até ${MESES_LONGO[Number(mes) - 1]} em todos os anos.` : ''}</div>
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
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Imóveis com alteração estrutural no ano vs quantidade de ISSCC lançados — mede se a atividade de construção acompanha o tributo.{mes ? ` Acumulado até ${MESES_LONGO[Number(mes) - 1]} em todos os anos.` : ''}</div>
            {areaHist ? (
              <>
                <div style={{ marginTop: 16, height: 300, minWidth: 560 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={areaHist} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
                      <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#8a93a6', fontWeight: 600 }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                      <YAxis yAxisId="area" width={48} tickFormatter={(val: number) => (val / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="qtd" orientation="right" width={40} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={(props) => {
                          const { active, label, payload } = props as unknown as { active?: boolean; label?: string | number; payload?: { dataKey?: string; name?: string; value?: number; color?: string }[] }
                          if (!active || !payload || !payload.length) return null
                          return (
                            <div style={{ background: '#23304b', borderRadius: 10, padding: '9px 12px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{label}</div>
                              {payload.map((p, i) => {
                                const n = Number(p.value) || 0
                                const texto = p.dataKey === 'areaEdificada' ? n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' m²' : n.toLocaleString('pt-BR')
                                return (
                                  <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: i === 0 ? 4 : 2 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color ?? '#8094d6', flex: 'none' }} />
                                    {p.name}: {texto}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }} />
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
            ) : <Spinner label="Carregando histórico de área…" padding={24} />}
          </div>
        </>
      ) : null}
    </div>
  )
}
