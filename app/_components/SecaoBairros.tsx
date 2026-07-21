'use client'

import { useState, useEffect } from 'react'
import LoadingOverlay from './LoadingOverlay'

// Seção "Análise por bairro/rua" reutilizável (TCA, ISSCC…). Consome um endpoint que
// recebe ?ano&metrica&bairro e devolve { bairros: [{ nome, imoveis, valor }] }.
// Métrica alterna o tipo de lançamento; clicar num bairro detalha por rua (ds_endereco).

const fmtAbrev = (v: number) => {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

interface Bairro { nome: string; imoveis: number; valor: number }
type Metrica = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia' | 'isento' | 'suspenso'
const METRICAS: { id: Metrica; label: string; cor: string }[] = [
  { id: 'lancado', label: 'Lançado', cor: '#283e93' },
  { id: 'arrecadado', label: 'Arrecadado', cor: '#1fa463' },
  { id: 'emAberto', label: 'Em aberto', cor: '#e8962e' },
  { id: 'inadimplencia', label: 'Inadimplência', cor: '#d64545' },
  { id: 'isento', label: 'Isento', cor: '#8094d6' },
  { id: 'suspenso', label: 'Suspenso', cor: '#5b6477' },
]

async function fetchJson(url: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) { const d = await r.json(); if (d && !d.error) return d } } catch { /* retry */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 1200 * (i + 1)))
  }
  return null
}

export default function SecaoBairros({ endpoint, ano, titulo = 'Análise por Bairro' }: { endpoint: string; ano: number | ''; titulo?: string }) {
  const [metrica, setMetrica] = useState<Metrica>('lancado')
  const [bairroSel, setBairroSel] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState<'valor' | 'imoveis'>('valor')
  const [bairros, setBairros] = useState<Bairro[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)
  const [recarregar, setRecarregar] = useState(0)

  useEffect(() => { setBairroSel(null) }, [ano])

  useEffect(() => {
    if (!ano) return
    let vivo = true
    setCarregando(true); setErro(false)
    const p = new URLSearchParams({ ano: String(ano), metrica })
    if (bairroSel) p.set('bairro', bairroSel)
    fetchJson(`${endpoint}?${p}`)
      .then(d => { if (!vivo) return; if (d) setBairros(d.bairros ?? []); else setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [endpoint, ano, metrica, bairroSel, recarregar])

  const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
  const corM = METRICAS.find(m => m.id === metrica)!.cor
  const metLabel = METRICAS.find(m => m.id === metrica)!.label
  const q = busca.trim().toLowerCase()
  const filtrados = (q ? bairros.filter(b => b.nome.toLowerCase().includes(q)) : bairros)
  const lista = [...filtrados].sort((a, b) => ordenar === 'imoveis' ? b.imoveis - a.imoveis : Math.abs(b.valor) - Math.abs(a.valor))
  const mx = Math.max(1, ...lista.map(b => Math.abs(b.valor)))

  return (
    <div style={{ ...card, marginTop: 18, position: 'relative' }}>
      {carregando ? <LoadingOverlay label="Agregando por bairro…" /> : null}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>{bairroSel ? `Ruas de ${bairroSel}` : titulo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3, flexWrap: 'wrap' }}>
            {METRICAS.map(m => (
              <button key={m.id} onClick={() => setMetrica(m.id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 16, padding: '5px 10px', fontSize: 11, fontWeight: 600, background: metrica === m.id ? '#283e93' : 'transparent', color: metrica === m.id ? '#fff' : '#5b6477' }}>{m.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#9098a8' }}>
            <span>Ordenar:</span>
            <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3 }}>
              {([['valor', 'Valor'], ['imoveis', 'Qtd. imóveis']] as const).map(([id, lbl]) => (
                <button key={id} onClick={() => setOrdenar(id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 16, padding: '5px 9px', fontSize: 11, fontWeight: 600, background: ordenar === id ? '#283e93' : 'transparent', color: ordenar === id ? '#fff' : '#5b6477' }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '5px 10px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={bairroSel ? 'Buscar rua…' : 'Buscar bairro…'} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 130, fontFamily: 'inherit' }} />
          </div>
          {bairroSel ? <button onClick={() => setBairroSel(null)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>‹ Voltar aos bairros</button> : null}
        </div>
      </div>
      {!lista.length ? (
        erro ? (
          <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>
            Não foi possível carregar (consulta pesada / instabilidade).{' '}
            <button onClick={() => setRecarregar(n => n + 1)} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontSize: 11, marginLeft: 6 }}>Recarregar</button>
          </div>
        ) : <div style={{ fontSize: 12, color: '#9098a8', padding: '20px 0', textAlign: 'center' }}>{q ? 'Nenhum resultado para a busca.' : 'Sem dados para a métrica selecionada.'}</div>
      ) : (
        <div style={{ marginTop: 14, maxHeight: 430, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
          {lista.map((b, i) => {
            const w = Math.max(2, 100 * Math.abs(b.valor) / mx)
            const podeDrill = !bairroSel
            return (
              <div key={i} onClick={() => { if (podeDrill) setBairroSel(b.nome) }} style={{ cursor: podeDrill ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <span title={b.nome} style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>· {b.imoveis.toLocaleString('pt-BR')} im. ({metLabel})</span></span>
                  <span style={{ color: corM, fontWeight: 700, flex: 'none' }}>{fmtAbrev(b.valor)}</span>
                </div>
                <div style={{ height: 15, borderRadius: 8, background: '#eef1f7', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${w.toFixed(1)}%`, borderRadius: 8, background: corM }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!bairroSel ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique num bairro para detalhar por rua</div> : null}
    </div>
  )
}
