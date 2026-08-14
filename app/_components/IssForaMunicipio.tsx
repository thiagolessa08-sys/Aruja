'use client'

import { useState, useEffect } from 'react'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface GrupoMun { qt: number; base: number; iss: number }
interface MunItem { nome: string; qt: number; iss: number }
interface Resp { local: GrupoMun; fora: GrupoMun; naoInformado: GrupoMun; topFora: MunItem[] }
interface PrestadorForaItem { cnpj: string; nome: string; qt: number; iss: number }

interface CenariosValor { conservador: number; provavel: number; agressivo: number }
interface PrevisaoResp {
  anoBase: number
  anoPrevisao: number
  historico: { ano: number; local: number; fora: number }[]
  local: CenariosValor
  fora: CenariosValor
}
type Cenario = 'conservador' | 'provavel' | 'agressivo'

const FORA_CORES = ['#e8962e', '#eba846', '#efb95f', '#f2c977', '#f5d790', '#f8e4a9', '#facfc2']
const LOCAL_LABEL = 'Arujá'
const CENARIOS: { key: Cenario; label: string }[] = [
  { key: 'conservador', label: 'Conservador' },
  { key: 'provavel', label: 'Provável' },
  { key: 'agressivo', label: 'Agressivo' },
]

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const voltarBtn: React.CSSProperties = { border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, flex: 'none' }

// "ISS Prestador de Fora do Município" — gráfico único por município do prestador: Arujá
// (local) e cada município "de fora" aparecem como barras de uma mesma lista ranqueada,
// combinando `dados.local` + `dados.topFora` em `combinado` (fonte: /api/mobiliario/iss-
// fora-municipio, tabela tb_dsod_nfse — INDEPENDENTE do motor de lançado/arrecadado de
// guias usado no resto da aba ISS; não somar com "ISS lançado" do topo da tela). nm_mun é
// texto livre digitado na nota, então a classificação Arujá × fora é aproximada
// (normalizada) — ver aviso no card. `ano`/`mes` seguem a mesma convenção do PainelTributo.
// Drill: clique em qualquer barra (Arujá ou um município de fora) mostra o ranking dos
// prestadores daquele local (fonte /api/mobiliario/iss-fora-prestadores — trata "Arujá"
// como caso especial, já que não há uma grafia única de nm_mun pra filtrar por igualdade),
// mesmo padrão de drill do card IssSegmentoPrestador (segmento→prestador). O painel de
// Simulação · Previsão fica sempre visível abaixo, em qualquer nível — é uma projeção do
// total do card, não do item aberto no drill.
export default function IssForaMunicipio({ ano, mes }: { ano?: number; mes?: number }) {
  const [dados, setDados] = useState<Resp | null>(null)
  const [previsao, setPrevisao] = useState<PrevisaoResp | null>(null)
  const [cenario, setCenario] = useState<Cenario>('provavel')
  const [municipioSel, setMunicipioSel] = useState<string | null>(null)
  const [prestadoresFora, setPrestadoresFora] = useState<PrestadorForaItem[] | null>(null)
  const [buscaPrestador, setBuscaPrestador] = useState('')

  useEffect(() => {
    setDados(null)
    setMunicipioSel(null)
    setPrestadoresFora(null)
    setBuscaPrestador('')
    const qs = new URLSearchParams()
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/mobiliario/iss-fora-municipio${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setDados(d) }).catch(() => {})
  }, [ano, mes])

  useEffect(() => {
    fetch('/api/mobiliario/iss-fora-previsao').then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setPrevisao(d) }).catch(() => {})
  }, [])

  function abrirMunicipio(nome: string) {
    setMunicipioSel(nome)
    setPrestadoresFora(null)
    setBuscaPrestador('')
    const qs = new URLSearchParams({ top: '20', municipio: nome })
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    fetch(`/api/mobiliario/iss-fora-prestadores?${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.itens)) setPrestadoresFora(d.itens) }).catch(() => {})
  }

  function voltarMunicipios() {
    setMunicipioSel(null)
    setPrestadoresFora(null)
    setBuscaPrestador('')
  }

  if (!dados) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS Prestador de Fora do Município</span>
          <span style={reportBadge}>NFS-e</span>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 18, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const { local, fora, topFora } = dados
  const totalGrupos = local.iss + fora.iss
  const pctFora = totalGrupos ? (100 * fora.iss / totalGrupos) : 0
  const combinado = [
    { nome: LOCAL_LABEL, valor: local.iss, qt: local.qt, isLocal: true },
    ...topFora.map(m => ({ nome: m.nome, valor: m.iss, qt: m.qt, isLocal: false })),
  ].sort((a, b) => b.valor - a.valor)
  const maxCombo = Math.max(1, ...combinado.map(c => c.valor))
  let corForaIdx = 0

  const localPrev = previsao?.local[cenario] ?? 0
  const foraPrev = previsao?.fora[cenario] ?? 0
  const maxGrupoPrev = Math.max(1, localPrev, foraPrev)
  const totalPrev = localPrev + foraPrev
  const pctForaPrev = totalPrev ? (100 * foraPrev / totalPrev) : 0
  const foraBaseHist = previsao?.historico[previsao.historico.length - 1]?.fora ?? 0
  const cresForaPct = foraBaseHist ? (100 * (foraPrev - foraBaseHist) / foraBaseHist) : 0

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>
          {municipioSel ? `Prestadores · ${municipioSel}` : `ISS Prestador de Fora do Município${ano ? ` · ${ano}` : ''}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {municipioSel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '5px 10px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={buscaPrestador} onChange={e => setBuscaPrestador(e.target.value)} placeholder="Buscar nome ou CNPJ…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 150, fontFamily: 'inherit' }} />
              {buscaPrestador ? (
                <button onClick={() => setBuscaPrestador('')} title="Limpar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9098a8', display: 'flex', alignItems: 'center', padding: 0, flex: 'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              ) : null}
            </div>
          ) : null}
          {municipioSel ? <button onClick={voltarMunicipios} style={voltarBtn}>‹ Voltar aos municípios</button> : null}
          <span style={reportBadge}>NFS-e</span>
        </div>
      </div>

      {municipioSel ? (
        <>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            Empresas de &quot;{municipioSel}&quot; que mais indicaram ISS nas NFS-e{mes ? ` até o mês ${mes}` : ''}.
          </div>

          {!prestadoresFora ? (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
              ))}
            </div>
          ) : (() => {
            const total = prestadoresFora.reduce((s, t) => s + t.iss, 0)
            const maxVal = Math.max(1, ...prestadoresFora.map(t => t.iss))
            const q = buscaPrestador.trim().toLowerCase()
            const filtrados = q ? prestadoresFora.filter(t => t.nome.toLowerCase().includes(q) || t.cnpj.includes(q)) : prestadoresFora
            return (
              <>
                <div style={{ marginTop: 12, background: '#e8962e', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>Total do Top {prestadoresFora.length} em &quot;{municipioSel}&quot;</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{fmtAbrev(total)}</span>
                </div>

                <div style={{ marginTop: 14, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                  {!filtrados.length ? (
                    <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>Nenhum prestador encontrado para a busca.</div>
                  ) : filtrados.map((t, i) => (
                    <div key={t.cnpj}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {i + 1}. {t.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>{t.cnpj ? `· ${t.cnpj}` : ''}</span>
                        </span>
                        <span style={{ color: '#c07a2e', fontWeight: 700, flex: 'none' }}>{fmtAbrev(t.iss)}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#aeb6c6', marginBottom: 4 }}>{t.qt.toLocaleString('pt-BR')} nota{t.qt === 1 ? '' : 's'}</div>
                      <div style={{ height: 12, borderRadius: 6, background: '#eef1f7', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(3, 100 * t.iss / maxVal).toFixed(1)}%`, borderRadius: 6, background: '#e8962e' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            Imposto indicado nas NFS-e por município do prestador{mes ? ` até o mês ${mes}` : ''} — fonte independente do ISS lançado (guias) do topo da tela, não some com ele. {pctFora.toFixed(1).replace('.', ',')}% vem de prestadores de fora do município. Clique numa barra para ver os prestadores daquele município.
          </div>
          <div style={{ fontSize: 10, color: '#c07a2e', background: '#fdf1e2', borderRadius: 8, padding: '6px 10px', marginTop: 8, lineHeight: 1.4 }}>
            Município do prestador é texto livre na nota fiscal (sujeito a grafia/digitação). A classificação Arujá × fora é aproximada (normalizada); um pequeno resíduo de erros de digitação de &quot;Arujá&quot; pode aparecer como fora do município.
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {combinado.map(c => {
              const w = (c.valor / maxCombo) * 100
              const cor = c.isLocal ? '#283e93' : FORA_CORES[corForaIdx++ % FORA_CORES.length]
              return (
                <div key={c.nome} onClick={() => abrirMunicipio(c.nome)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256', fontWeight: c.isLocal ? 700 : 400 }}>{c.nome}{c.isLocal ? ' (local)' : ''}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(c.valor)}</span>
                  </div>
                  <div style={{ height: 13, borderRadius: 6, background: '#eef1f7', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(3, w).toFixed(1)}%`, background: cor, borderRadius: 6 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Painel de simulação — previsão para o próximo exercício, 3 níveis. Fica sempre
          visível (não é substituído pelo drill de prestadores), já que é uma projeção do
          total do card, independente do nível de detalhe aberto acima. */}
      <div style={{ marginTop: 20, borderTop: '1px solid #eef1f7', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Simulação · Previsão {previsao ? previsao.anoPrevisao : ''}</span>
          <div style={{ display: 'flex', background: '#f4f7fc', borderRadius: 12, padding: 3, gap: 2 }}>
            {CENARIOS.map(c => (
              <button key={c.key} onClick={() => setCenario(c.key)}
                style={{
                  border: 'none', borderRadius: 9, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: cenario === c.key ? '#283e93' : 'transparent',
                  color: cenario === c.key ? '#fff' : '#5b6477',
                  transition: 'background .15s, color .15s',
                }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {!previsao ? (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1].map(i => <div key={i} style={{ height: 34, borderRadius: 8, background: '#eef1f7' }} />)}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 4 }}>
              Regressão linear sobre {previsao.historico.length} exercícios completos ({previsao.historico[0].ano}–{previsao.anoBase}), projetando {previsao.anoPrevisao}. Cenários aplicam 50% (conservador) e 150% (agressivo) do crescimento projetado sobre a base de {previsao.anoBase} — não é uma garantia, é uma estimativa para planejamento.
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ height: 30, width: `${Math.max(10, 86 * localPrev / maxGrupoPrev).toFixed(1)}%`, borderRadius: 8, background: 'linear-gradient(90deg,#5870c4 0%,#8094d6 100%)', flex: 'none' }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#283e93' }}>{fmtAbrev(localPrev)}</div>
                  <div style={{ fontSize: 9.5, color: '#aeb6c6' }}>Prestadores de Arujá (projetado)</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ height: 30, width: `${Math.max(10, 86 * foraPrev / maxGrupoPrev).toFixed(1)}%`, borderRadius: 8, background: 'linear-gradient(90deg,#e8962e 0%,#f3c07c 100%)', flex: 'none' }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#c07a2e' }}>{fmtAbrev(foraPrev)}</div>
                  <div style={{ fontSize: 9.5, color: '#aeb6c6' }}>Prestadores de fora do município (projetado) · {pctForaPrev.toFixed(1).replace('.', ',')}% do total · {cresForaPct >= 0 ? '+' : ''}{cresForaPct.toFixed(1).replace('.', ',')}% vs {previsao.anoBase}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
