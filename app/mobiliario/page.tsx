'use client'

import { useState, useEffect } from 'react'
import { useSaudacaoNome } from '../_components/useSaudacao'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PainelMobiliario, { type FiltrosMobiliario } from './PainelMobiliario'
import TopNav from '../_components/TopNav'
import PainelTributo from '../tributo/PainelTributo'
import { SITUACOES, type SituacaoOpt } from '@/lib/mobiliario-filtros'

type SubAba = 'iss' | 'tfe' | 'tfhs' | 'mob'

export default function MobiliarioPage() {
  const router = useRouter()
  const [saudacao, setSaudacao] = useState('Bom dia')
  const nome = useSaudacaoNome()
  const [aba, setAba] = useState<SubAba>('iss')

  const [opts, setOpts] = useState<{ anos: number[]; situacoes: SituacaoOpt[] }>({ anos: [], situacoes: SITUACOES })
  const [rAno, setRAno] = useState<number | ''>('')
  const [rSituacao, setRSituacao] = useState<string>('')

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
    const v = new URLSearchParams(window.location.search).get('v')
    if (v === 'iss' || v === 'tfe' || v === 'tfhs' || v === 'mob') setAba(v)
  }, [])

  useEffect(() => {
    fetch('/api/mobiliario/filtros')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.error) {
          setOpts({ anos: d.anos ?? [], situacoes: d.situacoes ?? SITUACOES })
          if (d.anos?.length) setRAno(d.anos[0])
        }
      })
      .catch(() => {})
  }, [])

  function selecionar(op: SubAba) {
    setAba(op)
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
    fontFamily: 'inherit', cursor: 'pointer', maxWidth: 220,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center', backgroundImage: chevron('%23283e93'),
  }

  const filtros: FiltrosMobiliario = { ano: rAno, situacao: rSituacao }

  const SUBABAS: { id: SubAba; label: string }[] = [
    { id: 'iss', label: 'ISS' },
    { id: 'tfe', label: 'TFE' },
    { id: 'tfhs', label: 'TFHS' },
    { id: 'mob', label: 'MOBILIÁRIO' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV (abas filtradas por perfil) ===== */}
        <TopNav ativo="mobiliario" />

        {/* ===== GREETING + SUB-ABAS ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>{nome}!</span>
          </h1>
          <div role="radiogroup" aria-label="Sub-aba do Mobiliário" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            {SUBABAS.map(t => {
              const ativo = aba === t.id
              return (
                <button key={t.id} role="radio" aria-checked={ativo} onClick={() => selecionar(t.id)}
                  style={{
                    padding: '10px 22px', borderRadius: 24, border: 'none', cursor: 'pointer',
                    fontFamily: "var(--font-poppins), 'Poppins', sans-serif", fontSize: 14, fontWeight: ativo ? 600 : 500,
                    background: ativo ? '#283e93' : 'transparent', color: ativo ? '#fff' : '#5b6477',
                    boxShadow: ativo ? '0 6px 14px rgba(40,62,147,0.35)' : 'none', transition: 'background .15s, color .15s',
                  }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== TOOLBAR ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 0', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {aba === 'mob' ? (
              <>
                <select aria-label="Exercício" value={rAno} onChange={e => setRAno(Number(e.target.value))} style={selectPill}>
                  {opts.anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
                </select>
                <select aria-label="Situação cadastral" value={rSituacao} onChange={e => setRSituacao(e.target.value)} style={selectPill}>
                  <option value="">Situação: Todas</option>
                  {opts.situacoes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </>
            ) : (
              <div style={{ ...selectPill, cursor: 'default', color: '#5b6477', maxWidth: 'none' }}>
                {aba === 'iss' ? 'ISS / ISSQN' : aba === 'tfe' ? 'Taxa de Fiscalização de Estabelecimento' : 'Taxa de Fiscalização de Higiene e Saúde'} · todos os exercícios
              </div>
            )}
          </div>
        </div>

        {/* ===== PAINEL ===== */}
        {aba === 'iss' && <PainelTributo grupo="iss" titulo="ISS / ISSQN" />}
        {aba === 'tfe' && <PainelTributo grupo="tfe" titulo="TFE" />}
        {aba === 'tfhs' && <PainelTributo grupo="tfhs" titulo="TFHS" />}
        {aba === 'mob' && <PainelMobiliario filtros={filtros} />}

      </div>
    </div>
  )
}
