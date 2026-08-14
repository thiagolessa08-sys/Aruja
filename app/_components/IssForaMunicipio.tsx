'use client'

import { useState, useEffect } from 'react'
import { fmtAbrev } from '@/lib/fmt-grafico'

interface GrupoMun { qt: number; base: number; iss: number }
interface MunItem { nome: string; qt: number; iss: number }
interface Resp { local: GrupoMun; fora: GrupoMun; naoInformado: GrupoMun; topFora: MunItem[] }

const SEG_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e']

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }

// "ISS Prestador de Fora do Município" — separa as NFS-e por município do prestador
// (fonte: /api/mobiliario/iss-fora-municipio, tabela tb_dsod_nfse — INDEPENDENTE do motor
// de lançado/arrecadado de guias usado no resto da aba ISS; não somar com "ISS lançado" do
// topo da tela). nm_mun é texto livre digitado na nota, então a classificação Arujá × fora
// é aproximada (normalizada) — ver aviso no card. `ano`/`mes` seguem a mesma convenção do
// PainelTributo.
export default function IssForaMunicipio({ ano, mes }: { ano?: number; mes?: number }) {
  const [dados, setDados] = useState<Resp | null>(null)

  useEffect(() => {
    setDados(null)
    const qs = new URLSearchParams()
    if (ano) qs.set('ano', String(ano))
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/mobiliario/iss-fora-municipio${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setDados(d) }).catch(() => {})
  }, [ano, mes])

  if (!dados) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS Prestador de Fora do Município</span>
          <span style={reportBadge}>NFS-e</span>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 18, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const { local, fora, topFora } = dados
  const maxGrupo = Math.max(1, local.iss, fora.iss)
  const totalGrupos = local.iss + fora.iss
  const pctFora = totalGrupos ? (100 * fora.iss / totalGrupos) : 0
  const maxFora = Math.max(1, ...topFora.map(m => m.iss))

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS Prestador de Fora do Município{ano ? ` · ${ano}` : ''}</span>
        <span style={reportBadge}>NFS-e</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        Imposto indicado nas NFS-e por município do prestador{mes ? ` até o mês ${mes}` : ''} — fonte independente do ISS lançado (guias) do topo da tela, não some com ele.
      </div>
      <div style={{ fontSize: 10, color: '#c07a2e', background: '#fdf1e2', borderRadius: 8, padding: '6px 10px', marginTop: 8, lineHeight: 1.4 }}>
        Município do prestador é texto livre na nota fiscal (sujeito a grafia/digitação). A classificação Arujá × fora é aproximada (normalizada); um pequeno resíduo de erros de digitação de &quot;Arujá&quot; pode aparecer como fora do município.
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#283e93' }}>PRESTADORES DE ARUJÁ</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <div style={{ height: 40, width: `${Math.max(10, 86 * local.iss / maxGrupo).toFixed(1)}%`, borderRadius: 10, background: 'linear-gradient(90deg,#5870c4 0%,#8094d6 100%)', flex: 'none' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#283e93' }}>{fmtAbrev(local.iss)}</div>
              <div style={{ fontSize: 10, color: '#aeb6c6' }}>{local.qt.toLocaleString('pt-BR')} notas</div>
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.4px', color: '#e8962e' }}>PRESTADORES DE FORA DO MUNICÍPIO</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <div style={{ height: 40, width: `${Math.max(10, 86 * fora.iss / maxGrupo).toFixed(1)}%`, borderRadius: 10, background: 'linear-gradient(90deg,#e8962e 0%,#f3c07c 100%)', flex: 'none' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#c07a2e' }}>{fmtAbrev(fora.iss)}</div>
              <div style={{ fontSize: 10, color: '#aeb6c6' }}>{fora.qt.toLocaleString('pt-BR')} notas · {pctFora.toFixed(1).replace('.', ',')}% do total</div>
            </div>
          </div>
        </div>
      </div>

      {topFora.length ? (
        <div style={{ marginTop: 20, borderTop: '1px solid #eef1f7', paddingTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', marginBottom: 10 }}>Top municípios de fora</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topFora.map((m, i) => {
              const w = (m.iss / maxFora) * 100
              return (
                <div key={m.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256' }}>{m.nome}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{fmtAbrev(m.iss)}</span>
                  </div>
                  <div style={{ height: 11, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(3, w).toFixed(1)}%`, background: SEG_CORES[i % SEG_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
