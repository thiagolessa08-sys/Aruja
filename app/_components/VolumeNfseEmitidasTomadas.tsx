'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface AnoVolume { ano: number; emitidas: number; tomadas: number }

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const n = (v: number) => v.toLocaleString('pt-BR')

// "Volumes de NFS-e Emitidas e Tomadas por Período" — quantidade de notas por exercício,
// separadas em Emitidas (prestador de Arujá) × Tomadas (prestador de fora do município, ISS
// retido pelo tomador local). Fonte: /api/mobiliario/iss-emitidas-tomadas (tb_dsod_nfse).
// tb_dsod_nfse não tem campo de identidade do tomador nem indicador confiável de
// responsabilidade pela retenção (ic_responsavel_retencao veio 100% nulo, ic_imposto_retido
// não correlaciona com a localidade do prestador — validado ao vivo) — por isso usa a mesma
// classificação aproximada de município do prestador já usada em ISS Prestador de Fora do
// Município, aqui como volume (nº de notas) em vez de valor. `mes` (opcional) acumula as
// notas emitidas até aquele mês em todos os anos, mesma convenção do PainelTributo.
export default function VolumeNfseEmitidasTomadas({ mes }: { mes?: number }) {
  const [porAno, setPorAno] = useState<AnoVolume[] | null>(null)

  useEffect(() => {
    setPorAno(null)
    const qs = new URLSearchParams()
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/mobiliario/iss-emitidas-tomadas${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.porAno)) setPorAno(d.porAno) }).catch(() => {})
  }, [mes])

  if (!porAno) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Volumes de NFS-e Emitidas e Tomadas</span>
          <span style={reportBadge}>NFS-e</span>
        </div>
        <div style={{ marginTop: 24, height: 200, borderRadius: 12, background: '#eef1f7' }} />
      </div>
    )
  }

  const ultimo = porAno[porAno.length - 1]
  const totalUltimo = ultimo ? ultimo.emitidas + ultimo.tomadas : 0
  const pctTomadasUltimo = totalUltimo ? (100 * ultimo.tomadas / totalUltimo) : 0

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Volumes de NFS-e Emitidas e Tomadas</span>
        <span style={reportBadge}>NFS-e</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        Quantidade de notas por exercício{mes ? ` até o mês ${mes}` : ''} — Emitidas: prestador de Arujá. Tomadas: prestador de fora do município, com ISS retido pelo tomador local. Classificação aproximada por município do prestador (mesma do card ISS Prestador de Fora do Município).
      </div>

      {ultimo ? (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#283e93' }}>Emitidas em {ultimo.ano}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{n(ultimo.emitidas)}</div>
          </div>
          <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#c07a2e' }}>Tomadas em {ultimo.ano}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{n(ultimo.tomadas)}</div>
          </div>
          <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#5b6477' }}>% Tomadas em {ultimo.ano}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{pctTomadasUltimo.toFixed(1).replace('.', ',')}%</div>
          </div>
        </div>
      ) : null}

      <div style={{ height: 240, marginTop: 18 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porAno} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
            <YAxis width={44} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
              formatter={(val, name) => [Number(val).toLocaleString('pt-BR') + ' notas', name] as [string, string]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="emitidas" name="Emitidas (Arujá)" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="tomadas" name="Tomadas (fora do município)" fill="#e8962e" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
