'use client'

import { useState, useEffect } from 'react'

interface CanceladaPrestador { cpfCnpj: string; nome: string; codigo: string; qtNotas: number; vlServicos: number }
interface SituacaoNfse { total: number; normal: number; cancelada: number; porPrestador: CanceladaPrestador[] }
interface NfseItem {
  cd: number; numero: string; serie: string; dtEmissao: string
  prestador: string; cpfCnpj: string
  vlServicos: number; vlImposto: number; aliquota: number
  situacao: 'normal' | 'cancelada' | ''
  dtCancelamento: string; motivoCancelamento: string
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }
const reportBadge: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#283e93', border: '1.5px solid #cdd5ef', borderRadius: 18, padding: '5px 14px' }
const fmtInt = (v: number) => v.toLocaleString('pt-BR')
const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const fmtData = (d: string) => d ? d.split('-').reverse().join('/') : '—'

// "Acompanhamento de NFS-e" — traceabilidade das notas das quais o ISS se originou
// (tb_dsod_nfse). Três partes: (1) situação cadastral agregada (Normal × Cancelada) — hoje
// invisível no resto da tela, já que o volume de ISS filtra silenciosamente as canceladas
// (ver iss-emitidas-tomadas); (2) notas canceladas por prestador (CCM, nome, quantidade e
// valor de serviço), a pedido do usuário — inclui inclusive valores extremos que só
// aparecem porque foram cancelados (ex.: uma nota de R$28 bi de uma pessoa física, validada
// ao vivo — provável erro de lançamento já corrigido pelo próprio cancelamento); (3) consulta
// individual por CNPJ/CPF do prestador ou número da nota, pra auditar o documento que
// originou um lançamento de ISS específico.
export default function NfseAcompanhamento({ mes }: { mes?: number }) {
  const [situacao, setSituacao] = useState<SituacaoNfse | null>(null)
  const [tipoBusca, setTipoBusca] = useState<'cnpj' | 'numero'>('cnpj')
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<NfseItem[] | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    setSituacao(null)
    const qs = new URLSearchParams()
    if (mes) qs.set('mes', String(mes))
    const q = qs.toString()
    fetch(`/api/mobiliario/nfse-situacao${q ? `?${q}` : ''}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error && typeof d.total === 'number') setSituacao(d) }).catch(() => {})
  }, [mes])

  useEffect(() => {
    const q = busca.trim()
    const minimo = tipoBusca === 'numero' ? 1 : 8
    if (q.replace(/\D/g, '').length < minimo) { setItens(null); return }
    let vivo = true
    setCarregando(true)
    const t = setTimeout(() => {
      fetch(`/api/mobiliario/nfse-consulta?tipo=${tipoBusca}&q=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : null)
        .then(d => { if (vivo && d && !d.error && Array.isArray(d.itens)) setItens(d.itens) })
        .finally(() => { if (vivo) setCarregando(false) })
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, tipoBusca])

  const pctCancelada = situacao && situacao.total ? (situacao.cancelada / situacao.total) * 100 : 0

  return (
    <div style={{ ...card, marginTop: 18, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Acompanhamento de NFS-e</span>
          <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>
            Situação cadastral das notas das quais o ISS se originou{mes ? ` — acumulado até o mês ${mes}` : ''}, e consulta individual por prestador ou número da nota.
          </div>
        </div>
        <span style={reportBadge}>NFS-e</span>
      </div>

      {!situacao ? (
        <div style={{ marginTop: 14, height: 60, borderRadius: 12, background: '#eef1f7' }} />
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#283e93' }}>Total de notas</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(situacao.total)}</div>
          </div>
          <div style={{ background: '#e6f6ee', border: '1px solid #bfe6cd', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1fa463' }}>Normal (válidas)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(situacao.normal)}</div>
          </div>
          <div style={{ background: '#fdeceb', border: '1px solid #f3d0cd', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#d64545' }}>Canceladas</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2a44', marginTop: 4 }}>{fmtInt(situacao.cancelada)} <span style={{ fontSize: 11, color: '#9098a8', fontWeight: 500 }}>({fmtPct(pctCancelada)})</span></div>
          </div>
        </div>
      )}

      {situacao && situacao.porPrestador.length ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Notas Canceladas por Prestador</div>
          <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 2 }}>Maiores valores de serviço cancelados, por prestador · CCM quando vinculado ao contribuinte</div>
          <div style={{ marginTop: 10, border: '1px solid #e3e8f1', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['CCM', 'Nome', 'Qtd.', 'Valor de Serviço'].map((h, i) => (
                      <th key={h} style={{ position: 'sticky', top: 0, background: '#283e93', color: '#fff', fontSize: 10.5, fontWeight: 600, padding: '8px 10px', textAlign: i === 1 ? 'left' : i === 0 ? 'center' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {situacao.porPrestador.map((p, ri) => (
                    <tr key={p.cpfCnpj} style={{ background: ri % 2 === 0 ? '#fff' : '#f7f9fd' }}>
                      <td style={{ fontSize: 11, color: '#3a4256', padding: '7px 10px', borderBottom: '1px solid #eef1f7', textAlign: 'center' }}>{p.codigo || '—'}</td>
                      <td style={{ fontSize: 11, color: '#1f2a44', fontWeight: 600, padding: '7px 10px', borderBottom: '1px solid #eef1f7' }}>
                        {p.nome}
                        <div style={{ fontSize: 9.5, color: '#9098a8', fontWeight: 400 }}>{p.cpfCnpj}</div>
                      </td>
                      <td style={{ fontSize: 11, color: '#3a4256', padding: '7px 10px', borderBottom: '1px solid #eef1f7', textAlign: 'right' }}>{fmtInt(p.qtNotas)}</td>
                      <td style={{ fontSize: 11, fontWeight: 700, color: '#d64545', padding: '7px 10px', borderBottom: '1px solid #eef1f7', textAlign: 'right' }}>{fmtReais(p.vlServicos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44' }}>Consultar NFS-e</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <select value={tipoBusca} onChange={e => { setTipoBusca(e.target.value as 'cnpj' | 'numero'); setBusca(''); setItens(null) }}
            style={{ border: '1.5px solid #e3e9f5', borderRadius: 12, padding: '7px 10px', fontSize: 12, color: '#283e93', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
            <option value="cnpj">Prestador (CNPJ/CPF)</option>
            <option value="numero">Número da Nota</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7fc', borderRadius: 12, padding: '7px 12px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9098a8" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={tipoBusca === 'cnpj' ? 'CNPJ ou CPF do prestador…' : 'Número da nota…'} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: '#3a4256', width: '100%', fontFamily: 'inherit' }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, position: 'relative', minHeight: itens && itens.length ? undefined : 0 }}>
          {carregando ? <div style={{ fontSize: 11.5, color: '#9098a8', textAlign: 'center', padding: '10px 0' }}>Buscando…</div> : null}
          {!carregando && itens && !itens.length ? (
            <div style={{ fontSize: 12, color: '#9098a8', padding: '16px 0', textAlign: 'center' }}>Nenhuma NFS-e encontrada.</div>
          ) : null}
          {!carregando && itens && itens.length ? (
            <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {itens.map(it => (
                <div key={it.cd} style={{ padding: '9px 6px', borderRadius: 8, borderBottom: '1px solid #f0f2f8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#1f2a44', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      NFS-e {it.numero}{it.serie ? `/${it.serie}` : ''} — {it.prestador}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '2px 8px', flex: 'none',
                      color: it.situacao === 'cancelada' ? '#d64545' : '#1fa463',
                      background: it.situacao === 'cancelada' ? '#fdeceb' : '#e6f6ee',
                    }}>
                      {it.situacao === 'cancelada' ? 'Cancelada' : 'Normal'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                    <span style={{ fontSize: 10.5, color: '#9098a8' }}>{it.cpfCnpj || '—'}</span>
                    <span style={{ fontSize: 10.5, color: '#9098a8' }}>Emissão: {fmtData(it.dtEmissao)}</span>
                    <span style={{ fontSize: 10.5, color: '#9098a8' }}>Serviços: {fmtReais(it.vlServicos)}</span>
                    <span style={{ fontSize: 10.5, color: '#9098a8' }}>ISS: {fmtReais(it.vlImposto)} ({it.aliquota.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%)</span>
                  </div>
                  {it.situacao === 'cancelada' && (it.dtCancelamento || it.motivoCancelamento) ? (
                    <div style={{ fontSize: 10.5, color: '#d64545', marginTop: 2 }}>
                      Cancelada{it.dtCancelamento ? ` em ${fmtData(it.dtCancelamento)}` : ''}{it.motivoCancelamento ? ` — ${it.motivoCancelamento}` : ''}
                    </div>
                  ) : null}
                </div>
              ))}
              {itens.length >= 30 ? <div style={{ fontSize: 10, color: '#aeb6c6', textAlign: 'center', marginTop: 4 }}>Mostrando as 30 mais recentes.</div> : null}
            </div>
          ) : null}
          {!carregando && !itens ? (
            <div style={{ fontSize: 10.5, color: '#aeb6c6', padding: '4px 0' }}>
              {tipoBusca === 'cnpj' ? 'Digite um CNPJ ou CPF completo para buscar.' : 'Digite o número da nota para buscar.'}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
