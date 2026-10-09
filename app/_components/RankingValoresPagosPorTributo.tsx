'use client'

import { useMemo, useState } from 'react'

export interface LinhaValoresPagos { nome: string; contribuinte: number; imobiliario: number; mobiliario: number; totalGeral: number }

const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Metrica = 'totalGeral' | 'contribuinte' | 'imobiliario' | 'mobiliario'
const METRICAS: { key: Metrica; label: string; cor: string }[] = [
  { key: 'contribuinte', label: 'Contribuinte', cor: '#aab8e3' },
  { key: 'imobiliario', label: 'Imobiliario', cor: '#7d8fce' },
  { key: 'mobiliario', label: 'Mobiliario', cor: '#3f5bb5' },
]

// Mesmo molde visual de "Imóveis mais transmitidos" (ITBI, app/imobiliario/PainelItbi.tsx) —
// barra de total em destaque, mini-cards clicáveis por métrica (equivalente às faixas de
// transmissão) e lista ranqueada com barra de progresso — a pedido do usuário, substituindo
// o AG Grid anterior só neste 2º nível de drill.
export default function RankingValoresPagosPorTributo({ linhas }: { linhas: LinhaValoresPagos[] }) {
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
    return [...base].filter(l => l[metricaAtiva] > 0).sort((a, b) => b[metricaAtiva] - a[metricaAtiva])
  }, [linhas, busca, metricaAtiva])

  const mx = Math.max(1, ...itensFiltrados.map(l => l[metricaAtiva]))

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

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {METRICAS.map(m => {
          const ativo = metricaSel === m.key
          const pct = totalGeral ? (100 * totais[m.key] / totalGeral) : 0
          return (
            <div key={m.key} onClick={() => setMetricaSel(ativo ? null : m.key)}
              title="Clique para ordenar o ranking por esta métrica"
              style={{ flex: '1 1 0', minWidth: 110, background: ativo ? '#eef1fb' : '#f7f9fd', border: ativo ? `1.5px solid ${m.cor}` : '1.5px solid transparent', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: m.cor }}>{fmtReais(totais[m.key])}</div>
              <div style={{ fontSize: 10, color: '#5b6477' }}>{m.label}</div>
              <div style={{ fontSize: 9.5, color: '#aeb6c6' }}>{pct.toFixed(1).replace('.', ',')}%</div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
        {!itensFiltrados.length ? (
          <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>Nenhum tributo encontrado.</div>
        ) : itensFiltrados.map((l, i) => (
          <div key={l.nome}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {l.nome}</span>
              <span style={{ color: '#283e93', fontWeight: 700, flex: 'none' }}>{fmtReais(l[metricaAtiva])}</span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: '#eef1f7', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(3, 100 * l[metricaAtiva] / mx).toFixed(1)}%`, borderRadius: 6, background: '#3f5bb5' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
