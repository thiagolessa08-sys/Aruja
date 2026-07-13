'use client'

import { useState, useEffect } from 'react'
import PainelReceita, { type FiltrosReceita } from './PainelReceita'
import PainelDespesa, { type FiltrosDespesa } from './PainelDespesa'
import ImpostoTaxaSelect from '../_components/ImpostoTaxaSelect'
import TopNav from '../_components/TopNav'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const INDICADORES = ['Dotação Inicial', 'Dotação Atualizada', 'Empenhado', 'Liquidado', 'Pago']

export default function DashboardPage() {
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('receita')
  const [saudacao, setSaudacao] = useState('Bom dia')

  // Opções e estado dos filtros (painel de Despesa)
  const [opts, setOpts] = useState<{ anos: number[]; secretarias: { uo: string; nome: string }[] }>({ anos: [], secretarias: [] })
  const [fAno, setFAno] = useState<number | ''>('')
  const [fMes, setFMes] = useState('')
  const [fSec, setFSec] = useState('')
  const [fInd, setFInd] = useState('Liquidado')

  // Filtros do painel de Receita
  const [optsRec, setOptsRec] = useState<{ anos: number[]; impostosTaxas: { alinea: string; naturezas: string[] }[] }>({ anos: [], impostosTaxas: [] })
  const [rAno, setRAno] = useState<number | ''>('')
  const [rMes, setRMes] = useState('')
  // filtro "Impostos e Taxas": valor com prefixo — 'A::<alinea>' (nível 1) ou 'N::<natureza>' (nível 2)
  const [rIT, setRIT] = useState('')

  // Data da última carga do BI do orçamento (mesma para receita e despesa)
  const [atualizacao, setAtualizacao] = useState<string | null>(null)

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
    const v = new URLSearchParams(window.location.search).get('v')
    if (v === 'despesa' || v === 'receita') setTipo(v)
  }, [])

  useEffect(() => {
    fetch('/api/despesa/secretarias')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.error) {
          setOpts({ anos: d.anos ?? [], secretarias: d.secretarias ?? [] })
          if (d.anos?.length) setFAno(d.anos[0]) // ano mais recente
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/orcamento/filtros')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.error) {
          setOptsRec({ anos: d.anos ?? [], impostosTaxas: d.impostosTaxas ?? [] })
          if (d.anos?.length) setRAno(d.anos[0])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/orcamento/atualizacao')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.dataAtualizacao) setAtualizacao(d.dataAtualizacao) })
      .catch(() => {})
  }, [])

  // 'YYYY-MM-DD' → 'DD/MM/YYYY'
  const atualizacaoBR = atualizacao ? atualizacao.split('-').reverse().join('/') : null

  function selecionar(op: 'receita' | 'despesa') {
    setTipo(op)
    window.history.replaceState(null, '', `?v=${op}`)
  }

  const toolPill: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }
  const chevron = (cor: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${cor}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`
  const selectBase: React.CSSProperties = {
    borderRadius: 22, padding: '9px 30px 9px 14px', fontSize: 13, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(40,80,180,0.04)', fontFamily: 'inherit', cursor: 'pointer', maxWidth: 220,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center',
  }
  const selectPill: React.CSSProperties = { ...selectBase, backgroundColor: '#fff', color: '#283e93', border: '1.5px solid #e3e9f5', backgroundImage: chevron('%23283e93') }

  const filtros: FiltrosDespesa = { ano: fAno, mes: fMes, secretaria: fSec, indicador: fInd }
  const itAlinea = rIT.startsWith('A::') ? rIT.slice(3) : ''
  const itNatureza = rIT.startsWith('N::') ? rIT.slice(3) : ''
  const filtrosReceita: FiltrosReceita = { ano: rAno, mes: rMes, alinea: itAlinea, natureza: itNatureza }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV (abas filtradas por perfil) ===== */}
        <TopNav ativo="orcamento" />

        {/* ===== GREETING ROW ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>Roberta!</span>
          </h1>
          <div role="radiogroup" aria-label="Tipo" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            {(['receita', 'despesa'] as const).map(op => {
              const ativo = tipo === op
              return (
                <button
                  key={op}
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => selecionar(op)}
                  style={{
                    padding: '10px 26px', borderRadius: 24, border: 'none', cursor: 'pointer',
                    fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontSize: 14,
                    fontWeight: ativo ? 600 : 500,
                    background: ativo ? '#283e93' : 'transparent', color: ativo ? '#fff' : '#5b6477',
                    boxShadow: ativo ? '0 6px 14px rgba(40,62,147,0.35)' : 'none', transition: 'background .15s, color .15s',
                  }}
                >
                  {op === 'receita' ? 'Receita' : 'Despesa'}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== TOOLBAR ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 0', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {tipo === 'despesa' ? (
              <>
                <select aria-label="Ano" value={fAno} onChange={e => setFAno(Number(e.target.value))} style={selectPill}>
                  {opts.anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select aria-label="Mês" value={fMes} onChange={e => setFMes(e.target.value)} style={selectPill}>
                  <option value="">Mês: Todos</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select aria-label="Secretaria" value={fSec} onChange={e => setFSec(e.target.value)} style={selectPill}>
                  <option value="">Secretaria: Todas</option>
                  {opts.secretarias.map(s => <option key={s.uo} value={s.uo}>{s.nome}</option>)}
                </select>
                <select aria-label="Indicador" value={fInd} onChange={e => setFInd(e.target.value)} style={selectPill}>
                  {INDICADORES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </>
            ) : (
              <>
                <select aria-label="Ano" value={rAno} onChange={e => setRAno(Number(e.target.value))} style={selectPill}>
                  {optsRec.anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select aria-label="Mês" value={rMes} onChange={e => setRMes(e.target.value)} style={selectPill}>
                  <option value="">Mês: Todos</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <ImpostoTaxaSelect grupos={optsRec.impostosTaxas} value={rIT} onChange={setRIT} style={selectPill} />
              </>
            )}
          </div>
          {atualizacaoBR ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9098a8', fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
              Atualizado em {atualizacaoBR}
            </span>
          ) : null}
        </div>

        {/* ===== PAINEL (Receita / Despesa) ===== */}
        {tipo === 'receita' ? <PainelReceita filtros={filtrosReceita} /> : <PainelDespesa filtros={filtros} />}

      </div>
    </div>
  )
}
