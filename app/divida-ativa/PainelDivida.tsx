'use client'

import { useState, useEffect } from 'react'
import LoadingOverlay from '../_components/LoadingOverlay'
import { fmtAbrev } from '@/lib/fmt-grafico'
import { baixarRelatorioPdf, baixarRelatorioExcel, type DadosRelatorio } from '../_components/relatorioTributo'

interface Resumo {
  total: number; administrativa: number; judicial: number; ajuizamento: number
  porTributo: { nome: string; valor: number }[]
  porExercicio: { ano: number; valor: number }[]
  iptuDivida?: { imoveisComIptu: number; imoveisEmDivida: number; valorDivida: number }
  debitosPassiveis?: { total: number; quantidade: number; porTributo: { nome: string; valor: number }[] }
  recuperacao?: { lancado: number; pago: number; taxa: number; porExercicio: { ano: number; lancado: number; pago: number; taxa: number }[] }
  situacoes?: { codigo: string; situacao: string; quantidade: number; pct: number }[]
  dataAtualizacao?: string | null
  composicao?: { principal: number; correcao: number; juros: number; multa: number; honorarios: number }
}
interface Devedor { cd: number; nome: string; cpfCnpj: string; saldo: number; crc?: string }

const fmtMoney = (v: number) => Math.abs(v) >= 1e9
  ? (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi'
  : (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi'
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const fmtData = (d: string | null | undefined) => d ? d.split('-').reverse().join('/') : '—'
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const FALLBACK: Resumo = {
  total: 148123000, administrativa: 76900000, judicial: 70900000, ajuizamento: 323000,
  porTributo: [
    { nome: 'IPTU', valor: 67870000 },
    { nome: 'Taxas de Licença p/ Localização', valor: 24020000 },
    { nome: 'I.S.S.Q.N.', valor: 12200000 },
    { nome: 'ITBI', valor: 10270000 },
    { nome: 'ISS Construção Civil', valor: 5060000 },
    { nome: 'Outras Restituições', valor: 4910000 },
    { nome: 'TFE', valor: 2870000 },
    { nome: 'TFHS', valor: 2680000 },
    { nome: 'Multa', valor: 2450000 },
  ],
  porExercicio: [
    { ano: 2016, valor: 4760000 }, { ano: 2017, valor: 5100000 }, { ano: 2018, valor: 5520000 },
    { ano: 2019, valor: 7430000 }, { ano: 2020, valor: 6690000 }, { ano: 2021, valor: 7070000 },
    { ano: 2022, valor: 9220000 }, { ano: 2023, valor: 10340000 }, { ano: 2024, valor: 15890000 },
    { ano: 2025, valor: 26080000 }, { ano: 2026, valor: 3880000 },
  ],
}

const TRIB_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#c0612a']

function pctColor(dir: 'up' | 'down' | 'flat', azul: boolean): string {
  if (dir === 'up') return azul ? '#6ee0a0' : '#1fa463'
  if (dir === 'down') return azul ? '#ff9b8a' : '#d64545'
  return azul ? 'rgba(255,255,255,0.6)' : '#9098a8'
}

// Tendência (regressão linear simples) de uma série anual: inclinação normalizada pela
// média da série, classificada em alta/baixa/estável (mesmo princípio da projeção usada
// nas telas de tributo, só que aqui classifica a direção em vez de projetar o próximo ano).
function tendenciaSerie(pts: { ano: number; v: number }[]): { dir: 'alta' | 'baixa' | 'estavel'; slopeAnual: number } {
  const n = pts.length
  if (n < 2) return { dir: 'estavel', slopeAnual: 0 }
  const sx = pts.reduce((s, p) => s + p.ano, 0), sy = pts.reduce((s, p) => s + p.v, 0)
  const sxx = pts.reduce((s, p) => s + p.ano * p.ano, 0), sxy = pts.reduce((s, p) => s + p.ano * p.v, 0)
  const den = n * sxx - sx * sx
  if (!den) return { dir: 'estavel', slopeAnual: 0 }
  const slope = (n * sxy - sx * sy) / den
  const media = sy / n
  const rel = media ? slope / media : 0
  const dir = rel > 0.03 ? 'alta' : rel < -0.03 ? 'baixa' : 'estavel'
  return { dir, slopeAnual: slope }
}

// Barras pareadas (Lançado × Pago) — Taxa de Recuperação por exercício
function geomBarsPar(d: { ano: number; lancado: number; pago: number }[]) {
  const W = 960, H = 300, top = 26, bottom = 250
  const span = bottom - top - 8
  const max = Math.max(1, ...d.flatMap(x => [x.lancado, x.pago]))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(30, gw * 0.24)
  const bars = d.map((x, i) => {
    const cx = i * gw + gw / 2
    const hL = (x.lancado / max) * span, hP = (x.pago / max) * span
    return {
      cx, ano: x.ano, lancado: x.lancado, pago: x.pago, taxa: x.lancado ? (x.pago / x.lancado) * 100 : 0,
      lanc: { x: cx - bw - 3, y: bottom - hL, h: hL },
      pag: { x: cx + 3, y: bottom - hP, h: hP },
    }
  })
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1e6), y: bottom - (v / max) * span }))
  return { bars, ticks, W, H, bottom, bw }
}

// Barras empilhadas (Saldo em Dívida Ativa + Total Inscrito/Lançado) — evolução por
// exercício, a pedido do usuário: soma das duas séries já existentes (porExercicio e
// recuperacao.porExercicio.lancado) num único gráfico, com o total do gráfico = soma das
// duas. Une os anos das duas séries (uma pode ter um ano que a outra não tem).
function geomBarsStack(saldoPorAno: { ano: number; valor: number }[], lancPorAno: { ano: number; lancado: number }[]) {
  const anos = Array.from(new Set([...saldoPorAno.map(x => x.ano), ...lancPorAno.map(x => x.ano)])).sort((a, b) => a - b)
  const d = anos.map(ano => ({
    ano,
    saldo: saldoPorAno.find(x => x.ano === ano)?.valor ?? 0,
    lancado: lancPorAno.find(x => x.ano === ano)?.lancado ?? 0,
  }))
  const W = 960, H = 300, top = 26, bottom = 250
  const span = bottom - top - 8
  const max = Math.max(1, ...d.map(x => x.saldo + x.lancado))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(40, gw * 0.5)
  const bars = d.map((x, i) => {
    const cx = i * gw + gw / 2
    const hLanc = (x.lancado / max) * span, hSaldo = (x.saldo / max) * span
    return {
      cx, ano: x.ano, saldo: x.saldo, lancado: x.lancado,
      lanc: { x: cx - bw / 2, y: bottom - hLanc, h: hLanc },
      saldoTop: { x: cx - bw / 2, y: bottom - hLanc - hSaldo, h: hSaldo },
    }
  })
  const total = d.reduce((s, x) => s + x.saldo + x.lancado, 0)
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1e6), y: bottom - (v / max) * span }))
  return { bars, ticks, W, H, bottom, bw, total }
}

// Barras verticais aging
function geomBars(d: { ano: number; valor: number }[]) {
  const W = 960, H = 300, top = 26, bottom = 250
  const span = bottom - top - 8
  const max = Math.max(1, ...d.map(x => x.valor))
  const n = Math.max(1, d.length)
  const gw = W / n
  const bw = Math.min(46, gw * 0.5)
  const bars = d.map((x, i) => {
    const cx = i * gw + gw / 2
    const h = (x.valor / max) * span
    return { cx, ano: x.ano, valor: x.valor, x: cx - bw / 2, y: bottom - h, h }
  })
  const ticks = [max, max / 2, 0].map(v => ({ v: Math.round(v / 1e6), y: bottom - (v / max) * span }))
  return { bars, ticks, W, H, bottom, bw }
}

export default function PainelDivida({ ano, mes, onAnos }: { ano?: number; mes?: number; onAnos?: (anos: number[]) => void } = {}) {
  const [d, setD] = useState<Resumo | null>(null)
  const [dKpi, setDKpi] = useState<Resumo | null>(null)
  const [tip, setTip] = useState<{ left: string; top: string; ano: number; valor: number } | null>(null)
  const [tipRec, setTipRec] = useState<{ left: string; top: string; ano: number; lancado: number; pago: number; taxa: number } | null>(null)
  const [tipEvol, setTipEvol] = useState<{ left: string; top: string; ano: number; saldo: number; lancado: number } | null>(null)
  const [devedores, setDevedores] = useState<Devedor[] | null>(null)
  const [buscaDevedor, setBuscaDevedor] = useState('')
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)

  // Drill do gráfico "Situação das Parcelas": clique numa situação → maiores devedores
  // (situações de dívida real) ou débitos por tributo (situação "Normal", reaproveitando
  // debitosPassiveis já carregado — ver nota em lib/divida-engine.ts sobre por que "Normal"
  // não tem um valor por devedor confiável).
  const [situacaoSel, setSituacaoSel] = useState<string | null>(null)
  const [devedoresSituacao, setDevedoresSituacao] = useState<Devedor[] | null>(null)
  const [devedoresSituacaoErro, setDevedoresSituacaoErro] = useState(false)

  // Gráficos/tabelas seguem mostrando o histórico completo acumulado (sem ano/mes) —
  // só os KPIs do topo são filtrados (ver dKpi abaixo).
  useEffect(() => {
    fetch('/api/divida/resumo').then(r => r.ok ? r.json() : null)
      .then(x => {
        if (x && !x.error && typeof x.total === 'number') {
          setD(x)
          if (Array.isArray(x.anos)) onAnos?.(x.anos)
        }
      }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // KPIs do topo: filtrados por Exercício/Mês quando selecionados.
  useEffect(() => {
    const qs = new URLSearchParams()
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/divida/resumo${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && typeof x.total === 'number') setDKpi(x) }).catch(() => {})
  }, [ano, mes])
  useEffect(() => {
    fetch('/api/divida/devedores?limite=200').then(r => r.ok ? r.json() : null)
      .then(x => { if (x && !x.error && Array.isArray(x.devedores)) setDevedores(x.devedores) }).catch(() => {})
  }, [])
  function buscarDevedoresSituacao(codigo: string) {
    setDevedoresSituacao(null)
    setDevedoresSituacaoErro(false)
    fetch(`/api/divida/devedores?limite=15&situacao=${encodeURIComponent(codigo)}`).then(r => r.ok ? r.json() : null)
      .then(x => {
        if (x && !x.error && Array.isArray(x.devedores)) setDevedoresSituacao(x.devedores)
        else setDevedoresSituacaoErro(true)
      }).catch(() => setDevedoresSituacaoErro(true))
  }
  useEffect(() => {
    if (!situacaoSel || situacaoSel === 'Normal') { setDevedoresSituacao(null); setDevedoresSituacaoErro(false); return }
    buscarDevedoresSituacao(situacaoSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacaoSel])

  function selecionarSituacao(codigo: string) {
    setSituacaoSel(prev => prev === codigo ? null : codigo)
  }

  const g = d ?? FALLBACK
  const gk = dKpi ?? g
  const pctJud = g.total ? (g.judicial / g.total) * 100 : 0
  const pctAdm = g.total ? (g.administrativa / g.total) * 100 : 0
  const pctJudK = gk.total ? (gk.judicial / gk.total) * 100 : 0
  const pctAdmK = gk.total ? (gk.administrativa / gk.total) * 100 : 0
  const maxTrib = Math.max(1, ...g.porTributo.map(t => t.valor))
  const gb = geomBars(g.porExercicio)
  const gr = geomBarsPar(g.recuperacao?.porExercicio ?? [])
  const ge = geomBarsStack(g.porExercicio, g.recuperacao?.porExercicio ?? [])

  // Tendências: direção (regressão linear) das novas inscrições e da taxa de recuperação
  // nos últimos exercícios, mais a variação do último exercício vs o anterior.
  const recSerie = g.recuperacao?.porExercicio ?? []
  const recUlt5 = recSerie.slice(-5)
  const tendInscricoes = tendenciaSerie(recUlt5.map(r => ({ ano: r.ano, v: r.lancado })))
  const tendTaxa = tendenciaSerie(recUlt5.map(r => ({ ano: r.ano, v: r.taxa })))
  const atualRec = recSerie[recSerie.length - 1]
  const antRec = recSerie[recSerie.length - 2]
  const varInscricoes = atualRec && antRec && antRec.lancado ? ((atualRec.lancado - antRec.lancado) / antRec.lancado) * 100 : null
  const varTaxaPP = atualRec && antRec ? atualRec.taxa - antRec.taxa : null

  // Donut composição
  const comp = [
    { label: 'Administrativa', v: g.administrativa, cor: '#283e93' },
    { label: 'Judicial (ajuizada)', v: g.judicial, cor: '#e8962e' },
    { label: 'Em ajuizamento', v: g.ajuizamento, cor: '#aab8e3' },
  ].filter(x => x.v > 0)
  const totComp = comp.reduce((a, x) => a + x.v, 0) || 1
  const donutC = 2 * Math.PI * 56
  let _off = 0
  const donut = comp.map(x => { const len = (x.v / totComp) * donutC; const s = { ...x, len, off: -_off, pct: x.v / totComp * 100 }; _off += len; return s })

  const insights = [
    `Dívida ativa de ${fmtReais(g.total)} — ${fmtMoney(g.administrativa)} administrativa (${fmtPct(pctAdm)}) e ${fmtMoney(g.judicial)} já ajuizada (${fmtPct(pctJud)}).`,
    g.porTributo[0] ? `${g.porTributo[0].nome} concentra ${fmtMoney(g.porTributo[0].valor)} (${fmtPct(g.porTributo[0].valor / g.total * 100)}) do estoque inscrito.` : '',
    (() => { const r = [...g.porExercicio].sort((a, b) => b.valor - a.valor)[0]; return r ? `Os débitos de ${r.ano} são os mais pesados do estoque, com ${fmtMoney(r.valor)}.` : '' })(),
  ].filter(Boolean)

  const mesNome = mes ? MESES_LONGO[mes - 1] : null

  const kpis = [
    { label: 'Dívida Ativa Total', value: fmtMoney(gk.total), subLabel: 'estoque inscrito', subValue: '', pct: '', dir: 'flat' as const },
    { label: 'Administrativa', value: fmtMoney(gk.administrativa), subLabel: 'do total', subValue: fmtPct(pctAdmK), pct: fmtPct(pctAdmK), dir: 'flat' as const },
    { label: 'Judicial (ajuizada)', value: fmtMoney(gk.judicial), subLabel: 'do total', subValue: fmtPct(pctJudK), pct: fmtPct(pctJudK), dir: 'down' as const },
    { label: 'Em Ajuizamento', value: fmtMoney(gk.ajuizamento), subLabel: 'do total', subValue: fmtPct(gk.total ? gk.ajuizamento / gk.total * 100 : 0), pct: '', dir: 'flat' as const },
    { label: 'Maior Tributo', value: gk.porTributo[0] ? fmtMoney(gk.porTributo[0].valor) : '—', subLabel: gk.porTributo[0]?.nome ?? '', subValue: '', pct: '', dir: 'flat' as const },
  ]

  // Relatório (PDF/Excel): cards = KPIs da tela; tabela = Estoque por Tributo.
  async function gerarRelatorio(tipo: 'pdf' | 'excel') {
    if (!d || gerandoRelatorio) return
    setGerandoRelatorio(true)
    try {
      const dados: DadosRelatorio = {
        titulo: 'Dívida Ativa',
        subtitulo: `Estoque total inscrito: ${fmtReais(g.total)}`,
        cards: kpis.map(k => ({ rotulo: k.label, valor: k.value })),
        colunas: ['Tributo', 'Dívida Ativa', '% do Estoque'],
        linhas: g.porTributo.map(t => [t.nome, fmtReais(t.valor), fmtPct(g.total ? t.valor / g.total * 100 : 0)]),
        arquivo: 'DividaAtiva',
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
    <svg key="0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>,
    <svg key="1" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>,
    <svg key="2" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v18M5 7l7-4 7 4M4 21h16M6 11l-2 4h4zM18 11l-2 4h4z" /></svg>,
    <svg key="3" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
    <svg key="4" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>,
  ]

  return (
    <div style={{ position: 'relative' }}>
      {!d ? <LoadingOverlay label="Carregando…" /> : null}

      {/* Barra de relatórios (Excel/PDF a partir dos KPIs + Estoque por Tributo) */}
      {d ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, margin: '0 4px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['pdf', 'Baixar PDF'], ['excel', 'Baixar Excel']] as const).map(([tp, lbl]) => (
              <button key={tp} onClick={() => gerarRelatorio(tp)} disabled={gerandoRelatorio} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e3e9f5', background: '#fff', color: '#283e93', fontWeight: 600, cursor: gerandoRelatorio ? 'default' : 'pointer', opacity: gerandoRelatorio ? 0.6 : 1, borderRadius: 12, padding: '7px 14px', fontSize: 12, fontFamily: 'inherit' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>{gerandoRelatorio ? 'Gerando…' : lbl}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#5b6477', background: '#fff', borderRadius: 20, padding: '6px 14px', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
            Dados atualizados em <b style={{ color: '#283e93' }}>{fmtData(g.dataAtualizacao)}</b>
          </span>
        </div>
      ) : null}

      {/* KPIs — únicos que respeitam o filtro de Exercício/Mês do topo; os demais gráficos
          abaixo mostram o histórico completo (ver nota em cada um). */}
      <div style={{ margin: '20px 4px 0', fontSize: 12.5, fontWeight: 600, color: '#5b6477' }}>
        KPIs · Exercício {ano ?? '—'}{mesNome ? ` · ${mesNome}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginTop: 8 }}>
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
                <span style={{ fontSize: 11, color: azul ? 'rgba(255,255,255,0.6)' : '#9098a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.subLabel} <span style={{ color: azul ? 'rgba(255,255,255,0.95)' : '#3a4256', fontWeight: 600 }}>{k.subValue}</span></span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(k.dir, azul), flex: 'none' }}>{k.pct}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Composição da Dívida Ativa — a pedido do usuário: o valor de dívida ativa (KPIs e
          gráficos acima) passou a considerar não só o principal, mas atualização monetária,
          juros de mora, multa (de mora/punitiva) e encargos legais (honorários, quando
          ajuizada), via tb_dsod_parcelas_atualizadas — antes só refletia o principal em
          aberto (vl_saldo). */}
      {g.composicao ? (() => {
        const c = g.composicao!
        const totC = c.principal + c.correcao + c.juros + c.multa + c.honorarios || 1
        const partes = [
          { l: 'Principal', v: c.principal, cor: '#283e93' },
          { l: 'Atualização monetária', v: c.correcao, cor: '#7d8fce' },
          { l: 'Juros de mora', v: c.juros, cor: '#e8962e' },
          { l: 'Multa', v: c.multa, cor: '#d64545' },
          { l: 'Encargos legais (honorários)', v: c.honorarios, cor: '#5b6477' },
        ].filter(p => p.v > 0)
        return (
          <div style={{ ...card, marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Composição da Dívida Ativa</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#283e93' }}>{fmtMoney(totC)}</span>
            </div>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Principal + atualização monetária + juros de mora + multa + encargos legais previstos na legislação (Lei 6.830/80) · histórico completo (todos os exercícios)</div>
            <div style={{ height: 16, borderRadius: 8, background: '#eef1f7', overflow: 'hidden', display: 'flex', marginTop: 16 }}>
              {partes.map(p => (<div key={p.l} title={p.l} style={{ width: `${(100 * p.v / totC).toFixed(2)}%`, background: p.cor }} />))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 14 }}>
              {partes.map(p => (
                <div key={p.l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: p.cor, flex: 'none' }} />
                  <span style={{ fontSize: 12, color: '#3a4256' }}>{p.l}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2a44' }}>{fmtMoney(p.v)}</span>
                  <span style={{ fontSize: 11, color: '#9098a8' }}>({fmtPct(100 * p.v / totC)})</span>
                </div>
              ))}
            </div>
          </div>
        )
      })() : null}

      {/* ROW 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1.1fr', gap: 18, marginTop: 20 }}>
        {/* Ranked bars por tributo */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Dívida Ativa por Tributo</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Estoque total inscrito · todos os exercícios</div>
            </div>
            <span style={reportBadge}>Estoque</span>
          </div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {g.porTributo.map((t, i) => {
              const w = (t.valor / maxTrib) * 100
              return (
                <div key={t.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256', lineHeight: 1.2, paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(t.valor)}</span>
                  </div>
                  <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: TRIB_CORES[i % TRIB_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Insights */}
        <div style={{ position: 'relative', borderRadius: 22, padding: '16px 20px', background: 'linear-gradient(150deg,#3a55ad 0%,#283e93 100%)', boxShadow: '0 12px 26px rgba(40,62,147,0.32)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', border: '5px solid #283e93', display: 'block' }}></span>
            </div>
            <span style={{ background: '#fff', color: '#283e93', fontSize: 11, fontWeight: 600, borderRadius: 16, padding: '6px 14px' }}>Dívida Ativa</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: '#fff' }}>Insights da Dívida Ativa</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {insights.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', background: '#fff', flex: 'none' }} />
                <span style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.9)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut composição */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44', lineHeight: 1.3 }}>Administrativa × Judicial</span>
              <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 2 }}>Todos os exercícios</div>
            </div>
            <span style={dots}>···</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <svg viewBox="0 0 200 200" width="250" height="250" style={{ maxWidth: '100%' }}>
              <g transform="rotate(-90 100 100)">
                {donut.map((s, i) => (<circle key={i} cx="100" cy="100" r="56" fill="none" stroke={s.cor} strokeWidth="30" strokeDasharray={`${s.len.toFixed(1)} ${(donutC - s.len).toFixed(1)}`} strokeDashoffset={s.off.toFixed(1)} />))}
              </g>
              <text x="100" y="96" fontSize="16" fontWeight="700" fill="#283e93" textAnchor="middle" style={axisFont}>{fmtAbrev(g.total)}</text>
              <text x="100" y="113" fontSize="9" fill="#9098a8" textAnchor="middle" style={axisFont}>total</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18 }}>
            {donut.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flex: 'none' }}></span>
                <span style={{ flex: 1, fontSize: 12, color: '#3a4256' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2a44' }}>{fmtPct(s.pct)}</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Taxa de Recuperação */}
      {g.recuperacao ? (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Taxa de Recuperação da Dívida Ativa</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Do que foi inscrito em dívida ativa (lançado), quanto já foi pago, por exercício de origem · todos os exercícios</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Lançado</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#1fa463' }}></span>Pago (recuperado)</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 16 }}>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Taxa de Recuperação</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: g.recuperacao.taxa >= 40 ? '#1fa463' : g.recuperacao.taxa >= 20 ? '#e8962e' : '#d64545', marginTop: 6 }}>{fmtPct(g.recuperacao.taxa)}</div>
            </div>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Inscrito (Lançado)</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#283e93', marginTop: 6 }}>{fmtAbrev(g.recuperacao.lancado)}</div>
            </div>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Recuperado (Pago)</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1fa463', marginTop: 6 }}>{fmtAbrev(g.recuperacao.pago)}</div>
            </div>
          </div>

          <div onMouseLeave={() => setTipRec(null)} style={{ position: 'relative', marginTop: 18, cursor: 'pointer' }}>
            <svg viewBox={`0 0 ${gr.W} ${gr.H}`} width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="recLanc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#aab8e3" /></linearGradient>
                <linearGradient id="recPago" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1fa463" /><stop offset="100%" stopColor="#9adfbb" /></linearGradient>
              </defs>
              {gr.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(gr.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 2).toFixed(1)} fontSize="8" fill="#aeb6c6" style={axisFont}>{t.v} mi</text></g>))}
              <line x1="0" y1={gr.bottom} x2={String(gr.W)} y2={gr.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {gr.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.lanc.x.toFixed(1)} y={b.lanc.y.toFixed(1)} width={gr.bw.toFixed(1)} height={b.lanc.h.toFixed(1)} rx="4" fill="url(#recLanc)" />
                  <rect x={b.pag.x.toFixed(1)} y={b.pag.y.toFixed(1)} width={gr.bw.toFixed(1)} height={b.pag.h.toFixed(1)} rx="4" fill="url(#recPago)" />
                  <text x={b.cx.toFixed(1)} y={String(gr.H - 6)} fontSize="9" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
                </g>
              ))}
              {gr.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTipRec({ left: `${(b.cx / gr.W * 100).toFixed(1)}%`, top: `${(Math.min(b.lanc.y, b.pag.y) / gr.H * 100).toFixed(1)}%`, ano: b.ano, lancado: b.lancado, pago: b.pago, taxa: b.taxa })} x={(b.cx - gr.bw - 6).toFixed(1)} y="0" width={(gr.bw * 2 + 12).toFixed(1)} height={String(gr.H - 20)} fill="transparent" pointerEvents="all" />))}
            </svg>
            {tipRec ? (
              <div style={{ position: 'absolute', left: tipRec.left, top: tipRec.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '9px 12px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{tipRec.ano}</div>
                <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>Lançado: {fmtAbrev(tipRec.lancado)}</div>
                <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 2 }}>Pago: {fmtAbrev(tipRec.pago)} ({fmtPct(tipRec.taxa)})</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Evolução da Dívida Ativa (Total + Lançado) — pedido do usuário: combina o saldo
          em dívida ativa por exercício (mesma série de "Idade dos Débitos") com o total
          historicamente inscrito (mesma série de "Taxa de Recuperação"), empilhados, com o
          total do gráfico = soma das duas. São duas métricas distintas (saldo em aberto
          hoje × total já lançado ao longo do tempo, que já inclui o que foi pago) — o rótulo
          e o tooltip deixam essa composição explícita. */}
      {ge.bars.length ? (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Evolução da Dívida Ativa (Total + Lançado)</span>
              <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Saldo em dívida ativa hoje + total historicamente inscrito, por exercício de origem (todos os exercícios) — total do gráfico: {fmtMoney(ge.total)}</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#5b6477' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#283e93' }}></span>Total Inscrito (Lançado)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#d64545' }}></span>Dívida Ativa (saldo hoje)</span>
            </div>
          </div>

          <div onMouseLeave={() => setTipEvol(null)} style={{ position: 'relative', marginTop: 18, cursor: 'pointer' }}>
            <svg viewBox={`0 0 ${ge.W} ${ge.H}`} width="100%" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="evolLanc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#7d8fce" /></linearGradient>
                <linearGradient id="evolSaldo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d64545" /><stop offset="100%" stopColor="#eeaeae" /></linearGradient>
              </defs>
              {ge.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(ge.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 2).toFixed(1)} fontSize="8" fill="#aeb6c6" style={axisFont}>{t.v} mi</text></g>))}
              <line x1="0" y1={ge.bottom} x2={String(ge.W)} y2={ge.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
              {ge.bars.map((b, i) => (
                <g key={i}>
                  <rect x={b.lanc.x.toFixed(1)} y={b.lanc.y.toFixed(1)} width={ge.bw.toFixed(1)} height={b.lanc.h.toFixed(1)} fill="url(#evolLanc)" />
                  <rect x={b.saldoTop.x.toFixed(1)} y={b.saldoTop.y.toFixed(1)} width={ge.bw.toFixed(1)} height={b.saldoTop.h.toFixed(1)} rx="4" fill="url(#evolSaldo)" />
                  <text x={b.cx.toFixed(1)} y={String(ge.H - 6)} fontSize="9" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
                </g>
              ))}
              {ge.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTipEvol({ left: `${(b.cx / ge.W * 100).toFixed(1)}%`, top: `${(b.saldoTop.y / ge.H * 100).toFixed(1)}%`, ano: b.ano, saldo: b.saldo, lancado: b.lancado })} x={(b.cx - ge.bw).toFixed(1)} y="0" width={(ge.bw * 2).toFixed(1)} height={String(ge.H - 20)} fill="transparent" pointerEvents="all" />))}
            </svg>
            {tipEvol ? (
              <div style={{ position: 'absolute', left: tipEvol.left, top: tipEvol.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '9px 12px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{tipEvol.ano}</div>
                <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>Lançado: {fmtAbrev(tipEvol.lancado)}</div>
                <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 2 }}>Saldo hoje: {fmtAbrev(tipEvol.saldo)}</div>
                <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 2 }}>Total: {fmtAbrev(tipEvol.lancado + tipEvol.saldo)}</div>
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 10 }}>O total inscrito (lançado) já inclui o que foi pago desde então — não é uma métrica independente do saldo, e sim o histórico bruto de inscrições; some as duas por exercício de origem, a pedido.</div>
        </div>
      ) : null}

      {/* Tendências */}
      {recSerie.length >= 2 ? (
        <div style={{ ...card, marginTop: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Tendências da Dívida Ativa</span>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Direção das novas inscrições e da taxa de recuperação nos últimos exercícios</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginTop: 16 }}>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Novas Inscrições ({atualRec?.ano})</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: tendInscricoes.dir === 'alta' ? '#d64545' : tendInscricoes.dir === 'baixa' ? '#1fa463' : '#9098a8' }}>
                  {tendInscricoes.dir === 'alta' ? '↑ Em alta' : tendInscricoes.dir === 'baixa' ? '↓ Em queda' : '→ Estável'}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#283e93', marginTop: 6 }}>{atualRec ? fmtAbrev(atualRec.lancado) : '—'}</div>
              {varInscricoes != null ? (
                <div style={{ fontSize: 11, fontWeight: 600, color: varInscricoes > 0 ? '#d64545' : '#1fa463', marginTop: 4 }}>
                  {varInscricoes > 0 ? '+' : ''}{varInscricoes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs {antRec?.ano}
                </div>
              ) : null}
            </div>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Taxa de Recuperação ({atualRec?.ano})</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: tendTaxa.dir === 'alta' ? '#1fa463' : tendTaxa.dir === 'baixa' ? '#d64545' : '#9098a8' }}>
                  {tendTaxa.dir === 'alta' ? '↑ Melhorando' : tendTaxa.dir === 'baixa' ? '↓ Piorando' : '→ Estável'}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1fa463', marginTop: 6 }}>{atualRec ? fmtPct(atualRec.taxa) : '—'}</div>
              {varTaxaPP != null ? (
                <div style={{ fontSize: 11, fontWeight: 600, color: varTaxaPP >= 0 ? '#1fa463' : '#d64545', marginTop: 4 }}>
                  {varTaxaPP > 0 ? '+' : ''}{varTaxaPP.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p. vs {antRec?.ano}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 12 }}>
            Direção calculada por regressão linear sobre os últimos {recUlt5.length} exercícios; a variação compara o exercício mais recente ({atualRec?.ano}) com o anterior ({antRec?.ano}).
          </div>
        </div>
      ) : null}

      {/* ROW 2 — aging */}
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Idade dos Débitos</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>saldo em dívida ativa por exercício de origem · todos os exercícios</div>
          </div>
          <span style={reportBadge}>Aging</span>
        </div>
        <div onMouseLeave={() => setTip(null)} style={{ position: 'relative', marginTop: 14, cursor: 'pointer' }}>
          <svg viewBox={`0 0 ${gb.W} ${gb.H}`} width="100%" style={{ display: 'block' }}>
            <defs><linearGradient id="divBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" /><stop offset="100%" stopColor="#7d8fce" /></linearGradient></defs>
            {gb.ticks.map((t, i) => (<g key={i}><line x1="0" y1={t.y.toFixed(1)} x2={String(gb.W)} y2={t.y.toFixed(1)} stroke="#f0f2f8" strokeWidth="1" /><text x="2" y={(t.y - 2).toFixed(1)} fontSize="8" fill="#aeb6c6" style={axisFont}>{t.v} mi</text></g>))}
            <line x1="0" y1={gb.bottom} x2={String(gb.W)} y2={gb.bottom} stroke="#e3e8f1" strokeWidth="1.5" />
            {gb.bars.map((b, i) => (
              <g key={i}>
                <rect x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={gb.bw.toFixed(1)} height={b.h.toFixed(1)} rx="5" fill="url(#divBar)" />
                <text x={b.cx.toFixed(1)} y={String(gb.H - 6)} fontSize="9" fill="#3a4256" textAnchor="middle" style={axisFont}>{b.ano}</text>
              </g>
            ))}
            {gb.bars.map((b, i) => (<rect key={i} onMouseEnter={() => setTip({ left: `${(b.cx / gb.W * 100).toFixed(1)}%`, top: `${(b.y / gb.H * 100).toFixed(1)}%`, ano: b.ano, valor: b.valor })} x={(b.cx - gb.bw).toFixed(1)} y="0" width={(gb.bw * 2).toFixed(1)} height={String(gb.H - 20)} fill="transparent" pointerEvents="all" />))}
          </svg>
          {tip ? (
            <div style={{ position: 'absolute', left: tip.left, top: tip.top, transform: 'translate(-50%,-115%)', background: '#23304b', borderRadius: 10, padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{tip.ano}</div>
              <div style={{ fontSize: 11, color: '#cfd7e6', marginTop: 3 }}>Dívida: {fmtAbrev(tip.valor)}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* IPTU × Dívida Ativa */}
      {g.iptuDivida ? (() => {
        const iv = g.iptuDivida!
        const pct = iv.imoveisComIptu ? (iv.imoveisEmDivida / iv.imoveisComIptu) * 100 : 0
        return (
          <div style={{ ...card, marginTop: 18 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>IPTU e Dívida Ativa</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Dos imóveis com IPTU lançado, quantos têm guia inscrita em dívida ativa · todos os exercícios</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 16 }}>
              <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Imóveis com IPTU lançado</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2a44', marginTop: 6 }}>{iv.imoveisComIptu.toLocaleString('pt-BR')}</div>
              </div>
              <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Imóveis inscritos em Dívida Ativa</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#c0612a', marginTop: 6 }}>{iv.imoveisEmDivida.toLocaleString('pt-BR')}</div>
              </div>
              <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>% dos imóveis com IPTU</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#283e93', marginTop: 6 }}>{fmtPct(pct)}</div>
              </div>
              <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Valor em Dívida Ativa (IPTU)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2a44', marginTop: 6 }}>{fmtAbrev(iv.valorDivida)}</div>
              </div>
            </div>
          </div>
        )
      })() : null}

      {/* Débitos passíveis de serem inscritos em Dívida Ativa */}
      {g.debitosPassiveis ? (() => {
        const dp = g.debitosPassiveis!
        const maxTrib = Math.max(1, ...dp.porTributo.map(t => t.valor))
        return (
          <div style={{ ...card, marginTop: 18 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Débitos Passíveis de Inscrição em Dívida Ativa</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Parcelas já vencidas, ainda em situação Normal (não inscritas) — candidatas a virar dívida ativa · todos os exercícios</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginTop: 16 }}>
              <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Valor total passível de inscrição</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#c0612a', marginTop: 6 }}>{fmtReais(dp.total)}</div>
              </div>
              <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#9098a8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Débitos vencidos ainda não inscritos</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 6 }}>{dp.quantidade.toLocaleString('pt-BR')}</div>
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dp.porTributo.map((t, i) => {
                const w = (t.valor / maxTrib) * 100
                return (
                  <div key={t.nome}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, color: '#3a4256', lineHeight: 1.2, paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(t.valor)}</span>
                    </div>
                    <div style={{ height: 12, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: TRIB_CORES[i % TRIB_CORES.length], borderRadius: 5 }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 10 }}>Considera parcelas com vencimento a partir de 2019, saldo líquido em aberto por tributo/devedor/vencimento (mesma convenção de inadimplência usada nas telas de tributo).</div>
          </div>
        )
      })() : null}

      {/* Situação das Parcelas — clique numa situação faz drill: nas 3 situações de dívida
          real, mostra os maiores devedores; em "Normal" (sem valor por devedor confiável,
          ver nota em lib/divida-engine.ts), mostra os débitos por tributo já carregados. */}
      {g.situacoes ? (() => {
        const SIT_CORES: Record<string, string> = {
          'Normal': '#9cabd9',
          'Dívida Ativa (administrativa)': '#e8962e',
          'Ajuizada': '#d64545',
          'Em Ajuizamento': '#c5d0ee',
        }
        const maxSit = Math.max(1, ...g.situacoes.map(s => s.quantidade))
        const dp = g.debitosPassiveis
        const maxDpTrib = dp ? Math.max(1, ...dp.porTributo.map(t => t.valor)) : 1
        const maxDevSit = devedoresSituacao ? Math.max(1, ...devedoresSituacao.map(x => x.saldo)) : 1
        const situacaoAtual = g.situacoes.find(s => s.codigo === situacaoSel)
        return (
          <div style={{ ...card, marginTop: 18 }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Situação das Parcelas</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Quantidade de parcelas por situação cadastral, no universo completo (todos os tributos e exercícios). Clique numa situação para ver o detalhe.</div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
              {g.situacoes.map(s => {
                const w = (s.quantidade / maxSit) * 100
                const ativo = situacaoSel === s.codigo
                return (
                  <div key={s.situacao} onClick={() => selecionarSituacao(s.codigo)}
                    style={{ cursor: 'pointer', borderRadius: 8, padding: '4px 6px', margin: '-4px -6px', background: ativo ? '#eef1fb' : 'transparent', border: ativo ? '1px solid #cdd5ef' : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: ativo ? '#283e93' : '#3a4256', fontWeight: ativo ? 700 : 400, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="3" style={{ flex: 'none', transform: ativo ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
                        {s.situacao}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2a44' }}>{s.quantidade.toLocaleString('pt-BR')} <span style={{ color: '#9098a8', fontWeight: 500 }}>({fmtPct(s.pct)})</span></span>
                    </div>
                    <div style={{ height: 14, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: SIT_CORES[s.situacao] ?? '#283e93', borderRadius: 5 }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 10 }}>"Normal" inclui parcelas já quitadas normalmente — o valor em aberto vencido dessa situação está no card "Débitos Passíveis de Inscrição"; o valor das demais situações está nos cards de dívida ativa acima.</div>

            {situacaoSel ? (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eef1f7' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', marginBottom: 10 }}>
                  {situacaoSel === 'Normal' ? 'Débitos vencidos por tributo · Normal' : `Maiores devedores · ${situacaoAtual?.situacao ?? situacaoSel}`}
                </div>
                {situacaoSel === 'Normal' ? (
                  !dp ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '16px 0' }}>Detalhe indisponível.</div>
                    : !dp.porTributo.length ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '16px 0' }}>Sem débitos vencidos nesta situação.</div>
                    : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                        {dp.porTributo.map(t => (
                          <div key={t.nome} style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 10, padding: '9px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 11.5, color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c0612a', flex: 'none' }}>{fmtAbrev(t.valor)}</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: '#e9edf8', overflow: 'hidden', marginTop: 5 }}>
                              <div style={{ height: '100%', width: `${Math.max(3, 100 * t.valor / maxDpTrib).toFixed(1)}%`, borderRadius: 4, background: '#c0612a' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                ) : devedoresSituacaoErro ? (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 11.5, color: '#d64545' }}>Não foi possível carregar os devedores.</div>
                    <button onClick={() => situacaoSel && buscarDevedoresSituacao(situacaoSel)} style={{ marginTop: 6, border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontFamily: 'inherit' }}>Tentar novamente</button>
                  </div>
                ) : !devedoresSituacao ? (
                  <div style={{ height: 60, borderRadius: 12, background: '#eef1f7' }} />
                ) : !devedoresSituacao.length ? (
                  <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '16px 0' }}>Nenhum devedor identificado.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                    {devedoresSituacao.map((dv, i) => (
                      <div key={dv.cd} style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11.5, color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {dv.nome || '—'}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c0612a', flex: 'none' }}>{fmtAbrev(dv.saldo)}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9098a8', marginTop: 1 }}>{dv.cpfCnpj || '—'}</div>
                        <div style={{ height: 8, borderRadius: 4, background: '#e9edf8', overflow: 'hidden', marginTop: 5 }}>
                          <div style={{ height: '100%', width: `${Math.max(3, 100 * dv.saldo / maxDevSit).toFixed(1)}%`, borderRadius: 4, background: '#c0612a' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )
      })() : null}

      {/* Tabela por tributo */}
      <div style={{ ...card, marginTop: 18 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Estoque por Tributo</span>
        <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Estoque total inscrito por tributo · todos os exercícios</div>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tributo', 'Dívida Ativa', '% do Estoque'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.porTributo.map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                return (
                  <tr key={row.nome}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.nome}</td>
                    <td style={{ background: cellBg, color: '#c0612a', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.valor)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(g.total ? row.valor / g.total * 100 : 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 200 maiores devedores */}
      <div style={{ ...card, marginTop: 18, position: 'relative' }}>
        {!devedores ? <LoadingOverlay label="Carregando devedores…" /> : null}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>200 Maiores Devedores</span>
            <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Saldo em dívida ativa (administrativa + judicial + em ajuizamento) por contribuinte · todos os exercícios</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '7px 12px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={buscaDevedor} onChange={e => setBuscaDevedor(e.target.value)} placeholder="Buscar nome, CPF/CNPJ ou CRC…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: '#3a4256', width: 220, fontFamily: 'inherit' }} />
          </div>
        </div>
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', 'Contribuinte', 'CPF/CNPJ', 'CRC', 'Dívida Ativa'].map((h, i) => (
                    <th key={h} style={{ position: 'sticky', top: 0, background: '#283e93', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '10px 14px', textAlign: i === 0 ? 'center' : i === 4 ? 'right' : 'left', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const q = buscaDevedor.trim().toLowerCase()
                  const lista = (devedores ?? []).filter(x => !q || x.nome.toLowerCase().includes(q) || x.cpfCnpj.toLowerCase().includes(q) || (x.crc ?? '').toLowerCase().includes(q))
                  if (!lista.length) return (
                    <tr><td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#9098a8' }}>{devedores ? 'Nenhum devedor encontrado.' : ''}</td></tr>
                  )
                  return lista.map((dv, i) => {
                    const cellBg = i % 2 === 0 ? '#ffffff' : '#f7f9fd'
                    return (
                      <tr key={dv.cd}>
                        <td style={{ background: '#e9eef8', color: '#5b6477', fontSize: 11.5, fontWeight: 600, padding: '8px 14px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{i + 1}</td>
                        <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{dv.nome || `Contribuinte ${dv.cd}`}</td>
                        <td style={{ background: cellBg, color: '#5b6477', fontSize: 11.5, padding: '8px 14px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7', whiteSpace: 'nowrap' }}>{dv.cpfCnpj || '—'}</td>
                        <td style={{ background: cellBg, color: '#5b6477', fontSize: 11.5, padding: '8px 14px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7', whiteSpace: 'nowrap' }}>{dv.crc || '—'}</td>
                        <td style={{ background: cellBg, color: '#c0612a', fontSize: 12, fontWeight: 700, padding: '8px 14px', textAlign: 'right', borderBottom: '1px solid #eef1f7' }}>{fmtReais(dv.saldo)}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
