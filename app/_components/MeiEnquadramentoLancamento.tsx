'use client'

import { useState, useEffect } from 'react'

interface Dados {
  totalCadastrados: number
  porExercicio: { exercicio: number; lancado: number }[]
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const n = (v: number) => v.toLocaleString('pt-BR')

// "Análise de Enquadramento vs Lançamento (MEIs)" — compara o total de empresas
// enquadradas como MEI no cadastro (situação Ativo) com a quantidade dessas MEIs que
// tiveram TFE (cd_tributo 2002) efetivamente lançado, por exercício. Fonte:
// /api/mobiliario/mei-enquadramento. `ano` (opcional) apenas destaca a barra do
// exercício selecionado no painel; `mes` acumula as parcelas até aquele mês (mesma
// convenção do PainelTributo), refazendo a consulta.
export default function MeiEnquadramentoLancamento({ ano, mes }: { ano?: number; mes?: number }) {
  const [dados, setDados] = useState<Dados | null>(null)

  useEffect(() => {
    setDados(null)
    const qs = mes ? `?mes=${mes}` : ''
    fetch(`/api/mobiliario/mei-enquadramento${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setDados(d) }).catch(() => {})
  }, [mes])

  if (!dados) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Análise de Enquadramento vs Lançamento (MEIs)</span>
          <span style={reportBadge}>TFE</span>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const { totalCadastrados, porExercicio } = dados

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Análise de Enquadramento vs Lançamento (MEIs)</span>
        <span style={reportBadge}>TFE</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        MEIs ativos no cadastro x MEIs com TFE lançado, por exercício{mes ? ` — acumulado até o mês ${mes}` : ''}
      </div>

      <div style={{ marginTop: 16, background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>MEIs enquadrados no cadastro (situação Ativo)</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{n(totalCadastrados)}</div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {porExercicio.map(e => {
          const pct = totalCadastrados > 0 ? (e.lancado / totalCadastrados) * 100 : 0
          const w = Math.min(100, pct)
          const selecionado = ano === e.exercicio
          return (
            <div key={e.exercicio} style={selecionado ? { background: '#f0f3fc', borderRadius: 8, padding: '6px 8px', margin: '-6px -8px' } : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: selecionado ? '#283e93' : '#3a4256', fontWeight: selecionado ? 700 : 400 }}>
                  Exercício {e.exercicio}{selecionado ? ' (selecionado)' : ''}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44' }}>{n(e.lancado)} com TFE lançado ({pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)</span>
              </div>
              <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: selecionado ? '#e8962e' : '#283e93', borderRadius: 5 }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 12 }}>
        Enquadramento: ds_tipo_empresa = MEI no cadastro mobiliário. Lançamento: guias de TFE (cd_tributo 2002) lançadas no exercício, vinculadas à mesma empresa.
      </div>
    </div>
  )
}
