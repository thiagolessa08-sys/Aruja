'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export interface LinhaValoresPagos { nome: string; contribuinte: number; imobiliario: number; mobiliario: number; totalGeral: number }

const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Mesma caixa escura usada no tooltip de CONVERSÃO POR USUÁRIO (PainelCobranca.tsx) — duplicada
// aqui porque TabelaValoresPagosPorTributo é importado por PainelCobranca.tsx (import circular).
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

type Metrica = 'totalGeral' | 'contribuinte' | 'imobiliario' | 'mobiliario'
const METRICAS: { key: Metrica; label: string; labelCol: string; cor: string }[] = [
  { key: 'contribuinte', label: 'Contribuinte', labelCol: 'CONTRIBUINTE', cor: '#aab8e3' },
  { key: 'imobiliario', label: 'Imobiliario', labelCol: 'IMOBILIARIO', cor: '#7d8fce' },
  { key: 'mobiliario', label: 'Mobiliario', labelCol: 'MOBILIARIO', cor: '#3f5bb5' },
]

const thStyle: React.CSSProperties = { background: '#283e93', color: '#fff', fontWeight: 700, fontSize: 10, padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }
const thFirstStyle: React.CSSProperties = { ...thStyle, textAlign: 'left' }
const tdStyle: React.CSSProperties = { fontSize: 10.5, color: '#3a4256', padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #eef1f7', whiteSpace: 'nowrap' }
const tdFirstStyle: React.CSSProperties = { ...tdStyle, textAlign: 'left', fontWeight: 600, color: '#1f2a44' }

const dotTh = (cor: string, label: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, display: 'inline-block', flex: 'none' }} />
    {label}
  </span>
)

// Mesma escala vermelho→verde usada em "Produtividade por Usuário" (PainelCobranca.tsx) —
// duplicada aqui pelo mesmo motivo do tipBox (import circular).
function heatRedGreen(valor: number, min: number, max: number) {
  const t = max > min ? (valor - min) / (max - min) : 0.5
  const stops: [number, number, number][] = [[214, 69, 69], [232, 180, 46], [31, 164, 99]]
  const pos = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(pos))
  const f = pos - i
  const [r1, g1, b1] = stops[i], [r2, g2, b2] = stops[i + 1]
  const r = Math.round(r1 + (r2 - r1) * f), g = Math.round(g1 + (g2 - g1) * f), b = Math.round(b1 + (b2 - b1) * f)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.72)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// Mesmo formato visual da tabela "Produtividade por Usuário" (cantos arredondados, zebra
// striping, pontos coloridos por setor) — a pedido do usuário, substituindo a lista ranqueada
// anterior, mas mantendo a barra "Total pago no mês" e os mini-cards clicáveis por setor.
export default function TabelaValoresPagosPorTributo({ linhas }: { linhas: LinhaValoresPagos[] }) {
  const [busca, setBusca] = useState('')
  const [metricaSel, setMetricaSel] = useState<Metrica | null>(null)
  const metricaAtiva: Metrica = metricaSel ?? 'totalGeral'

  const totalGeral = linhas.reduce((s, l) => s + l.totalGeral, 0)
  const totais: Record<Metrica, number> = {
    totalGeral,
    contribuinte: linhas.reduce((s, l) => s + l.contribuinte, 0),
    imobiliario: linhas.reduce((s, l) => s + l.imobiliario, 0),
    mobiliario: linhas.reduce((s, l) => s + l.mobiliario, 0),
  }

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const base = termo ? linhas.filter(l => l.nome.toLowerCase().includes(termo)) : linhas
    return [...base].sort((a, b) => b[metricaAtiva] - a[metricaAtiva])
  }, [linhas, busca, metricaAtiva])

  const minTotal = Math.min(...itensFiltrados.map(l => l.totalGeral))
  const maxTotal = Math.max(...itensFiltrados.map(l => l.totalGeral))
  const gradienteHeat = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => heatRedGreen(i, 0, 10)).join(', ')})`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '5px 10px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tributo…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 160, fontFamily: 'inherit' }} />
        </div>
      </div>

      <div style={{ background: '#283e93', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total pago no mês</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtReais(totalGeral)}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {METRICAS.map(m => {
          const ativo = metricaSel === m.key
          const pct = totalGeral ? (100 * totais[m.key] / totalGeral) : 0
          return (
            <div key={m.key} onClick={() => setMetricaSel(ativo ? null : m.key)}
              title="Clique para ordenar a tabela por esta métrica"
              style={{ flex: '1 1 0', minWidth: 110, background: ativo ? '#eef1fb' : '#f7f9fd', border: ativo ? `1.5px solid ${m.cor}` : '1.5px solid transparent', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: m.cor }}>{fmtReais(totais[m.key])}</div>
              <div style={{ fontSize: 10, color: '#5b6477' }}>{m.label}</div>
              <div style={{ fontSize: 9.5, color: '#aeb6c6' }}>{pct.toFixed(1).replace('.', ',')}%</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 8, fontSize: 10, color: '#5b6477' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 600, color: '#9098a8' }}>Setor:</span>
          {METRICAS.map(m => (
            <span key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.cor, display: 'inline-block' }} />
              {m.label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, color: '#9098a8' }}>Intensidade (Total Geral):</span>
          <span style={{ width: 70, height: 8, borderRadius: 4, background: gradienteHeat, display: 'inline-block' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5 }}>
            <span style={{ color: '#d64545', fontWeight: 600 }}>Baixo</span>
            <span style={{ color: '#c2c9d6' }}>·</span>
            <span style={{ color: '#b8860b', fontWeight: 600 }}>Médio</span>
            <span style={{ color: '#c2c9d6' }}>·</span>
            <span style={{ color: '#1fa463', fontWeight: 600 }}>Alto</span>
          </span>
        </div>
      </div>

      {!itensFiltrados.length ? (
        <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>Nenhum tributo encontrado.</div>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, maxHeight: 360, overflow: 'auto', border: '1px solid #e3e8f1', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={thFirstStyle}>TRIBUTO</th>
                {METRICAS.map(m => <th key={m.key} style={thStyle}>{dotTh(m.cor, m.labelCol)}</th>)}
                <th style={thStyle}>TOTAL GERAL</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map((l, i) => (
                <tr key={l.nome} style={{ background: i % 2 ? '#fafbfe' : '#fff' }}>
                  <td style={tdFirstStyle}>{l.nome}</td>
                  {METRICAS.map(m => <td key={m.key} style={tdStyle}>{l[m.key] === 0 ? '—' : fmtReais(l[m.key])}</td>)}
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#283e93', background: heatRedGreen(l.totalGeral, minTotal, maxTotal) }}>{fmtReais(l.totalGeral)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdFirstStyle, background: '#eef1fb' }}>Total Geral</td>
                {METRICAS.map(m => <td key={m.key} style={{ ...tdStyle, background: '#eef1fb', fontWeight: 700 }}>{fmtReais(totais[m.key])}</td>)}
                <td style={{ ...tdStyle, background: '#eef1fb', fontWeight: 700, color: '#283e93' }}>{fmtReais(totalGeral)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ width: 480, flex: 'none' }}>
          <GraficoTotalGeralPorTributo itens={itensFiltrados} />
        </div>
        </div>
      )}
    </div>
  )
}

// Gráfico de barras "Total Geral Pago-Tributo" ao lado direito da tabela — a pedido do usuário,
// ordenado pelo próprio valor exibido (totalGeral), do maior para o menor, com os tributos
// filtrados pela mesma busca.
function GraficoTotalGeralPorTributo({ itens }: { itens: LinhaValoresPagos[] }) {
  const dados = useMemo(() => [...itens].sort((a, b) => b.totalGeral - a.totalGeral), [itens])

  if (!dados.length) return null
  const altura = Math.max(320, dados.length * 26)
  return (
    <div style={{ border: '1px solid #e3e8f1', borderRadius: 12, padding: '12px 8px 4px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1f2a44', textAlign: 'center', marginBottom: 6 }}>TOTAL GERAL PAGO-TRIBUTO</div>
      <div style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <XAxis type="number" tickFormatter={(v: number) => fmtReais(v)} tick={{ fontSize: 9, fill: '#c2c9d6' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
            <YAxis type="category" dataKey="nome" width={180} tick={{ fontSize: 9, fill: '#5b6477' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }} content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null
              const p = payload[0].payload as LinhaValoresPagos
              return tipBox(p.nome, [{ texto: `Total: ${fmtReais(p.totalGeral)}`, cor: '#4fb8e8' }])
            }} />
            <Bar dataKey="totalGeral" fill="#4fb8e8" radius={[0, 3, 3, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
