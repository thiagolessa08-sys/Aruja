'use client'

import { useState, useEffect } from 'react'
import { useSaudacaoNome } from '../_components/useSaudacao'
import TopNav from '../_components/TopNav'
import PainelCobranca from './PainelCobranca'

export default function CobrancaPage() {
  const [saudacao, setSaudacao] = useState('Bom dia')
  const nome = useSaudacaoNome()
  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>
        <TopNav ativo="cobranca" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>{nome}!</span>
          </h1>
          <span style={{ fontSize: 13, color: '#5b6477' }}>Conversão de DAMs, potencial de arrecadação e canais · exercício 2025</span>
        </div>
        <PainelCobranca />
      </div>
    </div>
  )
}
