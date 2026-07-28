'use client'

import { useState, useEffect } from 'react'
import { useSaudacaoNome } from '../_components/useSaudacao'
import TopNav from '../_components/TopNav'
import PainelTributo from '../tributo/PainelTributo'
import DividaAtivaPorTributo from '../_components/DividaAtivaPorTributo'

export default function OutrosTributosPage() {
  const [saudacao, setSaudacao] = useState('Bom dia')
  const nome = useSaudacaoNome()
  const [anos, setAnos] = useState<number[]>([])
  const [ano, setAno] = useState<number | ''>('')

  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  function handleAnos(lista: number[]) {
    setAnos(prev => (prev.length === lista.length && prev.every((v, i) => v === lista[i]) ? prev : lista))
    setAno(prev => (prev && lista.includes(prev)) ? prev : (lista[lista.length - 1] ?? ''))
  }

  const chevron = (cor: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${cor}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`
  const selectPill: React.CSSProperties = {
    borderRadius: 22, padding: '9px 30px 9px 14px', fontSize: 13, fontWeight: 600, color: '#283e93',
    backgroundColor: '#fff', border: '1.5px solid #e3e9f5', boxShadow: '0 4px 12px rgba(40,80,180,0.04)',
    fontFamily: 'inherit', cursor: 'pointer', maxWidth: 240,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center', backgroundImage: chevron('%23283e93'),
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>
        <TopNav ativo="outros" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>{nome}!</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#5b6477' }}>Tributos diversos (taxas, contribuições, multas)</span>
            <select aria-label="Exercício" value={ano} onChange={e => setAno(Number(e.target.value))} style={selectPill}>
              {anos.map(a => <option key={a} value={a}>Exercício: {a}</option>)}
            </select>
          </div>
        </div>
        <PainelTributo grupo="outros" titulo="Outros Tributos" ano={ano || undefined} onAnos={handleAnos} />
        <DividaAtivaPorTributo />
      </div>
    </div>
  )
}
