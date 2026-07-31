'use client'

import { useState, useEffect } from 'react'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface Item { nome: string; valor: number }

const SEG_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#c0612a']

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }

// "Taxa de Fiscalização por Segmento" — TFE (cd_tributo 2002) lançado, agrupado pelo
// segmento (ds_grupo) da empresa vinculada à guia. Fonte: /api/mobiliario/tfe-segmento.
// `ano`/`mes` (opcionais) refletem os filtros do painel (Exercício/Mês), mesma
// convenção usada pelo PainelTributo.
export default function TfePorSegmento({ ano, mes }: { ano?: number; mes?: number }) {
  const [itens, setItens] = useState<Item[] | null>(null)

  useEffect(() => {
    setItens(null)
    const qs = new URLSearchParams()
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/mobiliario/tfe-segmento${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.porSegmento)) setItens(d.porSegmento) }).catch(() => {})
  }, [ano, mes])

  if (!itens) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Taxa de Fiscalização por Segmento</span>
          <span style={reportBadge}>Lançado</span>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const maxSeg = Math.max(1, ...itens.map(t => t.valor))

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Taxa de Fiscalização por Segmento</span>
        <span style={reportBadge}>Lançado</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        TFE lançado por segmento da empresa (ds_grupo do cadastro mobiliário){ano ? ` — Exercício ${ano}` : ''}{mes ? ` até o mês ${mes}` : ''}
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {itens.map((t, i) => {
          const w = (t.valor / maxSeg) * 100
          return (
            <div key={t.nome}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#3a4256', lineHeight: 1.2, paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(t.valor)}</span>
              </div>
              <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: SEG_CORES[i % SEG_CORES.length], borderRadius: 5 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
