'use client'

// Overlay de carregamento — cobre o painel enquanto os dados do filtro chegam,
// para deixar claro que a ação foi aplicada.
export default function LoadingOverlay({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, borderRadius: 16,
      background: 'rgba(238,242,249,0.66)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 140,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'sticky', top: 160 }}>
        <svg width="46" height="46" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="#cdd9ee" strokeWidth="5" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="#283e93" strokeWidth="5" strokeLinecap="round" strokeDasharray="80 170">
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.85s" repeatCount="indefinite" />
          </circle>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#283e93' }}>{label}</span>
      </div>
    </div>
  )
}
