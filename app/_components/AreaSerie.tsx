'use client'

import { useId } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

export interface PontoSerie { ano: number | string; valor: number }

interface Props {
  data: PontoSerie[]
  cor?: string
  /** Formata o valor exibido no tooltip (ex.: "R$ 9,2 mi"). */
  fmtValor: (v: number) => string
  /** Formata o rótulo do eixo Y (ex.: "9"). */
  fmtEixoY?: (v: number) => string
  /** Rótulo da série no tooltip (ex.: "Inadimplência"). */
  nome?: string
}

// Gráfico de linha/área responsivo (recharts). Eixos e fontes se ajustam
// automaticamente à largura — sem necessidade de calcular fontSize por viewBox.
export default function AreaSerie({ data, cor = '#283e93', fmtValor, fmtEixoY, nome = 'Valor' }: Props) {
  const id = useId().replace(/:/g, '')
  const gradId = `grad-${id}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f0f2f8" />
        <XAxis
          dataKey="ano"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: '#aeb6c6', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}
          dy={4}
        />
        <YAxis
          width={42}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: '#aeb6c6', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}
          tickFormatter={fmtEixoY ?? ((v: number) => String(v))}
        />
        <Tooltip
          cursor={{ stroke: '#cdd5ef', strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload || !payload.length) return null
            const v = Number(payload[0].value) || 0
            return (
              <div style={{ background: '#23304b', borderRadius: 10, padding: '9px 12px', boxShadow: '0 8px 18px rgba(20,40,90,0.25)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cfd7e6', marginTop: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor }} />{nome}: {fmtValor(v)}
                </div>
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="valor"
          stroke={cor}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={{ r: 3, fill: cor, stroke: '#fff', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: cor, stroke: '#fff', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
