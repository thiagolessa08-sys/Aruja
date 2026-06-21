'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Catalog, CatalogEntry } from '@/lib/catalog-types'

export default function CatalogoPage() {
  const router = useRouter()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [building, setBuilding] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null)

  useEffect(() => { loadCatalog() }, [])

  async function loadCatalog() {
    try {
      const res = await fetch('/api/catalog')
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (data.catalog) setCatalog(data.catalog)
    } catch { /* silently fail */ }
  }

  async function startBuild() {
    setBuilding(true)
    setLog(['Verificando catálogo...'])
    try {
      const res = await fetch('/api/catalog/gerar', { method: 'POST' })
      const body = await res.text()
      let data: Record<string, unknown> = {}
      try { data = JSON.parse(body) } catch { /* ignore */ }

      if (!res.ok) {
        setLog([`❌ ${data.error ?? `HTTP ${res.status}`}`])
        return
      }
      setLog([`✅ Catálogo carregado com ${data.tabelas} tabelas!`])
      await loadCatalog()
    } catch (e) {
      setLog([`❌ ${String(e)}`])
    } finally {
      setBuilding(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const filtered = catalog?.entradas.filter(e =>
    !search ||
    e.tabela.toLowerCase().includes(search.toLowerCase()) ||
    e.descricao.toLowerCase().includes(search.toLowerCase()) ||
    e.conceitos.some(c => c.toLowerCase().includes(search.toLowerCase()))
  ) ?? []

  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 22,
    boxShadow: '0 6px 22px rgba(40,80,180,0.05)',
  }
  const navTab: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: 24,
    color: '#5b6477',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#9098a8',
    marginBottom: 8,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eef2f9',
        padding: '26px 14px',
        fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
        color: '#1f2a44',
      }}
    >
      <div style={{ maxWidth: 1560, margin: '0 auto' }}>

        {/* ===== TOP NAV ===== */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            borderRadius: 20,
            padding: '12px 18px',
            boxShadow: '0 6px 22px rgba(40,80,180,0.05)',
          }}
        >
          <img src="/logo-aruja.png" alt="Prefeitura Municipal de Arujá" style={{ height: 46, width: 'auto', display: 'block' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f7fc', borderRadius: 30, padding: 5 }}>
            <Link href="/dashboard" style={navTab}>Orçamento</Link>
            <span style={navTab}>Contribuinte</span>
            <span style={navTab}>Imobiliário</span>
            <span style={navTab}>Mobiliário</span>
            <span style={navTab}>Arrecada Mais</span>
            <Link href="/chat" style={navTab}>Chat</Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/catalogo" title="Catálogo de dados" style={{ width: 42, height: 42, borderRadius: '50%', background: '#283e93', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(40,62,147,0.35)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <button onClick={handleLogout} title="Sair" style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid #ffffff', boxShadow: '0 0 0 1px #e3e9f5', padding: 0, cursor: 'pointer', background: 'transparent' }}>
              <svg viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" fill="#cdd9ee" /><circle cx="20" cy="15" r="8" fill="#9fb2d4" /><path d="M5 40 a15 13 0 0 1 30 0" fill="#9fb2d4" /></svg>
            </button>
          </div>
        </div>

        {/* ===== GREETING ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 4px 18px', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-.5px', color: '#283e93' }}>
              Catálogo <span style={{ color: '#7d8fce' }}>de Dados</span>
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9098a8' }}>Dicionário semântico — pref_aruja_sp</p>
          </div>
          <button
            onClick={startBuild}
            disabled={building}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#283e93', color: '#fff', border: 'none',
              padding: '12px 22px', borderRadius: 24,
              fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
              cursor: building ? 'not-allowed' : 'pointer',
              opacity: building ? 0.6 : 1,
              boxShadow: '0 8px 18px rgba(40,62,147,0.32)',
            }}
          >
            {building ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ animation: 'cat-spin .8s linear infinite' }}>
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Gerando catálogo…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinejoin="round" /></svg>
                {catalog ? 'Regenerar catálogo' : 'Gerar catálogo com IA'}
              </>
            )}
          </button>
        </div>

        <style dangerouslySetInnerHTML={{ __html: '@keyframes cat-spin { to { transform: rotate(360deg); } }' }} />

        {/* ===== BODY ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>

          {/* ---- LEFT: lista de tabelas ---- */}
          <aside style={{ ...card, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)', overflow: 'hidden' }}>
            <div style={{ padding: 18, borderBottom: '1px solid #eef1f7' }}>
              {catalog && (
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9098a8' }}>
                  {catalog.entradas.length} tabelas •{' '}
                  {new Date(catalog.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}

              {catalog && (
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar tabela ou conceito…"
                  style={{
                    width: '100%', fontSize: 13, border: '1px solid #e3e9f5',
                    borderRadius: 12, padding: '9px 14px', outline: 'none',
                    color: '#1f2a44', fontFamily: 'inherit', background: '#f4f7fc',
                  }}
                />
              )}

              {log.length > 0 && (
                <div style={{ marginTop: 12, background: '#1f2a44', borderRadius: 12, padding: 10, maxHeight: 110, overflowY: 'auto' }}>
                  {log.map((l, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#7fe3a8' }}>{l}</p>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {!catalog && !building && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9098a8', fontSize: 13 }}>
                  <p style={{ margin: 0 }}>Nenhum catálogo gerado.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12 }}>Clique em &quot;Gerar catálogo&quot; para começar.</p>
                </div>
              )}
              {filtered.map(entry => {
                const active = selectedEntry?.tabela === entry.tabela
                return (
                  <button
                    key={entry.tabela}
                    onClick={() => setSelectedEntry(entry)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 18px',
                      borderBottom: '1px solid #f4f7fc', border: 'none',
                      borderLeft: active ? '3px solid #283e93' : '3px solid transparent',
                      background: active ? '#eef2fb' : 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12.5, fontFamily: 'monospace', fontWeight: 600, color: '#283e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.tabela}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9098a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.descricao}</p>
                    {entry.conceitos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {entry.conceitos.slice(0, 3).map(c => (
                          <span key={c} style={{ fontSize: 11, background: '#e9edf8', color: '#283e93', padding: '2px 8px', borderRadius: 999 }}>{c}</span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </aside>

          {/* ---- RIGHT: detalhe / mapa ---- */}
          <main style={{ ...card, padding: 24, minHeight: 'calc(100vh - 180px)' }}>

            {/* Mapa de conceitos */}
            {catalog && !selectedEntry && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#1f2a44' }}>Mapa de Conceitos de Negócio</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 24 }}>
                  {Object.entries(catalog.mapa_conceitos).map(([conceito, tabelas]) => (
                    <div key={conceito} style={{ background: '#f4f7fc', border: '1px solid #eef1f7', borderRadius: 16, padding: 16 }}>
                      <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#1f2a44', textTransform: 'capitalize' }}>{conceito}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tabelas.map(t => (
                          <button
                            key={t}
                            onClick={() => setSelectedEntry(catalog.entradas.find(e => e.tabela === t) ?? null)}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontFamily: 'monospace', color: '#283e93', textAlign: 'left', cursor: 'pointer' }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ color: '#9098a8', fontSize: 13 }}>Selecione uma tabela na lista ao lado para ver detalhes.</p>
              </div>
            )}

            {/* Detalhe de uma tabela */}
            {selectedEntry && (
              <div style={{ maxWidth: 720 }}>
                <button
                  onClick={() => setSelectedEntry(null)}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: '#283e93', cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                >
                  ← Voltar ao mapa
                </button>

                <div style={{ border: '1px solid #eef1f7', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ background: '#283e93', padding: '16px 20px' }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#aab8e3', fontFamily: 'monospace' }}>pref_aruja_sp</p>
                    <h2 style={{ margin: '2px 0 0', color: '#fff', fontWeight: 700, fontFamily: 'monospace', fontSize: 18 }}>{selectedEntry.tabela}</h2>
                  </div>

                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <p style={sectionLabel}>Descrição</p>
                      <p style={{ margin: 0, color: '#3a4256' }}>{selectedEntry.descricao}</p>
                    </div>

                    {selectedEntry.conceitos.length > 0 && (
                      <div>
                        <p style={sectionLabel}>Responde perguntas sobre</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {selectedEntry.conceitos.map(c => (
                            <span key={c} style={{ background: '#e9edf8', color: '#283e93', fontSize: 13, padding: '5px 12px', borderRadius: 999, fontWeight: 500 }}>{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(selectedEntry.colunas_chave).length > 0 && (
                      <div>
                        <p style={sectionLabel}>Colunas Principais</p>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f4f7fc', borderBottom: '1px solid #eef1f7' }}>
                              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#9098a8' }}>Coluna</th>
                              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#9098a8' }}>Significado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selectedEntry.colunas_chave).map(([col, desc]) => (
                              <tr key={col} style={{ borderBottom: '1px solid #f4f7fc' }}>
                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#283e93', fontSize: 12 }}>{col}</td>
                                <td style={{ padding: '8px 12px', color: '#3a4256' }}>{desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {selectedEntry.joins_comuns.length > 0 && (
                      <div>
                        <p style={sectionLabel}>JOINs Comuns</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {selectedEntry.joins_comuns.map(t => (
                            <button
                              key={t}
                              onClick={() => setSelectedEntry(catalog!.entradas.find(e => e.tabela === t) ?? null)}
                              style={{ fontFamily: 'monospace', fontSize: 12, background: '#f4f7fc', color: '#3a4256', padding: '6px 12px', borderRadius: 10, border: '1px solid #eef1f7', cursor: 'pointer' }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p style={sectionLabel}>Query de Exemplo</p>
                      <pre style={{ background: '#1f2a44', color: '#7fe3a8', fontSize: 12, padding: 16, borderRadius: 12, overflowX: 'auto', fontFamily: 'monospace', margin: 0 }}>
{`SELECT TOP 10 *
FROM pref_aruja_sp.${selectedEntry.tabela}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!catalog && !building && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: '#e9edf8', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#283e93" strokeWidth="1.6">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 style={{ margin: '0 0 4px', color: '#3a4256', fontWeight: 600 }}>Catálogo não gerado</h3>
                <p style={{ margin: 0, color: '#9098a8', fontSize: 13, maxWidth: 320 }}>
                  Clique em &quot;Gerar catálogo com IA&quot; para analisar o banco e criar o dicionário semântico automaticamente.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
