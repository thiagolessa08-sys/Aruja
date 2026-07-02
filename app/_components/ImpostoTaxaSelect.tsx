'use client'

import { useState, useRef, useEffect } from 'react'

export interface GrupoImpostoTaxa { alinea: string; naturezas: string[] }

// Dropdown de 2 níveis "Impostos e Taxas":
//   • Alínea (negrito) é clicável → seleciona o nível 1 inteiro (valor 'A::<alinea>')
//   • Naturezas (indentadas) → nível 2 (valor 'N::<natureza>')
// Alíneas com uma única natureza aparecem só como o item em negrito (sem duplicar).
export default function ImpostoTaxaSelect({
  grupos, value, onChange, style,
}: {
  grupos: GrupoImpostoTaxa[]
  value: string // '' | 'A::<alinea>' | 'N::<natureza>'
  onChange: (v: string) => void
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])

  const label = value ? value.slice(3) : 'Impostos e Taxas: Todos'
  const sel = (v: string) => { onChange(v); setOpen(false) }

  const rowBase: React.CSSProperties = { cursor: 'pointer', borderRadius: 8, transition: 'background .1s' }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" aria-label="Impostos e Taxas" title={label} onClick={() => setOpen(o => !o)}
        style={{ ...style, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </button>
      {open ? (
        <div style={{ position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0, width: 470, maxWidth: '92vw', maxHeight: 430, overflowY: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e3e9f5', boxShadow: '0 14px 36px rgba(20,40,90,0.22)', padding: 6 }}>
          <div onClick={() => sel('')} style={{ ...rowBase, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#5b6477', background: value ? 'transparent' : '#eef1fb' }}>
            Impostos e Taxas: Todos
          </div>
          {grupos.map(g => {
            const aVal = `A::${g.alinea}`
            const single = g.naturezas.length <= 1
            const alineaSel = value === aVal || (single && value === `N::${g.naturezas[0]}`)
            return (
              <div key={g.alinea}>
                <div onClick={() => sel(aVal)} title={g.alinea}
                  style={{ ...rowBase, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, color: '#1f2a44', background: alineaSel ? '#eef1fb' : 'transparent' }}>
                  {g.alinea}
                </div>
                {!single ? g.naturezas.map(nat => (
                  <div key={nat} onClick={() => sel(`N::${nat}`)} title={nat}
                    style={{ ...rowBase, padding: '6px 12px 6px 28px', fontSize: 12, color: '#3a4256', background: value === `N::${nat}` ? '#eef1fb' : 'transparent' }}>
                    {nat}
                  </div>
                )) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
