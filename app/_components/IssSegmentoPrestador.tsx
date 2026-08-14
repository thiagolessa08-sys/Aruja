'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Spinner } from './LoadingOverlay'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface Segmento { nome: string; valor: number }
interface Prestador { cd: number; nome: string; cnpjCpf: string; qt: number; valor: number }
interface AnoIss { ano: number; lancado: number }

const SEG_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#c0612a']

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const voltarBtn: React.CSSProperties = { border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, flex: 'none' }

// "ISS por Segmento" mesclado com "Top Prestadores de ISS", com drill em 2 níveis (mesmo
// padrão do drill bairro→rua→imóvel do ITBI em PainelItbi.tsx):
//  1) Segmento (ds_grupo do cadastro mobiliário) — fonte /api/mobiliario/iss-segmento
//  2) Clique num segmento → ranking dos prestadores daquele segmento — fonte
//     /api/mobiliario/iss-prestadores?segmento=
// Dentro do nível 2, clique num prestador expande inline a evolução do ISS lançado por
// exercício (mesmo drill que já existia em IssTopPrestadores) — fonte
// /api/mobiliario/iss-prestador-serie. `ano`/`mes` seguem a convenção do PainelTributo.
export default function IssSegmentoPrestador({ ano, mes }: { ano?: number; mes?: number }) {
  const [segmentos, setSegmentos] = useState<Segmento[] | null>(null)
  const [segmentoSel, setSegmentoSel] = useState<string | null>(null)
  const [prestadores, setPrestadores] = useState<Prestador[] | null>(null)
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<number | null>(null)
  const [serieExpandida, setSerieExpandida] = useState<AnoIss[] | null>(null)

  useEffect(() => {
    setSegmentos(null)
    setSegmentoSel(null)
    setPrestadores(null)
    setBusca('')
    setExpandido(null)
    setSerieExpandida(null)
    const qs = new URLSearchParams()
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/mobiliario/iss-segmento${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.porSegmento)) setSegmentos(d.porSegmento) }).catch(() => {})
  }, [ano, mes])

  function abrirSegmento(nome: string) {
    setSegmentoSel(nome)
    setPrestadores(null)
    setBusca('')
    setExpandido(null)
    setSerieExpandida(null)
    const qs = new URLSearchParams({ top: '20', segmento: nome })
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    fetch(`/api/mobiliario/iss-prestadores?${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.itens)) setPrestadores(d.itens) }).catch(() => {})
  }

  function voltarSegmentos() {
    setSegmentoSel(null)
    setPrestadores(null)
    setBusca('')
    setExpandido(null)
    setSerieExpandida(null)
  }

  function alternarPrestador(cd: number) {
    if (expandido === cd) { setExpandido(null); setSerieExpandida(null); return }
    setExpandido(cd)
    setSerieExpandida(null)
    const qs = new URLSearchParams({ cd: String(cd) })
    if (mes) qs.set('mes', String(mes))
    fetch(`/api/mobiliario/iss-prestador-serie?${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.serie)) setSerieExpandida(d.serie) }).catch(() => {})
  }

  if (!segmentos) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS por Segmento</span>
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

  const nivel: 'segmento' | 'prestador' = segmentoSel ? 'prestador' : 'segmento'
  const titulo = nivel === 'prestador' ? `Prestadores · ${segmentoSel}` : `ISS por Segmento${ano ? ` · ${ano}` : ''}`

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>{titulo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {nivel === 'prestador' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '5px 10px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou CNPJ/CPF…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 170, fontFamily: 'inherit' }} />
              {busca ? (
                <button onClick={() => setBusca('')} title="Limpar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9098a8', display: 'flex', alignItems: 'center', padding: 0, flex: 'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              ) : null}
            </div>
          ) : null}
          {nivel === 'prestador' ? <button onClick={voltarSegmentos} style={voltarBtn}>‹ Voltar aos segmentos</button> : null}
          <span style={reportBadge}>Lançado</span>
        </div>
      </div>

      {nivel === 'segmento' ? (
        <>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            ISS/ISSQN lançado por segmento da empresa (ds_grupo do cadastro mobiliário){mes ? ` até o mês ${mes}` : ''} · clique num segmento para ver os prestadores. &quot;Não classificado&quot; inclui guias sem vínculo com o cadastro mobiliário (ex.: retenções e exercícios mais antigos).
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {(() => {
              const maxSeg = Math.max(1, ...segmentos.map(t => t.valor))
              return segmentos.map((t, i) => (
                <div key={t.nome} onClick={() => abrirSegmento(t.nome)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256', lineHeight: 1.2, paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(t.valor)}</span>
                  </div>
                  <div style={{ height: 13, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(3, 100 * t.valor / maxSeg).toFixed(1)}%`, background: SEG_CORES[i % SEG_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              ))
            })()}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            Empresas do segmento &quot;{segmentoSel}&quot; que mais geraram ISS/ISSQN lançado{mes ? ` até o mês ${mes}` : ''} · clique para ver a evolução por exercício.
          </div>

          {!prestadores ? (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
              ))}
            </div>
          ) : (() => {
            const total = prestadores.reduce((s, t) => s + t.valor, 0)
            const maxVal = Math.max(1, ...prestadores.map(t => t.valor))
            const q = busca.trim().toLowerCase()
            const filtrados = q ? prestadores.filter(t => t.nome.toLowerCase().includes(q) || t.cnpjCpf.includes(q)) : prestadores
            return (
              <>
                <div style={{ marginTop: 12, background: '#283e93', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total do Top {prestadores.length} em &quot;{segmentoSel}&quot;</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtAbrev(total)}</span>
                </div>

                <div style={{ marginTop: 14, maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                  {!filtrados.length ? (
                    <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>Nenhum prestador encontrado para a busca.</div>
                  ) : filtrados.map((t, i) => {
                    const aberto = expandido === t.cd
                    return (
                      <div key={t.cd}>
                        <div onClick={() => alternarPrestador(t.cd)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 2 }}>
                            <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="3" style={{ flex: 'none', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
                              {i + 1}. {t.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>{t.cnpjCpf ? `· ${t.cnpjCpf}` : ''}</span>
                            </span>
                            <span style={{ color: '#283e93', fontWeight: 700, flex: 'none' }}>{fmtAbrev(t.valor)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#aeb6c6', marginBottom: 4 }}>{t.qt.toLocaleString('pt-BR')} guia{t.qt === 1 ? '' : 's'}</div>
                          <div style={{ height: 12, borderRadius: 6, background: '#eef1f7', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(3, 100 * t.valor / maxVal).toFixed(1)}%`, borderRadius: 6, background: aberto ? '#283e93' : '#3f5bb5' }} />
                          </div>
                        </div>
                        {aberto ? (
                          <div style={{ marginTop: 8, background: '#f7f9fd', borderRadius: 10, padding: '10px 8px 4px' }}>
                            <div style={{ fontSize: 10.5, color: '#5b6477', fontWeight: 600, padding: '0 6px 6px' }}>ISS lançado por exercício</div>
                            {!serieExpandida ? <Spinner label="Carregando…" size={26} padding={16} />
                              : !serieExpandida.length ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '10px 0' }}>Sem dados por exercício.</div>
                              : (
                                <div style={{ height: 130 }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={serieExpandida} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                                      <XAxis dataKey="ano" tick={{ fontSize: 9.5, fill: '#9098a8' }} axisLine={{ stroke: '#e3e8f1' }} tickLine={false} />
                                      <YAxis width={38} tickFormatter={(val: number) => fmtAbrev(Number(val))} tick={{ fontSize: 9, fill: '#c2c9d6' }} axisLine={false} tickLine={false} />
                                      <Tooltip cursor={{ fill: 'rgba(40,62,147,0.06)' }}
                                        formatter={(val) => ['R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Lançado'] as [string, string]}
                                        contentStyle={{ borderRadius: 10, border: '1px solid #e3e9f5', fontSize: 12 }} />
                                      <Bar dataKey="lancado" fill="#283e93" radius={[3, 3, 0, 0]} maxBarSize={26} />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
