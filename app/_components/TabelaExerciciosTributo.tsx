'use client'

import { useState, useEffect } from 'react'

interface SerieItem { ano: number; lancado: number; arrecadado: number; saldo: number }

const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

// "Exercícios de {titulo}" — mesma tabela que existia dentro de PainelTributo, extraída pra
// cá e renderizada separadamente (a pedido do usuário, só na aba ISS de Mobiliário) pra
// poder ficar POR ÚLTIMO na tela, depois dos outros cards de ISS. PainelTributo continua
// dono da série (usada pelos KPIs/gráficos dele); aqui é um fetch independente da mesma rota
// (/api/tributo/serie), já que a tabela não depende de nada que só PainelTributo calcula.
export default function TabelaExerciciosTributo({ grupo, titulo, mes }: { grupo: string; titulo: string; mes?: number }) {
  const [serie, setSerie] = useState<SerieItem[] | null>(null)

  useEffect(() => {
    setSerie(null)
    const qs = mes ? `&mes=${mes}` : ''
    fetch(`/api/tributo/serie?grupo=${grupo}${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.serie)) setSerie(d.serie) }).catch(() => {})
  }, [grupo, mes])

  return (
    <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 6px 22px rgba(40,80,180,0.05)', marginTop: 18 }}>
      <span style={{ fontSize: 17, fontWeight: 600, color: '#1f2a44' }}>Exercícios de {titulo}</span>
      {!serie ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (<div key={i} style={{ height: 34, borderRadius: 8, background: '#eef1f7' }} />))}
        </div>
      ) : (
        <div style={{ marginTop: 16, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Exercício', 'Lançado', 'Arrecadado', 'Inadimplência', '% Arrec.'].map((h, i) => (
                  <th key={h} style={{ background: '#283e93', color: '#fff', fontSize: 13, fontWeight: 600, padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', borderRight: '1px solid rgba(255,255,255,0.18)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...serie].reverse().map((row, ri) => {
                const cellBg = ri % 2 === 0 ? '#ffffff' : '#f7f9fd'
                const pa = row.lancado ? (row.arrecadado / row.lancado) * 100 : 0
                return (
                  <tr key={row.ano}>
                    <td style={{ background: '#e9eef8', color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #d6deef' }}>{row.ano}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.lancado)}</td>
                    <td style={{ background: cellBg, color: '#1fa463', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.arrecadado)}</td>
                    <td style={{ background: cellBg, color: '#d64545', fontSize: 12, fontWeight: 500, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7', borderRight: '1px solid #eef1f7' }}>{fmtReais(row.saldo)}</td>
                    <td style={{ background: cellBg, color: '#1f2a44', fontSize: 12, fontWeight: 600, padding: '9px 16px', textAlign: 'center', borderBottom: '1px solid #eef1f7' }}>{fmtPct(pa)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
