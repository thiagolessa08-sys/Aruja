'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type AbaTopo = 'orcamento' | 'contribuinte' | 'imobiliario' | 'mobiliario' | 'outros' | 'divida' | 'cobranca' | 'reforma'

const ABAS: { id: AbaTopo; label: string; href: string }[] = [
  { id: 'orcamento', label: 'Orçamento', href: '/dashboard' },
  { id: 'contribuinte', label: 'Contribuintes', href: '/contribuinte' },
  { id: 'imobiliario', label: 'Imobiliário', href: '/imobiliario' },
  { id: 'mobiliario', label: 'Mobiliário', href: '/mobiliario' },
  { id: 'outros', label: 'Outros Tributos', href: '/outros-tributos' },
  { id: 'divida', label: 'Dívida Ativa', href: '/divida-ativa' },
  { id: 'cobranca', label: 'Cobrança', href: '/cobranca' },
  { id: 'reforma', label: 'Reforma Tributária', href: '/reforma-tributaria' },
]

export default function TopNav({ ativo }: { ativo: AbaTopo }) {
  const router = useRouter()
  const navTab: React.CSSProperties = { padding: '9px 15px', borderRadius: 24, color: '#5b6477', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }
  const navAtivo: React.CSSProperties = { padding: '9px 17px', borderRadius: 24, background: '#283e93', color: '#ffffff', fontSize: 13.5, fontWeight: 500, boxShadow: '0 6px 14px rgba(40,62,147,0.35)', whiteSpace: 'nowrap' }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', borderRadius: 20, padding: '12px 18px', boxShadow: '0 6px 22px rgba(40,80,180,0.05)', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
        <img src="/logo-aruja.png" alt="Prefeitura Municipal de Arujá" style={{ height: 46, width: 'auto', display: 'block' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#f4f7fc', borderRadius: 30, padding: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        {ABAS.map(a => a.id === ativo
          ? <span key={a.id} style={navAtivo}>{a.label}</span>
          : <Link key={a.id} href={a.href} style={navTab}>{a.label}</Link>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <Link href="/catalogo" title="Catálogo de dados" style={{ width: 42, height: 42, borderRadius: '50%', background: '#e9edf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></svg>
        </Link>
        <button onClick={handleLogout} title="Sair" style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid #ffffff', boxShadow: '0 0 0 1px #e3e9f5', padding: 0, cursor: 'pointer', background: 'transparent' }}>
          <svg viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" fill="#cdd9ee" /><circle cx="20" cy="15" r="8" fill="#9fb2d4" /><path d="M5 40 a15 13 0 0 1 30 0" fill="#9fb2d4" /></svg>
        </button>
      </div>
    </div>
  )
}
