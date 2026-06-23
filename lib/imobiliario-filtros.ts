// Filtros da tela Imobiliário (IPTU / cadastro de imóveis).
// IMPORTANTE: o agente IQ quebra (HTTP 500) com operadores < > no WHERE — usar sempre BETWEEN.

export interface FiltrosImob {
  ano: number | ''
  faixa: number | ''
}

export interface FaixaVenal {
  id: number
  label: string
  lo: number
  hi: number
}

// Faixas de valor venal do imóvel (R$). hi é inclusivo; usar BETWEEN lo AND hi.
export const FAIXAS_VENAL: FaixaVenal[] = [
  { id: 1, label: 'Até R$ 100 mil', lo: 0, hi: 99999 },
  { id: 2, label: 'R$ 100 a 300 mil', lo: 100000, hi: 299999 },
  { id: 3, label: 'R$ 300 a 500 mil', lo: 300000, hi: 499999 },
  { id: 4, label: 'R$ 500 mil a 1 mi', lo: 500000, hi: 999999 },
  { id: 5, label: 'Acima de R$ 1 mi', lo: 1000000, hi: 999999999999 },
]

export function lerFiltros(sp: URLSearchParams): FiltrosImob {
  const ano = sp.get('ano')
  const faixa = sp.get('faixa')
  return {
    ano: ano ? Number(ano) : '',
    faixa: faixa ? Number(faixa) : '',
  }
}

// Cláusula extra para restringir o cadastro a uma faixa de venal (numérico, seguro).
export function faixaWhere(faixa: number | ''): string {
  const f = FAIXAS_VENAL.find(x => x.id === faixa)
  return f ? ` AND vl_venal_imovel BETWEEN ${f.lo} AND ${f.hi}` : ''
}

// Expressão CASE (numérica, com BETWEEN) que classifica cada lançamento na faixa.
export const FAIXA_CASE = `(CASE ${FAIXAS_VENAL.map(
  f => `WHEN vl_venal_imovel BETWEEN ${f.lo} AND ${f.hi} THEN ${f.id}`
).join(' ')} END)`
