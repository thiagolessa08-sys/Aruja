'use client'

import { useId } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

export interface PontoDuplo { ano: number | string; v1: number; v2: number }

interface Props {
  data: PontoDuplo[]
  cor1?: string
  cor2?: string
  nome1: string
  nome2: string
  fmtValor: (v: number) => string         // tooltip (ambas as séries)
  fmtEixo?: (v: number) => string         // rótulo dos eixos Y (mi)
}

// Linha dupla com dois eixos Y (recharts). Série 1 = área preenchida (eixo esq.),
// série 2 = linha tracejada (eixo dir.). Eixos/fonte responsivos.
export default function LinhaDuplaSerie({ data, cor1 = '#283e93', cor2 = '#e8962e', nome1, nome2, fmtValor, fmtEixo }: Props) {
  const id = useId().replace(/:/g, '')
  const gradId = `gradd-${id}`
  const fEixo = fmtEixo ?? ((v: number) => String(v))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor1} stopOpacity={0.22} />
            <stop offset="100%" stopColor={cor1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f0f2f8" />
        <XAxis dataKey="ano" tickLine={false} axisLine={false} dy={4}
          tick={{ fontSize: 12, fill: '#aeb6c6', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }} />
        <YAxis yAxisId="left" width={38} tickLine={false} axisLine={false} tickFormatter={fEixo}
          tick={{ fontSize: 12, fill: '#aeb6c6', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }} />
        <YAxis yAxisId="right" orientation="right" width={42} tickLine={false} axisLine={false} tickFormatter={fEixo}
          tick={{ fontSize: 12, fill: '#e8962e', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }} />
        <Tooltip
          cursor={{ stroke: '#cdd5ef', strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload || !payload.length) return null
            const p1 = payload.find(p => p.dataKey === 'v1')
            const p2 = payload.find(p => p.dataKey === 'v2')
            return (
              <div style={{ background: '#23304b', borderRadius: 10, padding: '9px 12px', boxShadow: '0 8px 18px rgba(20,40,90,0.25)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{label}</div>
                {p1 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor1 }} />{nome1}: {fmtValor(Number(p1.value) || 0)}
                </div>}
                {p2 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor2 }} />{nome2}: {fmtValor(Number(p2.value) || 0)}
                </div>}
              </div>
            )
          }}
        />
        <Area yAxisId="left" type="monotone" dataKey="v1" stroke={cor1} strokeWidth={2.5} fill={`url(#${gradId})`}
          dot={{ r: 3, fill: cor1, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        <Line yAxisId="right" type="monotone" dataKey="v2" stroke={cor2} strokeWidth={2} strokeDasharray="6 4"
          dot={{ r: 2.5, fill: cor2, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 4 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
