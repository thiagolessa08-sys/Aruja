'use client'

import { useState, useEffect } from 'react'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface Item { nome: string; valor: number }

const TRIB_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#c0612a']

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }

// "Dívida Ativa por Tributo" — mesmo ranking exibido em app/divida-ativa/PainelDivida.tsx
// (fonte: /api/divida/resumo → lib/divida-engine.ts), reaproveitado aqui na tela de
// Outros Tributos para contextualizar o estoque de dívida ativa por tributo.
export default function DividaAtivaPorTributo() {
  const [itens, setItens] = useState<Item[] | null>(null)

  useEffect(() => {
    fetch('/api/divida/resumo').then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.porTributo)) setItens(d.porTributo) }).catch(() => {})
  }, [])

  if (!itens) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Dívida Ativa por Tributo</span>
          <span style={reportBadge}>Estoque</span>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const maxTrib = Math.max(1, ...itens.map(t => t.valor))

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Dívida Ativa por Tributo</span>
        <span style={reportBadge}>Estoque</span>
      </div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {itens.map((t, i) => {
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
  )
}
