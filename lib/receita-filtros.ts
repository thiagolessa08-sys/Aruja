// Helpers de filtro do painel de Receita.
// Ano e Mês são numéricos (seguros no WHERE). Espécie é texto: o agente do IQ
// quebra com string literal em WHERE, então a espécie é filtrada em JS após
// agregar por DS_ESPECIE_RECEITA.

export interface FiltrosReceita {
  ano: number | null
  mes: number | null
  especie: string | null
}

export function lerFiltros(sp: URLSearchParams): FiltrosReceita {
  const ano = Number(sp.get('ano')) || null
  const mes = Number(sp.get('mes')) || null
  const especie = sp.get('especie')
  return { ano, mes, especie: especie && especie !== 'TODAS' ? especie : null }
}

// WHERE numérico (alias d = calendário). Espécie NÃO entra aqui (filtrada em JS).
export function whereMes(f: FiltrosReceita): string {
  return f.mes ? ` AND d.NO_MES = ${f.mes}` : ''
}

// Ano mínimo da receita oficial (regra do Ronaldo).
export const ANO_MIN_RECEITA = 2023

// Filtro OFICIAL de receita — definição do Ronaldo (aplica em KPIs, gráficos e chat):
//   • Receita BRUTA (CD_TIPO_NATUREZA_RECEITA = 1)
//   • Fichas de receita < 5000
//   • Categorias econômicas válidas (exclui '-1' e '-3')
//   • A partir de 2023
// Aliases exigidos no FROM da consulta:
//   f  = FATO_BIORC_EXECUCAO_RECEITA
//   tn = DIM_BIORC_TIPO_NATUREZA_RECEITA
//   nr = DIM_BIORC_NATUREZA_RECEITA
//   d  = DIM_BIORC_DATA_CALENDARIO
export const WHERE_RECEITA_OFICIAL =
  ` AND tn.CD_TIPO_NATUREZA_RECEITA = 1` +
  ` AND f.CD_FICHA_RECEITA < 5000` +
  ` AND nr.CD_CATEGORIA_ECONOMICA_RECEITA NOT IN ('-1','-3')` +
  ` AND d.NO_ANO >= ${ANO_MIN_RECEITA}`
