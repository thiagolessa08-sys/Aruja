'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PainelImobiliario, { type FiltrosImobiliario } from './PainelImobiliario'
import TopNav from '../_components/TopNav'
import PainelItbi, { type FiltrosItbiUI } from './PainelItbi'
import PainelTributo from '../tributo/PainelTributo'
import { FAIXAS_VENAL } from '@/lib/imobiliario-filtros'

type Tributo = 'iptu' | 'itbi' | 'isscc'
interface NaturezaOpt { id: string; label: string }

export default function ImobiliarioPage() {
  const router = useRouter()
  const [saudacao, setSaudacao] = useState('Bom dia')
  const [tributo, setTributo] = useState<Tributo>('iptu')

  // IPTU
  const [optsIptu, setOptsIptu] = useState<{ anos: number[] }>({ anos: [] })
  const [pAno, setPAno] = useState<number | ''>('')
  const [pFaixa, setPFaixa] = useState<number | ''>('')

  // ITBI
  const [optsItbi, setOptsItbi] = useState<{ anos: number[]; naturezas: NaturezaOpt[] }>({ anos: [], naturezas: [] })
  const [iAno, setIAno] = useState<number | ''>('')
  const [iNat, setINat] = useState<string>('')

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
    const v = new URLSearchParams(window.location.search).get('v')
    if (v === 'iptu' || v === 'itbi' || v === 'isscc') setTributo(v)
  }, [])

  useEffect(() => {
    fetch('/api/imobiliario/filtros').then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) { setOptsIptu({ anos: d.anos ?? [] }); if (d.anos?.length) setPAno(d.anos[0]) }
    }).catch(() => {})
    fetch('/api/itbi/filtros').then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) { setOptsItbi({ anos: d.anos ?? [], naturezas: d.naturezas ?? [] }); if (d.anos?.length) setIAno(d.anos[0]) }
    }).catch(() => {})
  }, [])

  function selecionar(op: Tributo) {
    setTributo(op)
    window.history.replaceState(null, '', `?v=${op}`)
  }

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
    fontFamily: 'inherit', cursor: 'pointer', maxWidth: 240,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center', backgroundImage: chevron('%23283e93'),
  }

  const filtrosIptu: FiltrosImobiliario = { ano: pAno, faixa: pFaixa }
  const filtrosItbi: FiltrosItbiUI = { ano: iAno, natureza: iNat }

  const TRIBUTOS: { id: Tributo; label: string }[] = [
    { id: 'iptu', label: 'IPTU' },
    { id: 'itbi', label: 'ITBI' },
    { id: 'isscc', label: 'ISSCC' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV (abas filtradas por perfil) ===== */}
        <TopNav ativo="imobiliario" />

        {/* ===== GREETING + TOGGLE ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>Roberta!</span>
          </h1>
          <div role="radiogroup" aria-label="Tributo" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            {TRIBUTOS.map(t => {
              const ativo = tributo === t.id
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => selecionar(t.id)}
                  style={{
                    padding: '10px 26px', borderRadius: 24, border: 'none', cursor: 'pointer',
                    fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontSize: 14,
                    fontWeight: ativo ? 600 : 500,
                    background: ativo ? '#283e93' : 'transparent', color: ativo ? '#fff' : '#5b6477',
                    boxShadow: ativo ? '0 6px 14px rgba(40,62,147,0.35)' : 'none', transition: 'background .15s, color .15s',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== TOOLBAR (filtros por tributo) ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 0', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {tributo === 'iptu' && (
              <>
                <select aria-label="Exercício" value={pAno} onChange={e => setPAno(Number(e.target.value))} style={selectPill}>
                  {optsIptu.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
                </select>
                <select aria-label="Faixa de Valor Venal" value={pFaixa} onChange={e => setPFaixa(e.target.value ? Number(e.target.value) : '')} style={selectPill}>
                  <option value="">Faixa: Todas</option>
                  {FAIXAS_VENAL.map(fx => <option key={fx.id} value={fx.id}>{fx.label}</option>)}
                </select>
              </>
            )}
            {tributo === 'itbi' && (
              <>
                <select aria-label="Exercício" value={iAno} onChange={e => setIAno(Number(e.target.value))} style={selectPill}>
                  {optsItbi.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
                </select>
                <select aria-label="Natureza da transação" value={iNat} onChange={e => setINat(e.target.value)} style={selectPill}>
                  <option value="">Natureza: Todas</option>
                  {optsItbi.naturezas.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </>
            )}
            {tributo === 'isscc' && (
              <div style={{ ...selectPill, cursor: 'default', color: '#5b6477', maxWidth: 'none' }}>ISS Construção Civil · todos os exercícios</div>
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

        {/* ===== PAINEL ===== */}
        {tributo === 'iptu' && <PainelImobiliario filtros={filtrosIptu} />}
        {tributo === 'itbi' && <PainelItbi filtros={filtrosItbi} />}
        {tributo === 'isscc' && <PainelTributo grupo="isscc" titulo="ISS Construção Civil" />}

      </div>
    </div>
  )
}
