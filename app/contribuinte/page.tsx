'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PainelContribuinte, { type FiltrosContribuinteUI } from './PainelContribuinte'
import TopNav from '../_components/TopNav'
import { PESSOAS, type PessoaOpt } from '@/lib/contribuinte-filtros'

export default function ContribuintePage() {
  const router = useRouter()
  const [saudacao, setSaudacao] = useState('Bom dia')

  const [opts, setOpts] = useState<{ anos: number[]; pessoas: PessoaOpt[] }>({ anos: [], pessoas: PESSOAS })
  const [rAno, setRAno] = useState<number | ''>('')
  const [rPessoa, setRPessoa] = useState<'' | 'F' | 'J'>('')

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  useEffect(() => {
    fetch('/api/contribuinte/filtros')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.error) {
          setOpts({ anos: d.anos ?? [], pessoas: d.pessoas ?? PESSOAS })
          if (d.anos?.length) setRAno(d.anos[0])
        }
      })
      .catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const navTab: React.CSSProperties = { padding: '9px 14px', borderRadius: 24, color: '#5b6477', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }
  const navAtivo: React.CSSProperties = { padding: '9px 16px', borderRadius: 24, background: '#283e93', color: '#ffffff', fontSize: 13.5, fontWeight: 500, boxShadow: '0 6px 14px rgba(40,62,147,0.35)', whiteSpace: 'nowrap' }
  const toolPill: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 22, padding: '9px 16px', fontSize: 13, fontWeight: 500, color: '#3a4256', boxShadow: '0 4px 12px rgba(40,80,180,0.04)' }
  const chevron = (cor: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${cor}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`
  const selectPill: React.CSSProperties = {
    borderRadius: 22, padding: '9px 30px 9px 14px', fontSize: 13, fontWeight: 600, color: '#283e93',
    backgroundColor: '#fff', border: '1.5px solid #e3e9f5', boxShadow: '0 4px 12px rgba(40,80,180,0.04)',
    fontFamily: 'inherit', cursor: 'pointer', maxWidth: 220,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center', backgroundImage: chevron('%23283e93'),
  }

  const filtros: FiltrosContribuinteUI = { ano: rAno, pessoa: rPessoa }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV (abas filtradas por perfil) ===== */}
        <TopNav ativo="contribuinte" />

        {/* ===== GREETING ROW ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>Roberta!</span>
          </h1>
        </div>

        {/* ===== TOOLBAR (filtros) ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 0', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <select aria-label="Exercício" value={rAno} onChange={e => setRAno(Number(e.target.value))} style={selectPill}>
              {opts.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
            </select>
            <select aria-label="Tipo de pessoa" value={rPessoa} onChange={e => setRPessoa(e.target.value as '' | 'F' | 'J')} style={selectPill}>
              <option value="">Pessoa: Todas</option>
              {opts.pessoas.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* ===== PAINEL ===== */}
        <PainelContribuinte filtros={filtros} />

      </div>
    </div>
  )
}
