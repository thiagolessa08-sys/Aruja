'use client'

import { useState, useEffect } from 'react'
import { fmtAbrev } from '@/lib/fmt-grafico'
import type { Cenario } from '@/lib/iss-fora-previsao'

interface EmpresaLimite { cnpj: string; nome: string; atual: number; projetado: number }
interface CenarioLimite { cruzamMei: EmpresaLimite[]; cruzamSimples: EmpresaLimite[] }
interface Resp {
  anoBase: number
  anoPrevisao: number
  conservador: CenarioLimite
  provavel: CenarioLimite
  agressivo: CenarioLimite
}

const LABEL_CENARIO: Record<Cenario, string> = { conservador: 'Conservador', provavel: 'Provável', agressivo: 'Agressivo' }
const card: React.CSSProperties = { background: '#fff', borderRadius: 22, padding: 20, boxShadow: '0 6px 22px rgba(40,80,180,0.05)' }

// "Limite Anual de Faturamento" — referência regulatória (MEI/Simples Nacional) + projeção
// dinâmica: quantas empresas locais (mesma classificação aproximada de tb_dsod_nfse usada
// no card ISS Prestador de Fora do Município) que hoje estão perto de um teto passariam a
// ultrapassá-lo em 2027, segundo o cenário escolhido na Simulação · Previsão daquele card —
// crescimentoTotalPct (lib/iss-fora-previsao) é a mesma % aplicada em ISS por Segmento, daí
// a interação entre os três gráficos ao trocar de cenário. Fonte:
// /api/mobiliario/limite-faturamento-projecao (independente de ano/mês — sempre ancorado no
// último exercício completo).
export default function LimiteFaturamento({ cenario }: { cenario: Cenario }) {
  const [dados, setDados] = useState<Resp | null>(null)

  useEffect(() => {
    fetch('/api/mobiliario/limite-faturamento-projecao').then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setDados(d) }).catch(() => {})
  }, [])

  const atual = dados ? dados[cenario] : null
  const exemplos = atual ? [...atual.cruzamSimples, ...atual.cruzamMei].slice(0, 5) : []

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2a44' }}>Limite Anual de Faturamento</span>
      <div style={{ fontSize: 11, color: '#9098a8', marginTop: 2 }}>Referência regulatória (Lei Complementar nº 123/2006 e alterações) — não vem do cadastro, é contexto para comparar com o faturamento das empresas</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginTop: 16 }}>
        <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>MEI — Microempreendedor Individual</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2a44', marginTop: 6 }}>R$ 81.000,00 / ano</div>
          <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 4 }}>Acima do limite, a empresa é desenquadrada do MEI (proporcional se aberta durante o ano).</div>
          {dados && atual ? (
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: atual.cruzamMei.length ? '#c0612a' : '#5b6477', background: atual.cruzamMei.length ? '#fdf1e2' : '#eef1f7', borderRadius: 8, padding: '6px 10px', lineHeight: 1.4 }}>
              {atual.cruzamMei.length} empresa{atual.cruzamMei.length === 1 ? ' local' : 's locais'} passaria{atual.cruzamMei.length === 1 ? '' : 'm'} do teto até {dados.anoPrevisao} · cenário {LABEL_CENARIO[cenario]}
            </div>
          ) : null}
        </div>
        <div style={{ background: '#f7f9fd', border: '1px solid #e3e8f1', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#283e93' }}>Simples Nacional</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2a44', marginTop: 6 }}>R$ 4.800.000,00 / ano</div>
          <div style={{ fontSize: 10.5, color: '#9098a8', marginTop: 4 }}>Acima do limite, a empresa deixa de poder optar/permanecer no Simples Nacional.</div>
          {dados && atual ? (
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: atual.cruzamSimples.length ? '#c0612a' : '#5b6477', background: atual.cruzamSimples.length ? '#fdf1e2' : '#eef1f7', borderRadius: 8, padding: '6px 10px', lineHeight: 1.4 }}>
              {atual.cruzamSimples.length} empresa{atual.cruzamSimples.length === 1 ? ' local' : 's locais'} passaria{atual.cruzamSimples.length === 1 ? '' : 'm'} do teto até {dados.anoPrevisao} · cenário {LABEL_CENARIO[cenario]}
            </div>
          ) : null}
        </div>
      </div>

      {exemplos.length ? (
        <div style={{ marginTop: 16, borderTop: '1px solid #eef1f7', paddingTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2a44', marginBottom: 10 }}>Empresas que passariam do teto (cenário {LABEL_CENARIO[cenario]})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {exemplos.map(e => (
              <div key={e.cnpj} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                <span style={{ color: '#3a4256', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nome}</span>
                <span style={{ flex: 'none', color: '#9098a8' }}>{fmtAbrev(e.atual)} <span style={{ color: '#c0612a' }}>→ {fmtAbrev(e.projetado)}</span></span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 10, color: '#aeb6c6', marginTop: 10 }}>Valores de referência federais — confirme se houve atualização legislativa antes de usar para decisões fiscais. Projeção baseada em receita de serviços (NFS-e) de empresas classificadas como locais — mesma aproximação do card ISS Prestador de Fora do Município.</div>
    </div>
  )
}
