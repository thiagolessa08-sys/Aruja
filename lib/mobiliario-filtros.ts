// Filtros da tela Mobiliário (tb_dsod_contribuinte_mobiliario).
// IMPORTANTE: o agente IQ dá HTTP 500 em qualquer literal de texto no WHERE,
// então NÃO há helper de WHERE por situação — as queries sempre fazem
// GROUP BY ds_situacao e o filtro é aplicado em JS.

export interface FiltrosMob {
  ano: number | ''
  situacao: string
}

export interface SituacaoOpt {
  value: string
  label: string
}

// Valores exatos de ds_situacao no IQ, ordenados por volume.
export const SITUACOES: SituacaoOpt[] = [
  { value: 'Ativo', label: 'Ativo' },
  { value: 'Cancelado', label: 'Cancelado' },
  { value: 'Suspenso', label: 'Suspenso' },
  { value: 'Inativo', label: 'Inativo' },
  { value: 'Baixado', label: 'Baixado' },
]

// Situações consideradas "ativas" para os KPIs/composição.
export const SITUACOES_ATIVAS = new Set(['Ativo', 'Ativo título precário', 'Abertura'])

export function lerFiltros(sp: URLSearchParams): FiltrosMob {
  const anoRaw = sp.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : ''
  const situacaoRaw = (sp.get('situacao') || '').trim()
  const situacao = SITUACOES.some(s => s.value === situacaoRaw) ? situacaoRaw : ''
  return { ano: ano as number | '', situacao }
}
