'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fmtAbrev } from '@/lib/fmt-grafico'
import type { TipoSelecionado } from './OutrosTributosPorTipo'

interface SerieItem { ano: number; lancado: number; arrecadado: number; saldo: number }
interface CenariosTributo { conservador: number; moderado: number; agressivo: number }
interface PrevisaoTributo { anoBase: number; anoPrevisao: number; base: number; cenarios: CenariosTributo }

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const CENARIO_CORES = ['#b9c4e8', '#5870c4', '#283e93'] // conservador → moderado → agressivo

// Painel companion do card "Outros Tributos por Tipo" (OutrosTributosPorTipo): ao selecionar
// um item lá (via callback onTipoChange, prop `item` aqui), mostra a evolução anual
// (lançado × arrecadado por exercício) daquele(s) código(s) de tributo específico(s) — fonte
// /api/tributo/serie-codigo (lib/tributo-engine.ts serieTributoPorCodigos) — e a previsão de
// lançado pra 2 exercícios à frente em 3 níveis (conservador/moderado/agressivo) — fonte
// /api/tributo/previsao-codigo (previsaoTributoCodigos), mesma técnica de regressão linear
// de previsaoIssFora. Mesmo padrão do painel companion "Análise de Enquadramento" em
// Mobiliário (IssSegmentoEnquadramento).
export default function OutrosTributoDetalhe({ item, mes }: { item: TipoSelecionado | null; mes?: number }) {
  const [serie, setSerie] = useState<SerieItem[] | null>(null)
  const [previsao, setPrevisao] = useState<PrevisaoTributo | null>(null)

  useEffect(() => {
    setSerie(null)
    if (!item) return
    const qs = new URLSearchParams({ codigos: item.codigos.join(',') })
    if (mes) qs.set('mes', String(mes))
    fetch(`/api/tributo/serie-codigo?${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.serie)) setSerie(d.serie) }).catch(() => {})
  }, [item, mes])

  useEffect(() => {
    setPrevisao(null)
    if (!item) return
    const qs = new URLSearchParams({ codigos: item.codigos.join(',') })
    fetch(`/api/tributo/previsao-codigo?${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPrevisao(d) }).catch(() => {})
  }, [item])

  if (!item) {
    return (
      <div style={{ ...card, marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 260 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Detalhe do Tributo</span>
        <div style={{ fontSize: 12, color: '#9098a8', marginTop: 10, maxWidth: 260 }}>
          Selecione um item em &quot;Outros Tributos por Tipo&quot; para ver a evolução anual detalhada.
        </div>
      </div>
    )
  }

  const ult = serie?.[serie.length - 1]
  const ant = serie && serie.length > 1 ? serie[serie.length - 2] : undefined
  const totalLancado = serie?.reduce((s, x) => s + x.lancado, 0) ?? 0
  const totalArrecadado = serie?.reduce((s, x) => s + x.arrecadado, 0) ?? 0
  const pctArrUlt = ult?.lancado ? (ult.arrecadado / ult.lancado) * 100 : 0

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Detalhe · {item.nome}</span>
        <span style={reportBadge}>Evolução anual</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        Lançado × Arrecadado por exercício{mes ? ` (acumulado até o mês ${mes})` : ''}{item.codigos.length > 1 ? ` — soma de ${item.codigos.length} códigos de tributo` : ''}.
      </div>

      {!serie ? (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
          <div style={{ height: 180, borderRadius: 12, background: '#eef1f7', marginTop: 6 }} />
        </div>
      ) : !serie.length ? (
        <div style={{ fontSize: 12, color: '#9098a8', textAlign: 'center', padding: '30px 0' }}>Sem série histórica para este item.</div>
      ) : (
        <>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#283e93' }}>Lançado {ult?.ano}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtAbrev(ult?.lancado ?? 0)}</div>
              {ant ? <div style={{ fontSize: 10, color: '#9098a8', marginTop: 2 }}>{ant.ano}: {fmtAbrev(ant.lancado)}</div> : null}
            </div>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#c07a2e' }}>Arrecadado {ult?.ano}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtAbrev(ult?.arrecadado ?? 0)}</div>
              <div style={{ fontSize: 10, color: '#9098a8', marginTop: 2 }}>{fmtPct(pctArrUlt)} do lançado</div>
            </div>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#d64545' }}>Inadimplência {ult?.ano}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtAbrev(ult?.saldo ?? 0)}</div>
            </div>
            <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#5b6477' }}>Acumulado no período</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtAbrev(totalArrecadado)}</div>
              <div style={{ fontSize: 10, color: '#9098a8', marginTop: 2 }}>de {fmtAbrev(totalLancado)} lançado</div>
            </div>
          </div>

          <div style={{ height: 200, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                <YAxis width={44} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
                  formatter={(val, name) => ['R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name] as [string, string]}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="lancado" name="Lançado" fill="#283e93" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="arrecadado" name="Arrecadado" fill="#e8962e" radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Previsão — mesma técnica de regressão linear de previsaoIssFora, sempre em
              base anual (independe do filtro de mês da tela). Fica visível assim que o
              item é selecionado, junto do histórico. */}
          <div style={{ marginTop: 20, borderTop: '1px solid #eef1f7', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Previsão · Lançado {previsao ? previsao.anoPrevisao : ''}</span>
              <span style={reportBadge}>3 níveis</span>
            </div>

            {!previsao ? (
              <div style={{ marginTop: 14, height: 120, borderRadius: 12, background: '#eef1f7' }} />
            ) : (
              <>
                <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 4 }}>
                  Regressão linear sobre os exercícios completos até {previsao.anoBase}, projetando {previsao.anoPrevisao}. Conservador = 50% do crescimento projetado, Moderado = regressão cheia, Agressivo = 150% do crescimento — todos ancorados no lançado real de {previsao.anoBase} ({fmtAbrev(previsao.base)}). Estimativa para planejamento, não uma garantia.
                </div>
                <div style={{ height: 130, marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { nome: 'Conservador', valor: previsao.cenarios.conservador },
                        { nome: 'Moderado', valor: previsao.cenarios.moderado },
                        { nome: 'Agressivo', valor: previsao.cenarios.agressivo },
                      ]}
                      layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
                      <XAxis type="number" tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 10, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="nome" width={82} tick={{ fontSize: 11.5, fill: '#3a4256', fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(40,62,147,0.05)' }}
                        formatter={(val) => ['R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Lançado projetado'] as [string, string]}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                      <Bar dataKey="valor" radius={[0, 6, 6, 0]} maxBarSize={26} label={{ position: 'right', formatter: (val: unknown) => fmtAbrev(Number(val) || 0), fontSize: 11, fill: '#1f2a44', fontWeight: 700 }}>
                        {CENARIO_CORES.map((cor, i) => <Cell key={i} fill={cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4, gap: 8, flexWrap: 'wrap' }}>
                  {(['conservador', 'moderado', 'agressivo'] as const).map((k, i) => {
                    const v = previsao.cenarios[k]
                    const pct = previsao.base ? ((v - previsao.base) / previsao.base) * 100 : 0
                    return (
                      <span key={k} style={{ fontSize: 10.5, color: CENARIO_CORES[i], fontWeight: 700 }}>
                        {pct >= 0 ? '+' : ''}{fmtPct(pct)} vs {previsao.anoBase}
                      </span>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
