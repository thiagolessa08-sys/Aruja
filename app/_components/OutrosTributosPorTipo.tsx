'use client'

import { useState, useEffect } from 'react'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface RankTributo { cd: number; nome: string; lancado: number; arrecadado: number; saldo: number }

const CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#eaa957', '#f0bb7c']
const TOP_N = 10

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

// Gráfico "apenas com Outros Tributos": ranking dos tipos individuais de tributo (cd_tributo)
// que compõem o grupo "Outros" (tudo que não é IPTU/ITBI/ISS Construção Civil/ISS/TFE/TFHS —
// mesma exclusão de lib/tributos.ts CODIGOS_CORE/CODIGOS_EXCLUIDOS). Fonte:
// /api/tributo/ranking (lib/tributo-engine.ts rankingTributos), já usada internamente pelo
// warmup/cobrança — aqui exposta como visualização própria. Mostra os TOP_N por lançado +
// uma linha agregada "Demais tributos" com o restante, pra não poluir com 30+ códigos.
export default function OutrosTributosPorTipo({ ano, mes }: { ano?: number; mes?: number }) {
  const [itens, setItens] = useState<RankTributo[] | null>(null)

  useEffect(() => {
    setItens(null)
    const qs = new URLSearchParams()
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/tributo/ranking${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.itens)) setItens(d.itens) }).catch(() => {})
  }, [ano, mes])

  if (!itens) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Outros Tributos por Tipo</span>
          <span style={reportBadge}>Lançado</span>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 10}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const ordenado = [...itens].filter(t => t.lancado > 0 || t.arrecadado > 0).sort((a, b) => b.lancado - a.lancado)
  const top = ordenado.slice(0, TOP_N)
  const resto = ordenado.slice(TOP_N)
  const demais = resto.length ? {
    cd: -1,
    nome: `Demais tributos (${resto.length})`,
    lancado: resto.reduce((s, t) => s + t.lancado, 0),
    arrecadado: resto.reduce((s, t) => s + t.arrecadado, 0),
    saldo: resto.reduce((s, t) => s + t.saldo, 0),
  } : null
  const linhas = demais ? [...top, demais] : top

  const totalLancado = ordenado.reduce((s, t) => s + t.lancado, 0)
  const totalArrecadado = ordenado.reduce((s, t) => s + t.arrecadado, 0)
  const maxVal = Math.max(1, ...linhas.map(t => t.lancado))

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Outros Tributos por Tipo{ano ? ` · ${ano}` : ''}</span>
        <span style={reportBadge}>Lançado</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        Composição do grupo &quot;Outros Tributos&quot; por tipo (taxas, contribuições, multas e demais códigos fora de IPTU/ITBI/ISS/TFE/TFHS){mes ? ` até o mês ${mes}` : ''} — {ordenado.length} tipo{ordenado.length === 1 ? '' : 's'} no total, exibindo os {Math.min(TOP_N, ordenado.length)} maiores.
      </div>

      {!ordenado.length ? (
        <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem lançamentos de Outros Tributos no período selecionado.</div>
      ) : (
        <>
          <div style={{ marginTop: 12, background: '#283e93', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total de Outros Tributos{ano ? ` em ${ano}` : ''}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>
              {fmtAbrev(totalLancado)} <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>lançado</span>
            </span>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {linhas.map((t, i) => {
              const cor = t.cd === -1 ? '#aab8e3' : CORES[i % CORES.length]
              const w = Math.max(3, 100 * t.lancado / maxVal)
              const pctArr = t.lancado ? (t.arrecadado / t.lancado) * 100 : 0
              return (
                <div key={t.cd}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4, gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none', textAlign: 'right' }}>
                      {fmtAbrev(t.lancado)}
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#9098a8' }}>{fmtAbrev(t.arrecadado)} arrec. ({fmtPct(pctArr)})</span>
                    </span>
                  </div>
                  <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: cor, borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: '#9098a8', textAlign: 'right' }}>
            Arrecadado total: <b style={{ color: '#1fa463' }}>{fmtAbrev(totalArrecadado)}</b> ({fmtPct(totalLancado ? totalArrecadado / totalLancado * 100 : 0)} do lançado)
          </div>
        </>
      )}
    </div>
  )
}
