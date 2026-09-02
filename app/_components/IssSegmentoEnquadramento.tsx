'use client'

import { useState, useEffect } from 'react'

interface Contagem { nome: string; qt: number }
interface Resp { total: number; porTipo: Contagem[]; porSituacao: Contagem[]; valorServicoAtivos: number; issEstimadoAtivos: number }

const TIPO_CORES = ['#283e93', '#3f5bb5', '#5870c4', '#7d8fce', '#9cabd9', '#b9c4e8', '#cdd9ee', '#e8962e', '#c0612a']
const SITUACAO_COR = (s: string) => /^ativ/i.test(s) ? '#1fa463' : /cancel|baix/i.test(s) ? '#d64545' : /suspens/i.test(s) ? '#e8962e' : '#9098a8'
const n = (v: number) => v.toLocaleString('pt-BR')
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }

// "Análise de Enquadramento" — painel companion do card ISS por Segmento (IssSegmentoPrestador):
// ao selecionar um segmento lá (via callback onSegmentoChange, prop `segmento` aqui), mostra
// as empresas cadastradas naquele segmento por tipo de empresa/enquadramento (EMPRESA, MEI,
// AUTÔNOMO, ME, LTDA, EPP, EIRELI, SA, ENTIDADES...) e por situação cadastral (Ativo,
// Cancelado, Suspenso...). Fonte: /api/mobiliario/iss-segmento-enquadramento — retrato do
// CADASTRO atual (tb_dsod_contribuinte_mobiliario), não filtrado por ano/mês, já que é um
// perfil cadastral e não uma série financeira (mesma convenção da aba cadastral Mobiliário).
// A pedido do usuário, quando a situação é Ativo (ou variantes ativas — Ativo título
// precário, Abertura), soma-se o Valor de Serviço das NFS-e válidas dessas empresas no
// segmento e aplica-se uma alíquota média assumida de 3,5% como "ISS Estimado" — não é a
// alíquota real de nenhuma nota, é uma média fixa pra estimativa.
export default function IssSegmentoEnquadramento({ segmento }: { segmento: string | null }) {
  const [dados, setDados] = useState<Resp | null>(null)

  useEffect(() => {
    setDados(null)
    if (!segmento) return
    fetch(`/api/mobiliario/iss-segmento-enquadramento?segmento=${encodeURIComponent(segmento)}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setDados(d) }).catch(() => {})
  }, [segmento])

  if (!segmento) {
    return (
      <div style={{ ...card, marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 260 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Análise de Enquadramento</span>
        <div style={{ fontSize: 12, color: '#9098a8', marginTop: 10, maxWidth: 260 }}>
          Selecione um segmento em &quot;ISS por Segmento&quot; para ver a composição das empresas por tipo/enquadramento e situação cadastral.
        </div>
      </div>
    )
  }

  const maxTipo = dados ? Math.max(1, ...dados.porTipo.map(t => t.qt)) : 1
  const totalSituacao = dados ? dados.porSituacao.reduce((s, t) => s + t.qt, 0) : 0

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Análise de Enquadramento</span>
        <span style={reportBadge}>Cadastro</span>
      </div>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
        Empresas de &quot;{segmento}&quot; por tipo/enquadramento e situação cadastral (cadastro mobiliário, todos os exercícios).
      </div>

      {!dados ? (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ height: 13, borderRadius: 5, background: '#eef1f7', width: `${90 - i * 12}%` }} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12, background: '#283e93', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Total de empresas no segmento</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.5px' }}>{n(dados.total)}</span>
          </div>

          <div style={{ marginTop: 16, fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por tipo de empresa</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dados.porTipo.map((t, i) => {
              const w = Math.max(3, (t.qt / maxTipo) * 100)
              return (
                <div key={t.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: '#3a4256' }}>{t.nome}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1f2a44', flex: 'none' }}>{n(t.qt)}</span>
                  </div>
                  <div style={{ height: 11, borderRadius: 5, background: '#e9edf8', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w.toFixed(1)}%`, background: TIPO_CORES[i % TIPO_CORES.length], borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 18, fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Por situação cadastral</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dados.porSituacao.map(s => {
              const pct = totalSituacao ? (100 * s.qt / totalSituacao) : 0
              const cor = SITUACAO_COR(s.nome)
              return (
                <div key={s.nome} style={{ flex: '1 1 0', minWidth: 90, background: '#f7f9fd', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: cor }}>{n(s.qt)}</div>
                  <div style={{ fontSize: 10, color: '#5b6477' }}>{s.nome}</div>
                  <div style={{ fontSize: 9.5, color: '#aeb6c6' }}>{pct.toFixed(1).replace('.', ',')}%</div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 16, background: '#e6f6ee', border: '1px solid #bfe6cd', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1fa463' }}>ISS Estimado (empresas Ativas)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtReais(dados.issEstimadoAtivos)}</div>
            <div style={{ fontSize: 9.5, color: '#5b6477', marginTop: 3 }}>Valor de Serviço das NFS-e válidas ({fmtReais(dados.valorServicoAtivos)}) × alíquota média assumida de 3,5%</div>
          </div>
        </>
      )}
    </div>
  )
}
