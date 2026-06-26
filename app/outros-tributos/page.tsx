'use client'

import { useState, useEffect } from 'react'
import TopNav from '../_components/TopNav'
import PainelTributo from '../tributo/PainelTributo'

export default function OutrosTributosPage() {
  const [saudacao, setSaudacao] = useState('Bom dia')
  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>
        <TopNav ativo="outros" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>Roberta!</span>
          </h1>
          <span style={{ fontSize: 13, color: '#5b6477' }}>Tributos diversos (taxas, contribuições, multas) · todos os exercícios</span>
        </div>
        <PainelTributo grupo="outros" titulo="Outros Tributos" />
      </div>
    </div>
  )
}
