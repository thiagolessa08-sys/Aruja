'use client'

import { useState, useEffect } from 'react'
import LoadingOverlay from '../_components/LoadingOverlay'

interface Cmp { atual: number; ant: number; pct: number }
interface Visao {
  dataAtualizacao: string | null
  anos: number[]
  anoRef: number
  cards: { lancado: number; arrecadado: number; inadimplencia: number; emAberto: number; isento: number; suspenso: number }
  comparativo: { anoRef: number; anoAnt: number; lancado: Cmp; arrecadado: Cmp; inadimplencia: Cmp }
  evolucao: { ano: number; lancado: number; arrecadado: number; inadimplencia: number }[]
  mensal: { mes: number; lancado: number; arrecadado: number; inadimplencia: number }[]
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

interface Resumo {
  resumo: { comIptu: number; comItbi: number; comTca: number; comEmpresa: number; iptuSemTca: number; tcaSemIptu: number }
  situacao: { situacao: string; qt: number }[]
  pagamento: { status: string; qt: number; cor: string }[]
}
interface Diario { de: string; ate: string; dias: { dia: string; valor: number }[]; total: number }

export default function PainelIptu({ ano }: { ano: number | '' }) {
  const [v, setV] = useState<Visao | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [metrica, setMetrica] = useState<Metrica>('lancado')
  const [drillAno, setDrillAno] = useState<number | null>(null) // ano em drill mensal na evolução
  const [res, setRes] = useState<Resumo | null>(null)
  const [diario, setDiario] = useState<Diario | null>(null)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const qs = ano ? `?ano=${ano}` : ''
  useEffect(() => {
    let vivo = true
    setCarregando(true); setDrillAno(null)
    fetch(`/api/imobiliario/iptu-visao${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo && d && !d.error) setV(d) })
      .finally(() => { if (vivo) setCarregando(false) })
    fetch(`/api/imobiliario/iptu-resumo${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo && d && !d.error) setRes(d) })
    return () => { vivo = false }
  }, [qs])

  // Ao trocar o ano, define o intervalo padrão da arrecadação diária (jan→dez do ano)
  useEffect(() => { if (ano) { setDe(`${ano}-01-01`); setAte(`${ano}-12-31`) } }, [ano])

  useEffect(() => {
    if (!de || !ate) return
    let vivo = true
    fetch(`/api/imobiliario/iptu-diario?ano=${ano}&de=${de}&ate=${ate}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo && d && !d.error) setDiario(d) })
    return () => { vivo = false }
  }, [ano, de, ate])

  const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }

  const cardsDef = v ? [
    { label: 'Total Lançado', val: v.cards.lancado, cor: '#283e93' },
    { label: 'Total Arrecadado', val: v.cards.arrecadado, cor: '#1fa463' },
    { label: 'Total Inadimplência', val: v.cards.inadimplencia, cor: '#d64545' },
    { label: 'Total em Aberto', val: v.cards.emAberto, cor: '#e8962e' },
    { label: 'Total Isento', val: v.cards.isento, cor: '#8094d6' },
    { label: 'Total Suspenso', val: v.cards.suspenso, cor: '#5b6477' },
  ] : []

  const cmpSel = v ? v.comparativo[metrica] : null
  const corSel = METRICAS.find(m => m.id === metrica)!.cor

  // Evolução (5 anos) ou mensal (drill)
  const serie = v ? (drillAno
    ? v.mensal.map(m => ({ rot: MESES[m.mes - 1], lancado: m.lancado, arrecadado: m.arrecadado, inadimplencia: m.inadimplencia }))
    : v.evolucao.map(e => ({ rot: String(e.ano), ano: e.ano, lancado: e.lancado, arrecadado: e.arrecadado, inadimplencia: e.inadimplencia }))
  ) : []
  const maxSerie = Math.max(1, ...serie.map(s => Math.max(s.lancado, s.arrecadado, s.inadimplencia)))

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

      {/* 6 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginTop: 14 }}>
        {cardsDef.map(c => (
          <div key={c.label} style={card}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5b6477', display: 'block' }}>{c.label}</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.cor, marginTop: 8, letterSpacing: '-.5px' }}>{fmtMi(c.val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 18, marginTop: 18 }}>
        {/* Comparativo ano x ano anterior */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Comparativo Anual</span>
            <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3 }}>
              {METRICAS.map(m => (
                <button key={m.id} onClick={() => setMetrica(m.id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 16, padding: '5px 10px', fontSize: 11, fontWeight: 600, background: metrica === m.id ? '#283e93' : 'transparent', color: metrica === m.id ? '#fff' : '#5b6477' }}>{m.label}</button>
              ))}
            </div>
          </div>
          {cmpSel && v ? (() => {
            const mx = Math.max(1, cmpSel.atual, cmpSel.ant)
            const bar = (val: number, lbl: string, forte: boolean) => (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: '#5b6477', fontWeight: 600 }}>{lbl}</span>
                  <span style={{ color: forte ? corSel : '#9098a8', fontWeight: 700 }}>{fmtMi(val)}</span>
                </div>
                <div style={{ height: 20, borderRadius: 10, background: '#eef1f7', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(4, 100 * val / mx).toFixed(1)}%`, borderRadius: 10, background: forte ? corSel : '#c3ccdd' }} />
                </div>
              </div>
            )
            return (
              <>
                {bar(cmpSel.atual, String(v.comparativo.anoRef), true)}
                {bar(cmpSel.ant, String(v.comparativo.anoAnt), false)}
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#5b6477' }}>Variação {v.comparativo.anoAnt}→{v.comparativo.anoRef}:</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: cmpSel.pct >= 0 ? '#1fa463' : '#d64545' }}>{fmtPct(cmpSel.pct)}</span>
                </div>
              </>
            )
          })() : <div style={{ height: 120 }} />}
        </div>

        {/* Evolução 5 anos (com drill mensal) */}
        <div style={card}>
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
          <div style={{ marginTop: 16 }}>
            <svg viewBox="0 0 640 240" width="100%" style={{ display: 'block' }}>
              <line x1="8" y1="210" x2="632" y2="210" stroke="#e3e8f1" strokeWidth="1.5" />
              {serie.map((s, i) => {
                const gw = 624 / serie.length
                const cx = 8 + i * gw + gw / 2
                const grupos = [
                  { v: s.lancado, cor: '#283e93' },
                  { v: s.arrecadado, cor: '#1fa463' },
                  { v: s.inadimplencia, cor: '#d64545' },
                ]
                const bw = Math.min(16, gw / 4)
                const clickable = !drillAno && 'ano' in s
                return (
                  <g key={i} style={{ cursor: clickable ? 'pointer' : 'default' }} onClick={() => { if (clickable) setDrillAno((s as { ano: number }).ano) }}>
                    {grupos.map((g, gi) => {
                      const h = (g.v / maxSerie) * 180
                      const x = cx - bw * 1.5 - 3 + gi * (bw + 2)
                      return <rect key={gi} x={x.toFixed(1)} y={(210 - h).toFixed(1)} width={bw} height={Math.max(0, h).toFixed(1)} rx="3" fill={g.cor}><title>{`${s.rot} · ${['Lançado', 'Arrecadado', 'Inadimplência'][gi]}: ${fmtMi(g.v)}`}</title></rect>
                    })}
                    <text x={cx.toFixed(1)} y="228" fontSize="12" fill="#5b6477" textAnchor="middle" fontWeight={clickable ? 600 : 400}>{s.rot}</text>
                  </g>
                )
              })}
            </svg>
            {!drillAno ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 4 }}>Clique num ano para ver a evolução mês a mês</div> : null}
          </div>
        </div>
      </div>

      {/* Em aberto do ano */}
      {v ? (
        <div style={{ ...card, marginTop: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Valores em Aberto · {v.anoRef}</span>
          {(() => {
            const emAberto = v.cards.emAberto
            const inad = v.cards.inadimplencia
            const aVencer = Math.max(0, emAberto - inad)
            const mx = Math.max(1, emAberto)
            const linha = (lbl: string, val: number, cor: string) => (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: '#5b6477', fontWeight: 600 }}>{lbl}</span>
                  <span style={{ color: cor, fontWeight: 700 }}>{fmtMi(val)}</span>
                </div>
                <div style={{ height: 18, borderRadius: 9, background: '#eef1f7', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(3, 100 * val / mx).toFixed(1)}%`, borderRadius: 9, background: cor }} />
                </div>
              </div>
            )
            return (
              <div style={{ marginTop: 6 }}>
                {linha('Total em aberto', emAberto, '#e8962e')}
                {linha('Inadimplência (vencido)', inad, '#d64545')}
                {linha('A vencer', aVencer, '#1fa463')}
              </div>
            )
          })()}
        </div>
      ) : null}

      {/* ===== ONDA 2: Resumo de imóveis ===== */}
      {res ? (
        <div style={{ ...card, marginTop: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>Resumo de Imóveis</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginTop: 14 }}>
            {[
              { l: 'Com IPTU', val: res.resumo.comIptu, c: '#283e93' },
              { l: 'Com ITBI', val: res.resumo.comItbi, c: '#1fa463' },
              { l: 'Com empresa no endereço', val: res.resumo.comEmpresa, c: '#e8962e' },
              { l: 'Com TCA', val: res.resumo.comTca, c: '#8094d6' },
              { l: 'IPTU sem TCA', val: res.resumo.iptuSemTca, c: '#d64545' },
              { l: 'TCA sem IPTU', val: res.resumo.tcaSemIptu, c: '#5b6477' },
            ].map(x => (
              <div key={x.l} style={{ background: '#f7f9fd', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 21, fontWeight: 700, color: x.c, letterSpacing: '-.5px' }}>{x.val.toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11, color: '#5b6477', marginTop: 3, lineHeight: 1.25 }}>{x.l}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
      <div style={{ ...card, marginTop: 18 }}>
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
          const d = diario.dias
          const mx = Math.max(1, ...d.map(x => x.valor))
          const W = 1000, H = 200, xL = 8, xR = 992, yT = 12, yB = 176
          const X = (i: number) => d.length <= 1 ? (xL + xR) / 2 : xL + (i * (xR - xL)) / (d.length - 1)
          const Y = (val: number) => yB - (val / mx) * (yB - yT)
          const linha = d.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.valor).toFixed(1)}`).join(' ')
          const area = `${linha} L${X(d.length - 1).toFixed(1)} ${yB} L${X(0).toFixed(1)} ${yB} Z`
          // ticks: 1º de cada mês presente
          const ticks = d.map((x, i) => ({ i, dia: x.dia })).filter(t => t.dia.slice(8) === '01')
          return (
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', marginTop: 14 }}>
              <defs><linearGradient id="diaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#283e93" stopOpacity="0.25" /><stop offset="100%" stopColor="#283e93" stopOpacity="0" /></linearGradient></defs>
              <line x1={xL} y1={yB} x2={xR} y2={yB} stroke="#e3e8f1" strokeWidth="1.5" />
              <path d={area} fill="url(#diaGrad)" />
              <path d={linha} fill="none" stroke="#283e93" strokeWidth="1.6" />
              {ticks.map(t => (
                <text key={t.i} x={X(t.i).toFixed(1)} y="194" fontSize="11" fill="#9098a8" textAnchor="middle">{MESES[Number(t.dia.slice(5, 7)) - 1]}</text>
              ))}
            </svg>
          )
        })() : <div style={{ fontSize: 12, color: '#9098a8', padding: '24px 0', textAlign: 'center' }}>Sem arrecadação no período.</div>}
      </div>
    </div>
  )
}
