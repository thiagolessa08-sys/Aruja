'use client'

import { useState, useEffect } from 'react'
import TopNav, { type AbaTopo } from './TopNav'

export default function EmConstrucao({ ativo, titulo, descricao }: { ativo: AbaTopo; titulo: string; descricao: string }) {
  const [saudacao, setSaudacao] = useState('Bom dia')
  useEffect(() => {
    const h = new Date().getHours()
    setSaudacao(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f9', padding: '26px 14px', fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>
        <TopNav ativo={ativo} />
        <div style={{ margin: '26px 4px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
            {saudacao}, <span style={{ color: '#7d8fce' }}>Roberta!</span>
          </h1>
        </div>
        <div style={{ marginTop: 22, background: '#fff', borderRadius: 22, padding: '48px 32px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="1.8"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2a44', marginTop: 18 }}>{titulo}</div>
          <div style={{ fontSize: 14, color: '#5b6477', marginTop: 8, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>{descricao}</div>
          <div style={{ display: 'inline-block', marginTop: 20, fontSize: 12, fontWeight: 600, color: '#283e93', background: '#e9edf8', borderRadius: 18, padding: '7px 16px' }}>Em construção</div>
        </div>
      </div>
    </div>
  )
}
