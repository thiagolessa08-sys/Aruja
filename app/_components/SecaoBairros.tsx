'use client'

import { useState, useEffect } from 'react'
import LoadingOverlay from './LoadingOverlay'
import { fmtAbrev } from '@/lib/fmt-grafico'

// Seção "Análise por bairro/rua" reutilizável (TCA, ISSCC…). Consome um endpoint que
// recebe ?ano&metrica&bairro e devolve { bairros: [{ nome, imoveis, valor }] }.
// Métrica alterna o tipo de lançamento; clicar num bairro detalha por rua (ds_endereco).

interface Bairro { nome: string; imoveis: number; valor: number; cd?: number; inscricao?: string; numero?: string }
type Metrica = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia' | 'isento' | 'suspenso' | 'naoLancados'
const METRICAS: { id: Metrica; label: string; cor: string }[] = [
  { id: 'lancado', label: 'Lançado', cor: '#283e93' },
  { id: 'arrecadado', label: 'Arrecadado', cor: '#1fa463' },
  { id: 'emAberto', label: 'Em aberto', cor: '#e8962e' },
  { id: 'inadimplencia', label: 'Inadimplência', cor: '#d64545' },
  { id: 'isento', label: 'Isento', cor: '#8094d6' },
  { id: 'suspenso', label: 'Suspenso', cor: '#5b6477' },
  { id: 'naoLancados', label: 'Não Lançados', cor: '#9098a8' },
]

async function fetchJson(url: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) { const d = await r.json(); if (d && !d.error) return d } } catch { /* retry */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 1200 * (i + 1)))
  }
  return null
}

export default function SecaoBairros({ endpoint, ano, titulo = 'Análise por Bairro', mostrarNaoLancados = false, permitirDrillImovel = false, onSelecao }: { endpoint: string; ano: number | ''; titulo?: string; mostrarNaoLancados?: boolean; permitirDrillImovel?: boolean; onSelecao?: (bairro: string | null, rua: string | null, imovel: number | null) => void }) {
  const metricasVisiveis = mostrarNaoLancados ? METRICAS : METRICAS.filter(m => m.id !== 'naoLancados')
  const [metrica, setMetrica] = useState<Metrica>('lancado')
  const [bairroSel, setBairroSel] = useState<string | null>(null)
  const [ruaSel, setRuaSel] = useState<string | null>(null)
  const [imovelSel, setImovelSel] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState<'valor' | 'imoveis'>('valor')
  const [bairros, setBairros] = useState<Bairro[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)
  const [recarregar, setRecarregar] = useState(0)
  const nivel: 'bairro' | 'rua' | 'imovel' = ruaSel ? 'imovel' : bairroSel ? 'rua' : 'bairro'

  useEffect(() => { setBairroSel(null); setRuaSel(null); setImovelSel(null) }, [ano])
  // Notifica o pai (ex.: PainelTca) da seleção atual, para interação com outros gráficos
  // da tela. Não inclui `onSelecao` nas deps de propósito: só deve disparar quando a
  // seleção muda, não quando o pai recria a função.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onSelecao?.(bairroSel, ruaSel, imovelSel) }, [bairroSel, ruaSel, imovelSel])
  function selecionarBairro(nome: string) { setBairroSel(nome); setRuaSel(null); setImovelSel(null) }
  function selecionarRua(nome: string) { setRuaSel(nome); setImovelSel(null) }
  function limparBairro() { setBairroSel(null); setRuaSel(null); setImovelSel(null) }

  useEffect(() => {
    if (!ano) return
    let vivo = true
    setCarregando(true); setErro(false)
    const p = new URLSearchParams({ ano: String(ano), metrica })
    if (bairroSel) p.set('bairro', bairroSel)
    if (permitirDrillImovel && bairroSel && ruaSel) p.set('rua', ruaSel)
    fetchJson(`${endpoint}?${p}`)
      .then(d => { if (!vivo) return; if (d) setBairros(d.bairros ?? []); else setErro(true) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [endpoint, ano, metrica, bairroSel, ruaSel, permitirDrillImovel, recarregar])

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
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2a44' }}>
          {nivel === 'imovel' ? `Imóveis · ${ruaSel}` : nivel === 'rua' ? `Ruas de ${bairroSel}` : titulo}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 3, background: '#f4f7fc', borderRadius: 20, padding: 3, flexWrap: 'wrap' }}>
            {metricasVisiveis.map(m => (
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
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={nivel === 'imovel' ? 'Buscar imóvel…' : nivel === 'rua' ? 'Buscar rua…' : 'Buscar bairro…'} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 130, fontFamily: 'inherit' }} />
          </div>
          {permitirDrillImovel && ruaSel ? <button onClick={() => { setRuaSel(null); setImovelSel(null) }} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>‹ Voltar às ruas</button> : null}
          {bairroSel ? <button onClick={limparBairro} style={{ border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>‹ Voltar aos bairros</button> : null}
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
            const podeClicar = nivel === 'bairro' || (permitirDrillImovel && (nivel === 'rua' || (nivel === 'imovel' && !!b.cd)))
            const selecionado = nivel === 'imovel' && b.cd != null && b.cd === imovelSel
            const detalheImovel = [b.inscricao ? `Insc. ${b.inscricao}` : '', b.numero ? `Nº ${b.numero}` : ''].filter(Boolean).join(' · ')
            const acao = () => {
              if (nivel === 'bairro') selecionarBairro(b.nome)
              else if (nivel === 'rua' && permitirDrillImovel) selecionarRua(b.nome)
              else if (nivel === 'imovel' && permitirDrillImovel && b.cd != null) setImovelSel(sel => sel === b.cd ? null : b.cd!)
            }
            return (
              <div key={i} onClick={podeClicar ? acao : undefined}
                style={{ cursor: podeClicar ? 'pointer' : 'default', borderRadius: 10, padding: selecionado ? '6px 8px' : 0, background: selecionado ? '#eef1fb' : 'transparent', border: selecionado ? '1px solid #cdd5ef' : '1px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <span title={b.nome} style={{ color: selecionado ? '#283e93' : '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selecionado ? '✓ ' : ''}{b.nome} <span style={{ color: '#9098a8', fontWeight: 500 }}>· {nivel === 'imovel' ? (detalheImovel || `${b.imoveis.toLocaleString('pt-BR')} im. (${metLabel})`) : `${b.imoveis.toLocaleString('pt-BR')} im. (${metLabel})`}</span>
                  </span>
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
      {nivel === 'bairro' ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique num bairro para detalhar por rua</div>
        : nivel === 'rua' ? (permitirDrillImovel ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique numa rua para identificar os imóveis</div> : null)
        : (permitirDrillImovel ? <div style={{ fontSize: 10.5, color: '#aeb6c6', marginTop: 10 }}>Clique num imóvel para filtrar a Evolução por ele (clique de novo para remover)</div> : null)}
    </div>
  )
}
