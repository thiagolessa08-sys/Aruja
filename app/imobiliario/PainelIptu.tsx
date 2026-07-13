'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import LoadingOverlay from '../_components/LoadingOverlay'

// Busca com retry (o túnel do agente às vezes devolve 502; sem isso a tela fica em branco).
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

// Dispara true quando o elemento entra na viewport (lazy-load de seções pesadas).
function useOnScreen<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { rootMargin: '250px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])
  return { ref, visible }
}

interface Cmp { atual: number; ant: number; pct: number }
interface Visao {
  dataAtualizacao: string | null
  anos: number[]
  anoRef: number
  mesRef: number
  cards: { lancado: Cmp; arrecadado: Cmp; inadimplencia: Cmp; emAberto: Cmp; isento: Cmp; suspenso: Cmp }
  evolucao: { ano: number; lancado: number; arrecadado: number; inadimplencia: number; previsto: boolean; arrecPct: number; inadPct: number }[]
}
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
// abreviação compacta padrão: mi (milhão) e k (milhar). Ex.: 67,6 mi / 540 k
const fmtAbrev = (v: number) => {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const fmtMi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtNum = (v: number) => (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtPct = (p: number) => (p >= 0 ? '+' : '') + p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const fmtData = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'

type Metrica = 'lancado' | 'arrecadado' | 'inadimplencia'
const METRICAS: { id: Metrica; label: string; cor: string }[] = [
  { id: 'lancado', label: 'Lançado', cor: '#283e93' },
  { id: 'arrecadado', label: 'Arrecadado', cor: '#1fa463' },
  { id: 'inadimplencia', label: 'Inadimplência', cor: '#d64545' },
]

type Metrica4 = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia'
const METRICAS4: { id: Metrica4; label: string }[] = [
  { id: 'lancado', label: 'Lançado' }, { id: 'arrecadado', label: 'Arrecadado' },
  { id: 'emAberto', label: 'Em aberto' }, { id: 'inadimplencia', label: 'Inadimplência' },
]
interface RankItem { chave: string; nome: string; endereco: string; extra: string; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }
interface ImovelMatch { cd: number; inscricao: string; numero: string; endereco: string; proprietario: string }
interface ImovelDet {
  cd: number; inscricao: string; numero: string; endereco: string; cep: string; proprietario: string; cpfCnpj: string
  flags: { itbi: boolean; isscc: boolean; tca: boolean; espolio: boolean; semNumero: boolean }
  anos: { ano: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }[]
  anoParcela: number
  parcelas: { parcela: number; vencimento: string; lancado: number; pago: number; saldo: number }[]
}
interface Resumo {
  resumo: { comIptu: number; comItbi: number; comTca: number; comEmpresa: number; iptuSemTca: number }
  situacao: { situacao: string; qt: number }[]
  pagamento: { status: string; qt: number; cor: string }[]
}
interface Diario { de: string; ate: string; dias: { dia: string; valor: number }[]; total: number }

export default function PainelIptu({ ano }: { ano: number | '' }) {
  const [v, setV] = useState<Visao | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [metrica, setMetrica] = useState<Metrica>('lancado')
  const [drillAno, setDrillAno] = useState<number | null>(null) // ano em drill mensal na evolução
  const [mensalData, setMensalData] = useState<{ mes: number; lancado: number; arrecadado: number; inadimplencia: number }[]>([])
  const [carregandoMensal, setCarregandoMensal] = useState(false)
  const [res, setRes] = useState<Resumo | null>(null)
  const [diario, setDiario] = useState<Diario | null>(null)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  // Onda 3 — bairros
  const [bairros, setBairros] = useState<{ nome: string; lancado: number; arrecadado: number; inadimplencia: number; imoveis: number }[]>([])
  const [nivelBairro, setNivelBairro] = useState<'bairro' | 'rua'>('bairro')
  const [bairroSel, setBairroSel] = useState<string | null>(null)
  const [espolio, setEspolio] = useState(false)
  const [semNumero, setSemNumero] = useState(false)
  const [metricaBairro, setMetricaBairro] = useState<Metrica>('lancado')
  const [carregandoBairros, setCarregandoBairros] = useState(false)
  // Onda 4 — rankings
  const [rankTipo, setRankTipo] = useState<'imovel' | 'proprietario'>('imovel')
  const [rankMetrica, setRankMetrica] = useState<Metrica4>('lancado')
  const [rankItens, setRankItens] = useState<RankItem[]>([])
  const [carregandoRank, setCarregandoRank] = useState(false)
  // Onda 4 — pesquisa de imóvel
  const [buscaImovel, setBuscaImovel] = useState('')
  const [buscaTipo, setBuscaTipo] = useState<'inscricao' | 'codigo' | 'nome'>('inscricao')
  const [matches, setMatches] = useState<ImovelMatch[]>([])
  const [imovelDet, setImovelDet] = useState<ImovelDet | null>(null)
  const [carregandoDet, setCarregandoDet] = useState(false)
  // Lazy-load das seções pesadas (só busca quando aparecem na tela)
  const obsDiario = useOnScreen<HTMLDivElement>()
  const obsBairros = useOnScreen<HTMLDivElement>()
  const obsRank = useOnScreen<HTMLDivElement>()
  const obsResumo = useOnScreen<HTMLDivElement>()

  const qs = ano ? `?ano=${ano}` : ''
  const bairroQ = bairroSel ? `&bairro=${encodeURIComponent(bairroSel)}` : '' // filtro global de bairro

  // Visão geral (carrega já — é o topo da tela); reflete o bairro selecionado
  useEffect(() => {
    let vivo = true
    setCarregando(true); setDrillAno(null)
    fetchJson(`/api/imobiliario/iptu-visao${qs}${bairroQ}`)
      .then(d => { if (vivo && d && !d.error) setV(d) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [qs, bairroQ])

  // Resumo — lazy (abaixo da dobra)
  useEffect(() => {
    if (!obsResumo.visible) return
    let vivo = true
    fetchJson(`/api/imobiliario/iptu-resumo${qs}${bairroQ}`)
      .then(d => { if (vivo && d && !d.error) setRes(d) })
    return () => { vivo = false }
  }, [qs, bairroQ, obsResumo.visible])

  // Série mensal só quando o usuário clica num ano na evolução (drill)
  useEffect(() => {
    if (!drillAno) { setMensalData([]); return }
    let vivo = true
    setCarregandoMensal(true); setMensalData([])
    fetchJson(`/api/imobiliario/iptu-mensal?ano=${drillAno}`)
      .then(d => { if (vivo && d?.mensal) setMensalData(d.mensal) })
      .finally(() => { if (vivo) setCarregandoMensal(false) })
    return () => { vivo = false }
  }, [drillAno])

  // Ao trocar o ano, define o intervalo padrão da arrecadação diária (jan→dez do ano)
  useEffect(() => { if (ano) { setDe(`${ano}-01-01`); setAte(`${ano}-12-31`) } }, [ano])

  useEffect(() => {
    if (!de || !ate || !obsDiario.visible) return
    let vivo = true
    fetchJson(`/api/imobiliario/iptu-diario?ano=${ano}&de=${de}&ate=${ate}${bairroQ}`)
      .then(d => { if (vivo && d && !d.error) setDiario(d) })
    return () => { vivo = false }
  }, [ano, de, ate, bairroQ, obsDiario.visible])

  // Bairros (ou ruas quando há bairro selecionado) — query pesada, lazy + loading próprio
  useEffect(() => {
    if (!ano || !obsBairros.visible) return
    let vivo = true
    setCarregandoBairros(true)
    const p = new URLSearchParams({ ano: String(ano) })
    if (espolio) p.set('espolio', '1')
    if (semNumero) p.set('semnumero', '1')
    if (bairroSel) p.set('bairro', bairroSel)
    fetchJson(`/api/imobiliario/iptu-bairros?${p}`)
      .then(d => { if (vivo && d && !d.error) { setBairros(d.itens ?? []); setNivelBairro(d.nivel) } })
      .finally(() => { if (vivo) setCarregandoBairros(false) })
    return () => { vivo = false }
  }, [ano, espolio, semNumero, bairroSel, obsBairros.visible])

  // Rankings (100 maiores imóveis / proprietários) — lazy
  useEffect(() => {
    if (!ano || !obsRank.visible) return
    let vivo = true
    setCarregandoRank(true)
    fetchJson(`/api/imobiliario/iptu-ranking?ano=${ano}&tipo=${rankTipo}&metrica=${rankMetrica}${bairroQ}`)
      .then(d => { if (vivo && d && !d.error) setRankItens(d.itens ?? []) })
      .finally(() => { if (vivo) setCarregandoRank(false) })
    return () => { vivo = false }
  }, [ano, rankTipo, rankMetrica, bairroQ, obsRank.visible])

  // Busca de imóvel (debounce simples) — por inscrição, código ou nome
  useEffect(() => {
    const q = buscaImovel.trim()
    if (q.length < 2) { setMatches([]); return }
    let vivo = true
    const t = setTimeout(() => {
      fetchJson(`/api/imobiliario/iptu-imovel?q=${encodeURIComponent(q)}&tipo=${buscaTipo}`)
        .then(d => { if (vivo && d?.matches) setMatches(d.matches) })
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscaImovel, buscaTipo])

  function abrirImovel(cd: number) {
    setCarregandoDet(true); setMatches([])
    fetchJson(`/api/imobiliario/iptu-imovel?id=${cd}`)
      .then(d => { if (d?.detalhe) setImovelDet(d.detalhe) })
      .finally(() => setCarregandoDet(false))
  }

  const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }

  const svg = (paths: React.ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
  const mesRefLabel = v ? MESES_LONGO[(v.mesRef || 1) - 1] : ''
  // sub = esclarecimento do escopo do valor (arrecadado é YTD; inadimplência = vencido; em aberto = total)
  const cardsDef = v ? [
    { label: 'Total Lançado', cmp: v.cards.lancado, cor: '#283e93', sub: '', icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>) },
    { label: 'Total Arrecadado', cmp: v.cards.arrecadado, cor: '#1fa463', sub: `até ${mesRefLabel}`, icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.2-1.1 1.9-2.5 1.9A2.6 2 0 0 1 9.4 15M12 6v1.5M12 16.5V18" /></>) },
    { label: 'Total Inadimplência', cmp: v.cards.inadimplencia, cor: '#d64545', sub: 'vencido (atrasado)', icon: svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>) },
    { label: 'Total em Aberto', cmp: v.cards.emAberto, cor: '#e8962e', sub: 'a receber (total)', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
    { label: 'Total Isento', cmp: v.cards.isento, cor: '#8094d6', sub: '', icon: svg(<><path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>) },
    { label: 'Total Suspenso', cmp: v.cards.suspenso, cor: '#5b6477', sub: '', icon: svg(<><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></>) },
  ] : []

  // Evolução (5 anos + previsão) ou mensal (drill)
  const serie = v ? (drillAno
    ? mensalData.map(m => ({ rot: MESES[m.mes - 1], lancado: m.lancado, arrecadado: m.arrecadado, inadimplencia: m.inadimplencia, previsto: false, arrecPct: 0, inadPct: 0 }))
    : v.evolucao.map(e => ({ rot: String(e.ano), ano: e.ano, lancado: e.lancado, arrecadado: e.arrecadado, inadimplencia: e.inadimplencia, previsto: e.previsto, arrecPct: e.arrecPct, inadPct: e.inadPct }))
  ) : []
  const pctPorRot = new Map(serie.map(s => [s.rot, { arrecPct: s.arrecPct, inadPct: s.inadPct, previsto: s.previsto }]))
  // cores por métrica (tom forte = real, tom claro = previsto)
  const CORES = { lancado: ['#283e93', '#a9b6e2'], arrecadado: ['#1fa463', '#9adcbc'], inadimplencia: ['#d64545', '#eeaeae'] }
  // tick do eixo X: ano/mês + (no anual) % arrecadado e inadimplência frente ao lançado
  const EixoTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const x = props.x ?? 0, y = props.y ?? 0, rot = props.payload?.value ?? ''
    const p = pctPorRot.get(rot)
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={13} textAnchor="middle" fontSize={12} fontWeight={p?.previsto ? 700 : 500} fill={p?.previsto ? '#8a97c9' : '#5b6477'}>{rot}{p?.previsto ? ' • prev' : ''}</text>
        {!drillAno && p ? <text x={0} y={0} dy={27} textAnchor="middle" fontSize={9.5} fill="#9098a8">Arr {p.arrecPct.toFixed(0)}% · Inad {p.inadPct.toFixed(0)}%</text> : null}
      </g>
    )
  }

  return (
    <div style={{ position: 'relative', marginTop: 18 }}>
      {carregando ? <LoadingOverlay /> : null}

      {/* Cabeçalho + data de atualização */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, margin: '0 4px 4px' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#283e93' }}>Visão Geral do IPTU {v ? `· ${v.anoRef}` : ''}</span>
        <span style={{ fontSize: 12, color: '#5b6477', background: '#fff', borderRadius: 20, padding: '6px 14px', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
          Dados atualizados em <b style={{ color: '#283e93' }}>{fmtData(v?.dataAtualizacao ?? null)}</b>
        </span>
      </div>

      {/* Banner de filtro global por bairro */}
      {bairroSel ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#eef1fb', border: '1px solid #d6ddf6', borderRadius: 12, padding: '8px 14px', margin: '8px 4px 0' }}>
          <span style={{ fontSize: 12.5, color: '#283e93', fontWeight: 600 }}>Toda a tela filtrada pelo bairro: <b>{bairroSel}</b></span>
          <button onClick={() => setBairroSel(null)} style={{ border: 'none', background: '#283e93', color: '#fff', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>Limpar filtro</button>
        </div>
      ) : null}

      {/* 6 cards — valor, ano anterior e % de variação. Arrecadado/Inadimplência/Em aberto
          usam mês de referência (YTD, ex.: até julho) para comparação justa com o ano anterior. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginTop: 14 }}>
        {cardsDef.map(c => (
          <div key={c.label} style={card}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5b6477', display: 'block' }}>{c.label}</span>
            <span style={{ fontSize: 9.5, color: '#aeb6c6', display: 'block', height: 12 }}>{c.sub || ' '}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${c.cor}1a`, color: c.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{c.icon}</div>
              <span style={{ fontSize: 20, fontWeight: 700, color: c.cor, letterSpacing: '-.5px' }}>{fmtAbrev(c.cmp.atual)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 10.5, color: '#9098a8' }}>{v ? v.anoRef - 1 : ''} <span style={{ color: '#5b6477', fontWeight: 600 }}>{fmtAbrev(c.cmp.ant)}</span></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.cmp.pct >= 0 ? '#1fa463' : '#d64545', flex: 'none' }}>{fmtPct(c.cmp.pct)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Evolução (5 anos + previsão do próximo ano) — largura total */}
      <div style={{ ...card, marginTop: 18, position: 'relative' }}>
          {carregandoMensal ? <LoadingOverlay label="Carregando meses…" /> : null}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>
              {drillAno ? `Evolução mensal · ${drillAno}` : 'Evolução (5 anos)'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#5b6477' }}>
                {METRICAS.map(m => (
                  <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: m.cor }} />{m.label}</span>
                ))}
              </div>
              {drillAno ? <button onClick={() => setDrillAno(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11 }}>‹ Voltar</button> : null}
            </div>
          </div>
          <div style={{ marginTop: 16, height: 300, cursor: !drillAno ? 'pointer' : 'default' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%"
                onClick={(e) => {
                  const a = (e as unknown as { activePayload?: { payload?: { ano?: number } }[] })?.activePayload?.[0]?.payload?.ano
                  if (!drillAno && a) setDrillAno(a)
                }}>
                <XAxis dataKey="rot" interval={0} height={!drillAno ? 46 : 24} tick={<EixoTick />} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                <YAxis width={44} tickFormatter={(v: number) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
                  formatter={(v, name) => ['R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name] as [string, string]}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                {(['lancado', 'arrecadado', 'inadimplencia'] as const).map(dk => (
                  <Bar key={dk} dataKey={dk} name={{ lancado: 'Lançado', arrecadado: 'Arrecadado', inadimplencia: 'Inadimplência' }[dk]} radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {serie.map((s, i) => <Cell key={i} fill={CORES[dk][s.previsto ? 1 : 0]} />)}
                    <LabelList dataKey={dk} position="top" formatter={(val) => (Number(val) ? fmtAbrev(Number(val)) : '')} fontSize={8.5} fill="#8a93a6" />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!drillAno ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 4 }}>Clique num ano para detalhar por mês · Arrecadado somado até {mesRefLabel} (comparação justa); Inadimplência = saldo vencido · barras claras = previsão {v?.evolucao.find(e => e.previsto)?.ano ?? ''}</div> : null}
        </div>

      {/* ===== ONDA 3: IPTU por bairro (logo após a Evolução) ===== */}
      <div ref={obsBairros.ref} style={{ ...card, marginTop: 18, position: 'relative' }}>
        {carregandoBairros ? <LoadingOverlay label="Agregando por bairro…" /> : null}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>
            {nivelBairro === 'rua' ? `Ruas de ${bairroSel}` : 'IPTU por Bairro'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* filtros */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5b6477', cursor: 'pointer' }}>
              <input type="checkbox" checked={espolio} onChange={e => setEspolio(e.target.checked)} /> Espólio
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5b6477', cursor: 'pointer' }}>
              <input type="checkbox" checked={semNumero} onChange={e => setSemNumero(e.target.checked)} /> Sem número
            </label>
            <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3 }}>
              {METRICAS.map(m => (
                <button key={m.id} onClick={() => setMetricaBairro(m.id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 16, padding: '5px 10px', fontSize: 11, fontWeight: 600, background: metricaBairro === m.id ? '#283e93' : 'transparent', color: metricaBairro === m.id ? '#fff' : '#5b6477' }}>{m.label}</button>
              ))}
            </div>
            {bairroSel ? <button onClick={() => setBairroSel(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>‹ Voltar aos bairros</button> : null}
          </div>
        </div>
        {(() => {
          const mx = Math.max(1, ...bairros.map(b => b[metricaBairro]))
          const corM = METRICAS.find(m => m.id === metricaBairro)!.cor
          if (!bairros.length) return <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>Sem dados para os filtros selecionados.</div>
          return (
            <div style={{ marginTop: 14, maxHeight: 430, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
              {bairros.map((b, i) => {
                const w = Math.max(2, 100 * b[metricaBairro] / mx)
                const podeDrill = nivelBairro === 'bairro'
                return (
                  <div key={i} onClick={() => { if (podeDrill) setBairroSel(b.nome) }} style={{ cursor: podeDrill ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
                      <span title={b.nome} style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>· {b.imoveis.toLocaleString('pt-BR')} im.</span></span>
                      <span style={{ color: corM, fontWeight: 700, flex: 'none' }}>{fmtAbrev(b[metricaBairro])}</span>
                    </div>
                    <div style={{ height: 15, borderRadius: 8, background: '#eef1f7', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w.toFixed(1)}%`, borderRadius: 8, background: corM }} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: '#9098a8', marginTop: 3 }}>
                      <span>Lanç: {fmtNum(b.lancado)}</span><span>Arrec: {fmtNum(b.arrecadado)}</span><span>Inad: {fmtNum(b.inadimplencia)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
        {nivelBairro === 'bairro' ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique num bairro para detalhar por rua</div> : null}
      </div>

      {/* ===== ONDA 2: Resumo de imóveis (lazy) ===== */}
      <div ref={obsResumo.ref}>
      {res ? (
        <div style={{ ...card, marginTop: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Resumo de Imóveis {v ? `· ${v.anoRef}` : ''}</span>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Base: imóveis com IPTU (compõem o valor lançado). As demais contagens são a interseção com essa base.</div>
          {(() => {
            const base = Math.max(1, res.resumo.comIptu)
            const pct = (n: number) => `${(100 * n / base).toFixed(1).replace('.', ',')}% da base`
            const inters = [
              { l: 'Com ITBI', val: res.resumo.comItbi, c: '#1fa463' },
              { l: 'Com TCA', val: res.resumo.comTca, c: '#8094d6' },
              { l: 'Com empresa no endereço', val: res.resumo.comEmpresa, c: '#e8962e' },
              { l: 'IPTU sem lançamento de TCA', val: res.resumo.iptuSemTca, c: '#d64545' },
            ]
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(4,1fr)', gap: 12, marginTop: 14 }}>
                <div style={{ background: '#283e93', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 23, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{res.resumo.comIptu.toLocaleString('pt-BR')}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 1.25 }}>Imóveis com IPTU (base)</div>
                </div>
                {inters.map(x => (
                  <div key={x.l} style={{ background: '#f7f9fd', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 21, fontWeight: 700, color: x.c, letterSpacing: '-.5px' }}>{x.val.toLocaleString('pt-BR')}</div>
                    <div style={{ fontSize: 11, color: '#5b6477', marginTop: 3, lineHeight: 1.25 }}>{x.l}</div>
                    <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 2 }}>{pct(x.val)}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      ) : (obsResumo.visible ? <div style={{ ...card, marginTop: 18, fontSize: 12, color: '#9098a8', textAlign: 'center', padding: 20 }}>Carregando resumo…</div> : null)}
      </div>

      {/* ===== ONDA 2: Quadros situação × status de pagamento ===== */}
      {res ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
          {[
            { titulo: 'Imóveis por situação da guia', itens: res.situacao.map(s => ({ rot: s.situacao, qt: s.qt, cor: '#283e93' })) },
            { titulo: 'Imóveis por status de pagamento', itens: res.pagamento.map(p => ({ rot: p.status, qt: p.qt, cor: p.cor })) },
          ].map(bloco => {
            const mx = Math.max(1, ...bloco.itens.map(i => i.qt))
            return (
              <div key={bloco.titulo} style={card}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>{bloco.titulo}</span>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {bloco.itens.map((it, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#3a4256', fontWeight: 600 }}>{it.rot}</span>
                        <span style={{ color: it.cor, fontWeight: 700 }}>{it.qt.toLocaleString('pt-BR')}</span>
                      </div>
                      <div style={{ height: 16, borderRadius: 8, background: '#eef1f7', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(3, 100 * it.qt / mx).toFixed(1)}%`, borderRadius: 8, background: it.cor }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* ===== ONDA 2: Arrecadação diária ===== */}
      <div ref={obsDiario.ref} style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Arrecadação Diária {diario ? `· ${fmtMi(diario.total)}` : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5b6477' }}>
            <span>De</span>
            <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ border: '1.5px solid #e3e9f5', borderRadius: 10, padding: '5px 8px', fontSize: 12, color: '#283e93', fontFamily: 'inherit' }} />
            <span>até</span>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ border: '1.5px solid #e3e9f5', borderRadius: 10, padding: '5px 8px', fontSize: 12, color: '#283e93', fontFamily: 'inherit' }} />
          </div>
        </div>
        {diario && diario.dias.length ? (() => {
          const data = diario.dias.map(x => ({ t: new Date(x.dia + 'T00:00:00').getTime(), valor: x.valor }))
          // ticks: ~8 datas reais distribuídas uniformemente pelo período
          const ticks: number[] = []
          if (data.length) {
            const step = Math.max(1, Math.ceil(data.length / 8))
            for (let i = 0; i < data.length; i += step) ticks.push(data[i].t)
            const last = data[data.length - 1].t
            if (ticks[ticks.length - 1] !== last) ticks.push(last)
          }
          return (
            <div style={{ marginTop: 14, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="diaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" stopOpacity="0.25" /><stop offset="100%" stopColor="#283e93" stopOpacity="0" /></linearGradient></defs>
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks.length ? ticks : undefined}
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 10.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} minTickGap={0} />
                  <YAxis width={44} tickFormatter={(v: number) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} tick={{ fontSize: 10.5, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    labelFormatter={(t) => new Date(t as number).toLocaleDateString('pt-BR')}
                    formatter={(v) => ['R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Arrecadado'] as [string, string]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                  <Area dataKey="valor" stroke="#283e93" strokeWidth={1.8} fill="url(#diaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )
        })() : <div style={{ fontSize: 12, color: '#9098a8', padding: '24px 0', textAlign: 'center' }}>Sem arrecadação no período.</div>}
      </div>

      {/* ===== ONDA 4: 100 maiores imóveis / proprietários ===== */}
      <div ref={obsRank.ref} style={{ ...card, marginTop: 18, position: 'relative' }}>
        {carregandoRank ? <LoadingOverlay label="Calculando ranking…" /> : null}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3 }}>
            {([['imovel', '100 Maiores Imóveis'], ['proprietario', '100 Maiores Proprietários']] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setRankTipo(id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 16, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, background: rankTipo === id ? '#283e93' : 'transparent', color: rankTipo === id ? '#fff' : '#5b6477' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3 }}>
            {METRICAS4.map(m => (
              <button key={m.id} onClick={() => setRankMetrica(m.id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 16, padding: '5px 10px', fontSize: 11, fontWeight: 600, background: rankMetrica === m.id ? '#283e93' : 'transparent', color: rankMetrica === m.id ? '#fff' : '#5b6477' }}>{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', rankTipo === 'imovel' ? 'Imóvel' : 'Proprietário', 'Lançado', 'Arrecadado', 'Em aberto', 'Inadimpl.'].map((h, i) => (
                    <th key={h} style={{ position: 'sticky', top: 0, background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 600, padding: '10px 12px', textAlign: i <= 1 ? 'left' : 'right', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankItens.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9098a8' }}>Sem dados.</td></tr>
                ) : rankItens.map((it, i) => {
                  const bg = i % 2 === 0 ? '#fff' : '#f7f9fd'
                  const cel = (val: number, m: Metrica4) => (
                    <td style={{ background: bg, color: rankMetrica === m ? '#283e93' : '#5b6477', fontWeight: rankMetrica === m ? 700 : 500, fontSize: 11.5, padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtAbrev(val)}</td>
                  )
                  // imóvel: proprietário + inscrição/endereço · proprietário: nome + qtd imóveis
                  const primaria = rankTipo === 'imovel' ? (it.extra || it.nome) : it.nome
                  const secundaria = rankTipo === 'imovel' ? `${it.nome}${it.endereco ? ' · ' + it.endereco : ''}` : it.endereco
                  return (
                    <tr key={it.chave + i}>
                      <td style={{ background: bg, color: '#9098a8', fontSize: 11.5, padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #eef1f7' }}>{i + 1}</td>
                      <td style={{ background: bg, fontSize: 11.5, padding: '8px 12px', borderBottom: '1px solid #eef1f7', maxWidth: 320 }}>
                        <div style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaria}</div>
                        <div style={{ color: '#9098a8', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secundaria}</div>
                      </td>
                      {cel(it.lancado, 'lancado')}{cel(it.arrecadado, 'arrecadado')}{cel(it.emAberto, 'emAberto')}{cel(it.inadimplencia, 'inadimplencia')}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 8 }}>Valores em R$ (mi = milhão · k = milhar). Ordenado por {METRICAS4.find(m => m.id === rankMetrica)?.label}.</div>
      </div>

      {/* ===== ONDA 4: Pesquisa de imóvel devedor ===== */}
      <div style={{ ...card, marginTop: 18, position: 'relative' }}>
        {carregandoDet ? <LoadingOverlay label="Carregando imóvel…" /> : null}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Pesquisa de Imóvel</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* seletor do campo de busca */}
            <select value={buscaTipo} onChange={e => { setBuscaTipo(e.target.value as 'inscricao' | 'codigo' | 'nome'); setMatches([]) }}
              style={{ border: '1.5px solid #e3e9f5', borderRadius: 12, padding: '7px 10px', fontSize: 12, color: '#283e93', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
              <option value="inscricao">Inscrição</option>
              <option value="codigo">Código</option>
              <option value="nome">Nome</option>
            </select>
          <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '7px 12px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={buscaImovel} onChange={e => setBuscaImovel(e.target.value)} placeholder={buscaTipo === 'inscricao' ? 'Inscrição do imóvel…' : buscaTipo === 'codigo' ? 'Código do imóvel…' : 'Nome do proprietário…'} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
              {buscaImovel || imovelDet ? (
                <button onClick={() => { setBuscaImovel(''); setMatches([]); setImovelDet(null) }} title="Limpar pesquisa"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9098a8', display: 'flex', alignItems: 'center', padding: 0, flex: 'none' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              ) : null}
            </div>
            {matches.length ? (
              <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 280, overflowY: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e3e9f5', boxShadow: '0 12px 30px rgba(20,40,90,0.18)', padding: 5 }}>
                {matches.map(m => (
                  <div key={m.cd} onClick={() => abrirImovel(m.cd)} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                    <div style={{ color: '#1f2a44', fontWeight: 600 }}>{m.proprietario || `Imóvel ${m.cd}`}</div>
                    <div style={{ color: '#9098a8', fontSize: 11 }}>Insc. {m.inscricao || m.cd} · {m.endereco}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          </div>
        </div>

        {imovelDet ? (() => {
          const d = imovelDet
          const FLAGS = [
            { on: d.flags.itbi, label: 'ITBI' }, { on: d.flags.isscc, label: 'ISSCC' }, { on: d.flags.tca, label: 'TCA' },
            { on: d.flags.espolio, label: 'Espólio' }, { on: d.flags.semNumero, label: 'Sem número' },
          ]
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#283e93' }}>{d.proprietario || `Imóvel ${d.cd}`}</div>
                  <div style={{ fontSize: 12, color: '#5b6477', marginTop: 3 }}>Código {d.cd} · Inscrição {d.inscricao || '—'} · {d.cpfCnpj}</div>
                  <div style={{ fontSize: 12, color: '#5b6477' }}>{d.endereco}{d.cep ? ` · CEP ${d.cep}` : ''}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' }}>
                  {FLAGS.map(f => (
                    <span key={f.label} style={{ fontSize: 11, fontWeight: 600, borderRadius: 14, padding: '5px 12px', background: f.on ? '#e9f6ee' : '#f4f7fc', color: f.on ? '#1fa463' : '#aeb6c6', border: `1px solid ${f.on ? '#bfe6cd' : '#e3e9f5'}` }}>{f.on ? '✓ ' : '– '}{f.label}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Ano', 'Lançado', 'Arrecadado', 'Em aberto', 'Inadimplência'].map((h, i) => (
                    <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 12, fontWeight: 600, padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {d.anos.map((a, i) => (
                      <tr key={a.ano}>
                        <td style={{ background: i % 2 ? '#f7f9fd' : '#fff', color: '#1f2a44', fontWeight: 600, fontSize: 12, padding: '8px 12px', borderBottom: '1px solid #eef1f7' }}>{a.ano}</td>
                        {[a.lancado, a.arrecadado, a.emAberto, a.inadimplencia].map((val, ci) => (
                          <td key={ci} style={{ background: i % 2 ? '#f7f9fd' : '#fff', color: ci === 3 && val > 0 ? '#d64545' : '#5b6477', fontWeight: ci === 3 && val > 0 ? 700 : 500, fontSize: 12, padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{val ? 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Parcelas do exercício mais recente (item 15: por parcela) */}
              {d.parcelas.length ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', marginBottom: 8 }}>Parcelas · exercício {d.anoParcela}</div>
                  <div style={{ border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Parcela', 'Vencimento', 'Lançado', 'Pago', 'Saldo'].map((h, i) => (
                          <th key={h} style={{ position: 'sticky', top: 0, background: '#3a55ad', color: '#fff', fontSize: 11.5, fontWeight: 600, padding: '8px 12px', textAlign: i <= 1 ? 'left' : 'right', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                        ))}</tr></thead>
                        <tbody>
                          {d.parcelas.map((pc, i) => (
                            <tr key={i}>
                              <td style={{ background: i % 2 ? '#f7f9fd' : '#fff', fontSize: 11.5, padding: '7px 12px', color: '#1f2a44', fontWeight: 600, borderBottom: '1px solid #eef1f7' }}>{pc.parcela === 0 ? 'Cota única' : pc.parcela}</td>
                              <td style={{ background: i % 2 ? '#f7f9fd' : '#fff', fontSize: 11.5, padding: '7px 12px', color: '#5b6477', borderBottom: '1px solid #eef1f7' }}>{pc.vencimento ? pc.vencimento.split('-').reverse().join('/') : '—'}</td>
                              {[pc.lancado, pc.pago, pc.saldo].map((val, ci) => (
                                <td key={ci} style={{ background: i % 2 ? '#f7f9fd' : '#fff', fontSize: 11.5, padding: '7px 12px', textAlign: 'right', color: ci === 2 && val > 0 ? '#d64545' : '#5b6477', fontWeight: ci === 2 && val > 0 ? 700 : 500, borderBottom: '1px solid #eef1f7' }}>{val ? 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })() : <div style={{ fontSize: 12, color: '#9098a8', padding: '18px 0', textAlign: 'center' }}>Digite a inscrição, o código ou o nome do proprietário para ver o detalhamento do imóvel.</div>}
      </div>

    </div>
  )
}
