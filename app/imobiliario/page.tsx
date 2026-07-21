'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PainelIptu from './PainelIptu'
import TopNav from '../_components/TopNav'
import PainelItbi, { type FiltrosItbiUI } from './PainelItbi'
import PainelTca from './PainelTca'
import PainelIsscc from './PainelIsscc'

type Tributo = 'iptu' | 'itbi' | 'isscc' | 'tca'
interface NaturezaOpt { id: string; label: string }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function ImobiliarioPage() {
  const router = useRouter()
  const [saudacao, setSaudacao] = useState('Bom dia')
  const [tributo, setTributo] = useState<Tributo>('iptu')

  // IPTU
  const [optsIptu, setOptsIptu] = useState<{ anos: number[] }>({ anos: [] })
  const [pAno, setPAno] = useState<number | ''>('')
  const [pMes, setPMes] = useState<number | ''>('') // mês selecionado (acumulado); '' = ano todo

  // ITBI
  const [optsItbi, setOptsItbi] = useState<{ anos: number[]; naturezas: NaturezaOpt[] }>({ anos: [], naturezas: [] })
  const [iAno, setIAno] = useState<number | ''>('')
  const [iNat, setINat] = useState<string>('')

  // TCA
  const [optsTca, setOptsTca] = useState<{ anos: number[] }>({ anos: [] })
  const [tAno, setTAno] = useState<number | ''>('')

  // ISSCC
  const [optsIsscc, setOptsIsscc] = useState<{ anos: number[] }>({ anos: [] })
  const [sAno, setSAno] = useState<number | ''>('')

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
    const v = new URLSearchParams(window.location.search).get('v')
    if (v === 'iptu' || v === 'itbi' || v === 'isscc' || v === 'tca') setTributo(v)
  }, [])

  useEffect(() => {
    fetch('/api/imobiliario/filtros').then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) {
        const anos = (d.anos ?? []).filter((a: number) => a >= 2020) // IPTU a partir de 2020
        setOptsIptu({ anos }); if (anos.length) setPAno(anos[0])
      }
    }).catch(() => {})
    fetch('/api/itbi/filtros').then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) { setOptsItbi({ anos: d.anos ?? [], naturezas: d.naturezas ?? [] }); if (d.anos?.length) setIAno(d.anos[0]) }
    }).catch(() => {})
    fetch('/api/tca/filtros').then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) { setOptsTca({ anos: d.anos ?? [] }); if (d.anos?.length) setTAno(d.anos[0]) }
    }).catch(() => {})
    fetch('/api/isscc/filtros').then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) { setOptsIsscc({ anos: d.anos ?? [] }); if (d.anos?.length) setSAno(d.anos[0]) }
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

  const filtrosItbi: FiltrosItbiUI = { ano: iAno, natureza: iNat }

  const TRIBUTOS: { id: Tributo; label: string }[] = [
    { id: 'iptu', label: 'IPTU' },
    { id: 'itbi', label: 'ITBI' },
    { id: 'isscc', label: 'ISSCC' },
    { id: 'tca', label: 'TCA' },
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
                <select aria-label="Mês" value={pMes} onChange={e => setPMes(e.target.value ? Number(e.target.value) : '')} style={selectPill}>
                  <option value="">Mês: Ano todo</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </>
            )}
            {tributo === 'itbi' && (
              <select aria-label="Exercício" value={iAno} onChange={e => setIAno(Number(e.target.value))} style={selectPill}>
                {optsItbi.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
              </select>
            )}
            {tributo === 'isscc' && (
              <select aria-label="Exercício" value={sAno} onChange={e => setSAno(Number(e.target.value))} style={selectPill}>
                {optsIsscc.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
              </select>
            )}
            {tributo === 'tca' && (
              <select aria-label="Exercício" value={tAno} onChange={e => setTAno(Number(e.target.value))} style={selectPill}>
                {optsTca.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* ===== PAINEL ===== */}
        {tributo === 'iptu' && <PainelIptu ano={pAno} mes={pMes} />}
        {tributo === 'itbi' && <PainelItbi filtros={filtrosItbi} />}
        {tributo === 'isscc' && <PainelIsscc ano={sAno} />}
        {tributo === 'tca' && <PainelTca ano={tAno} />}

      </div>
    </div>
  )
}
