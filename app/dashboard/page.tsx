'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PainelReceita, { type FiltrosReceita } from './PainelReceita'
import PainelDespesa, { type FiltrosDespesa } from './PainelDespesa'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const INDICADORES = ['Dotação Inicial', 'Dotação Atualizada', 'Empenhado', 'Liquidado', 'Pago']

export default function DashboardPage() {
  const router = useRouter()
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('receita')
  const [saudacao, setSaudacao] = useState('Bom dia')

  // Opções e estado dos filtros (painel de Despesa)
  const [opts, setOpts] = useState<{ anos: number[]; secretarias: { sk: number; nome: string }[] }>({ anos: [], secretarias: [] })
  const [fAno, setFAno] = useState<number | ''>('')
  const [fMes, setFMes] = useState('')
  const [fSec, setFSec] = useState('')
  const [fInd, setFInd] = useState('Liquidado')

  // Filtros do painel de Receita
  const [optsRec, setOptsRec] = useState<{ anos: number[]; especies: string[] }>({ anos: [], especies: [] })
  const [rAno, setRAno] = useState<number | ''>('')
  const [rMes, setRMes] = useState('')
  const [rEsp, setREsp] = useState('')

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
          setOptsRec({ anos: d.anos ?? [], especies: d.especies ?? [] })
          if (d.anos?.length) setRAno(d.anos[0])
        }
      })
      .catch(() => {})
  }, [])

  function selecionar(op: 'receita' | 'despesa') {
    setTipo(op)
    window.history.replaceState(null, '', `?v=${op}`)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const navTab: React.CSSProperties = { padding: '9px 18px', borderRadius: 24, color: '#5b6477', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }
  const toolPill: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }
  const chevron = (cor: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${cor}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`
  const selectBase: React.CSSProperties = {
    borderRadius: 22, padding: '9px 30px 9px 14px', fontSize: 13, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(40,80,180,0.04)', fontFamily: 'inherit', cursor: 'pointer', maxWidth: 220,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center',
  }
  const selectPill: React.CSSProperties = { ...selectBase, backgroundColor: '#fff', color: '#283e93', border: '1.5px solid #e3e9f5', backgroundImage: chevron('%23283e93') }
  const selectPillAzul: React.CSSProperties = { ...selectBase, backgroundColor: '#283e93', color: '#fff', border: 'none', backgroundImage: chevron('%23ffffff') }

  const filtros: FiltrosDespesa = { ano: fAno, mes: fMes, secretaria: fSec, indicador: fInd }
  const filtrosReceita: FiltrosReceita = { ano: rAno, mes: rMes, especie: rEsp }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', borderRadius: 20, padding: '12px 18px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo-aruja.png" alt="Prefeitura Municipal de Arujá" style={{ height: 46, width: 'auto', display: 'block' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            <span style={{ padding: '9px 20px', borderRadius: 24, background: '#283e93', color: '#ffffff', fontSize: 14, fontWeight: 500, boxShadow: '0 6px 14px rgba(40,62,147,0.35)' }}>Orçamento</span>
            <span style={navTab}>Contribuinte</span>
            <span style={navTab}>Imobiliário</span>
            <span style={navTab}>Mobiliário</span>
            <span style={navTab}>Arrecada Mais</span>
            <Link href="/chat" style={navTab}>Chat</Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/catalogo" title="Catálogo de dados" style={{ width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></svg>
            </Link>
            <div style={{ position: 'relative', width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: '#283e93', border: '2px solid #e9edf8' }}></span>
            </div>
            <button onClick={handleLogout} title="Sair" style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid #ffffff', boxShadow: '0 0 0 1px #e3e9f5', padding: 0, cursor: 'pointer', background: 'transparent' }}>
              <svg viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" fill="#cdd9ee" /><circle cx="20" cy="15" r="8" fill="#9fb2d4" /><path d="M5 40 a15 13 0 0 1 30 0" fill="#9fb2d4" /></svg>
            </button>
          </div>
        </div>

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
                  {opts.secretarias.map(s => <option key={s.sk} value={s.sk}>{s.nome}</option>)}
                </select>
                <select aria-label="Indicador" value={fInd} onChange={e => setFInd(e.target.value)} style={selectPillAzul}>
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
                <select aria-label="Espécie" value={rEsp} onChange={e => setREsp(e.target.value)} style={selectPillAzul}>
                  <option value="">Espécie: Todas</option>
                  {optsRec.especies.map(esp => <option key={esp} value={esp}>{esp}</option>)}
                </select>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a4256" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </div>
            <div style={toolPill}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg> Support
            </div>
            <div style={toolPill}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg> Content Layout
            </div>
          </div>
        </div>

        {/* ===== PAINEL (Receita / Despesa) ===== */}
        {tipo === 'receita' ? <PainelReceita filtros={filtrosReceita} /> : <PainelDespesa filtros={filtros} />}

      </div>
    </div>
  )
}
