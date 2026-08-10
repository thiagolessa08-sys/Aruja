// Filtros da tela de Contribuinte (tabela flat tb_dsod_contribuinte)
// Restrição IQ: nada de literal de texto no WHERE → GROUP BY + filtro em JS.

import { agentQuery } from './agent'
import { cached, TTL_15MIN } from './cache'

const SCHEMA = 'pref_aruja_sp'

// Data de atualização dos dados = MAX(dt_alter_ods) da base de contribuintes.
export async function dataAtualizacaoContribuinte(): Promise<string | null> {
  return cached('dataAtualizContribuinte', TTL_15MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${SCHEMA}.tb_dsod_contribuinte`, 1)
    const v = r.rows[0]?.[0]
    if (!v) return null
    return String(v).slice(0, 10) // 'YYYY-MM-DD'
  })
}

export interface FiltrosContribuinte {
  ano: number | ''      // ano de inscrição (dt_inscr) em destaque / exercício de lançamento (guias)
  pessoa: '' | 'F' | 'J' // tipo de pessoa
  mes: number | ''       // mês (acumulado) — parcelas com vencimento até o mês informado
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
  const mesRaw = Number(sp.get('mes'))
  const mes = mesRaw >= 1 && mesRaw <= 12 ? mesRaw : ''
  return { ano, pessoa, mes }
}
