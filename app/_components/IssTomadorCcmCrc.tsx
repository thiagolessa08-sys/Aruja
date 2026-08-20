'use client'

import { useState, useEffect } from 'react'

interface Resumo { total: number; ccm: { com: number; sem: number }; crc: { com: number; sem: number } }
interface ItemDetalhe { cpfCnpj: string; nome: string; codigo: string; qtNotas: number; vlServicos: number }

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const fmtInt = (v: number) => v.toLocaleString('pt-BR')
const fmtAbrev = (v: number) => Math.abs(v) >= 1e6
  ? (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi'
  : Math.abs(v) >= 1e3 ? (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' k' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

// "ISS Tomador — CCM e CRC": tenta identificar, entre os tomadores de serviço (tb_dsod_nfse),
// quantos são eles mesmos contribuintes cadastrados no município (CCM,
// tb_dsod_contribuinte_mobiliario) e quantos têm contador com CRC vinculado no cadastro
// (tb_dsod_contadores) — não vem das tabelas oficiais tb_aux_iss_geral_tomador_CCM/CRC
// (permission denied). Cobertura é baixa por natureza (a maioria dos tomadores são clientes
// de fora ou pessoas físicas avulsas, não contribuintes locais), então o card deixa isso
// explícito em vez de sugerir que "sem CCM/CRC" é uma falha de dado.
export default function IssTomadorCcmCrc() {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [tipoSel, setTipoSel] = useState<'ccm' | 'crc' | null>(null)
  const [itens, setItens] = useState<ItemDetalhe[] | null>(null)
  const [erro, setErro] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    fetch('/api/mobiliario/iss-tomador-ccm-crc').then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && typeof d.total === 'number') setResumo(d) }).catch(() => {})
  }, [])

  function buscarDetalhe(tipo: 'ccm' | 'crc') {
    setItens(null); setErro(false)
    fetch(`/api/mobiliario/iss-tomador-ccm-crc-detalhe?tipo=${tipo}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && Array.isArray(d.itens)) setItens(d.itens); else setErro(true) }).catch(() => setErro(true))
  }

  function selecionar(tipo: 'ccm' | 'crc') {
    setBusca('')
    setTipoSel(prev => {
      const novo = prev === tipo ? null : tipo
      if (novo) buscarDetalhe(novo)
      return novo
    })
  }

  const pctCcm = resumo && resumo.total ? (resumo.ccm.com / resumo.total) * 100 : 0
  const pctCrc = resumo && resumo.total ? (resumo.crc.com / resumo.total) * 100 : 0
  const q = busca.trim().toLowerCase()
  const itensFiltrados = itens && q ? itens.filter(it => it.nome.toLowerCase().includes(q) || it.cpfCnpj.includes(q)) : itens
  const mxVl = itensFiltrados && itensFiltrados.length ? Math.max(1, ...itensFiltrados.map(it => it.vlServicos)) : 1

  return (
    <div style={{ ...card, marginTop: 18, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>ISS Tomador — CCM e CRC</span>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            Dos tomadores de serviço identificados nas NFS-e, quantos são também contribuintes cadastrados no município (CCM) e quantos têm contador com CRC vinculado.
          </div>
        </div>
        <span style={reportBadge}>Tomador</span>
      </div>

      {!resumo ? (
        <div style={{ marginTop: 14, height: 90, borderRadius: 12, background: '#eef1f7' }} />
      ) : (
        <>
          <div style={{ marginTop: 14, fontSize: 11, color: '#5b6477' }}>{fmtInt(resumo.total)} tomadores distintos identificados (por CPF/CNPJ) nas notas válidas.</div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {([
              { tipo: 'ccm' as const, label: 'Com CCM (contribuinte cadastrado)', com: resumo.ccm.com, pct: pctCcm, cor: '#283e93' },
              { tipo: 'crc' as const, label: 'Com CRC (contador vinculado)', com: resumo.crc.com, pct: pctCrc, cor: '#1fa463' },
            ]).map(x => {
              const ativo = tipoSel === x.tipo
              return (
                <div key={x.tipo} onClick={() => selecionar(x.tipo)}
                  style={{ cursor: 'pointer', background: ativo ? '#eef1fb' : '#f7f9fd', border: ativo ? `1.5px solid ${x.cor}` : '1.5px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: x.cor }}>{x.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(x.com)} <span style={{ fontSize: 11, color: '#9098a8', fontWeight: 500 }}>({fmtPct(x.pct)})</span></div>
                  <div style={{ height: 8, borderRadius: 4, background: '#eef1f7', overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ height: '100%', width: `${Math.max(1, x.pct).toFixed(1)}%`, borderRadius: 4, background: x.cor }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 9.5, color: '#aeb6c6', marginTop: 8 }}>
            Cobertura naturalmente baixa: a maioria dos tomadores de serviço são clientes de fora do município ou pessoas físicas avulsas, não contribuintes cadastrados aqui — não indica falha de cadastro. Clique num card para ver a lista.
          </div>
        </>
      )}

      {tipoSel ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eef1f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Tomadores {tipoSel === 'ccm' ? 'com CCM' : 'com CRC'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '5px 10px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou CPF/CNPJ…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: '#3a4256', width: 180, fontFamily: 'inherit' }} />
            </div>
          </div>
          {erro ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 11.5, color: '#d64545' }}>Não foi possível carregar a lista.</div>
              <button onClick={() => buscarDetalhe(tipoSel)} style={{ marginTop: 6, border: 'none', background: '#eef1fb', color: '#283e93', fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontFamily: 'inherit' }}>Tentar novamente</button>
            </div>
          ) : !itens ? (
            <div style={{ marginTop: 10, height: 60, borderRadius: 12, background: '#eef1f7' }} />
          ) : !itensFiltrados || !itensFiltrados.length ? (
            <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '16px 0' }}>{q ? 'Nenhum tomador encontrado para a busca.' : 'Nenhum tomador nesta condição.'}</div>
          ) : (
            <div style={{ marginTop: 10, maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, paddingRight: 4 }}>
              {itensFiltrados.map((it, i) => (
                <div key={it.cpfCnpj}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {it.nome || it.cpfCnpj}</span>
                    <span style={{ color: '#283e93', fontWeight: 700, flex: 'none' }}>{fmtAbrev(it.vlServicos)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#9098a8', marginBottom: 4 }}>{it.cpfCnpj} · {it.qtNotas} nota{it.qtNotas > 1 ? 's' : ''} · {tipoSel === 'ccm' ? `CCM ${it.codigo}` : `CRC ${it.codigo}`}</div>
                  <div style={{ height: 8, borderRadius: 4, background: '#eef1f7', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(3, 100 * it.vlServicos / mxVl).toFixed(1)}%`, borderRadius: 4, background: '#3f5bb5' }} />
                  </div>
                </div>
              ))}
              {itens.length >= 600 ? <div style={{ fontSize: 10, color: '#aeb6c6', textAlign: 'center', marginTop: 4 }}>Mostrando os 600 primeiros — refine a busca para ver mais.</div> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
