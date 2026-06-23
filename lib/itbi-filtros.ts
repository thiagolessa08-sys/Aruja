// Filtros da visão ITBI (tb_dsod_itbi + receita alínea "INTER VIVOS").
// O agente IQ dá HTTP 500 em literal de texto no WHERE, então a natureza da
// transação é classificada em JS (os rótulos brutos vêm sujos/duplicados).

export interface FiltrosItbi {
  ano: number | ''
  natureza: string // id de NATUREZAS, ou '' para todas
}

export interface NaturezaOpt {
  id: string
  label: string
  re: RegExp
}

// Buckets canônicos para ds_natureza_transacao (ordem por volume observado).
export const NATUREZAS: NaturezaOpt[] = [
  { id: 'compra_venda', label: 'Compra e Venda', re: /compra\s*e\s*venda|venda\s*e\s*compra/i },
  { id: 'cessao', label: 'Cessão de Direitos', re: /cess/i },
  { id: 'permuta', label: 'Permuta', re: /permuta/i },
  { id: 'dacao', label: 'Dação em Pagamento', re: /da[çc][ãa]o/i },
  { id: 'arrematacao', label: 'Arrematação/Adjudicação', re: /arremat|adjudica|remiss/i },
  { id: 'partilha', label: 'Partilha/Divisão', re: /partilha|divis/i },
]

export const NATUREZA_OUTROS = { id: 'outros', label: 'Demais atos' }

export function classificaNatureza(s: string): string {
  const t = (s ?? '').trim()
  if (!t) return NATUREZA_OUTROS.id
  for (const n of NATUREZAS) if (n.re.test(t)) return n.id
  return NATUREZA_OUTROS.id
}

export function lerFiltros(sp: URLSearchParams): FiltrosItbi {
  const anoRaw = sp.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : ''
  const natRaw = (sp.get('natureza') || '').trim()
  const natureza = NATUREZAS.some(n => n.id === natRaw) ? natRaw : ''
  return { ano: ano as number | '', natureza }
}
