// Filtros da tela de Contribuinte (tabela flat tb_dsod_contribuinte)
// Restrição IQ: nada de literal de texto no WHERE → GROUP BY + filtro em JS.

export interface FiltrosContribuinte {
  ano: number | ''      // ano de inscrição (dt_inscr) em destaque
  pessoa: '' | 'F' | 'J' // tipo de pessoa
}

export interface PessoaOpt { id: 'F' | 'J'; label: string }

export const PESSOAS: PessoaOpt[] = [
  { id: 'F', label: 'Pessoa Física' },
  { id: 'J', label: 'Pessoa Jurídica' },
]

// Setores de cobrança (tb_dsod_devedor_contribuinte.ds_setor_devedor).
// "Contribuinte" = base inteira (não é pendência real) → excluído da análise.
export const SETOR_LABEL: Record<string, string> = {
  CobrancaAcumulada: 'Cobrança Acumulada',
  Mobiliario: 'Mobiliário (ISS)',
  Certidao: 'Certidões',
  Imobiliario: 'Imobiliário (IPTU)',
  Itbi: 'ITBI',
  TaxasDiversas: 'Taxas Diversas',
  Projetos: 'Projetos / Obras',
}
export const SETORES_OCULTOS = new Set(['Contribuinte'])

export function lerFiltros(sp: URLSearchParams): FiltrosContribuinte {
  const anoRaw = sp.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : ''
  const p = sp.get('pessoa')
  const pessoa = p === 'F' || p === 'J' ? p : ''
  return { ano, pessoa }
}
