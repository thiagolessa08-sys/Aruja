// Helpers de filtro do painel de Despesa.

const SCHEMA = 'pref_aruja_sp'

// Ano mínimo oficial da despesa.
export const ANO_MIN_DESPESA = 2023

// Unidades orçamentárias oficiais do painel de Despesa (conforme o portal):
// órgão executivo, secretarias 02.01.00 a 02.19.00 (exclui a raiz 02.00.00 e o Legislativo).
// O fato é tagueado no nível de sub-unidade (02.XX.YY), então filtramos por faixa de CD_UO
// via subquery na DIM_BIORC_INSTITUCIONAL (o agente aceita string/subquery).
export function whereUO(skCol = 'f.SK_INSTITUCIONAL'): string {
  return ` AND ${skCol} IN (SELECT i.SK_INSTITUCIONAL FROM ${SCHEMA}.DIM_BIORC_INSTITUCIONAL i WHERE i.CD_UO >= '02.01.00' AND i.CD_UO <= '02.19.99')`
}

const IND_COL: Record<string, string> = {
  Empenhado: 'VL_SALDO_MES_EMPENHADO',
  Liquidado: 'VL_SALDO_MES_LIQUIDADO',
  Pago: 'VL_SALDO_MES_PAGO',
}

// Coluna de execução para o indicador. Dotação Inicial/Atualizada não existem
// no grão mensal/secretaria, então caem para Liquidado nos gráficos de execução.
export function indCol(indicador: string | null | undefined): string {
  return (indicador && IND_COL[indicador]) || 'VL_SALDO_MES_LIQUIDADO'
}

export interface Filtros {
  ano: number | null
  mes: number | null
  secretaria: number | null
  indicador: string | null
}

export function lerFiltros(sp: URLSearchParams): Filtros {
  const ano = Number(sp.get('ano')) || null
  const mes = Number(sp.get('mes')) || null
  const secretaria = Number(sp.get('secretaria')) || null
  const indicador = sp.get('indicador')
  return { ano, mes, secretaria, indicador }
}

// Fragmento WHERE (assumindo aliases f = fato, d = calendário).
// Aplica SEMPRE o filtro oficial: ano >= 2023 e unidades orçamentárias 02.01–02.19.
export function whereExtra(f: Filtros): string {
  let w = ` AND d.NO_ANO >= ${ANO_MIN_DESPESA}` + whereUO('f.SK_INSTITUCIONAL')
  if (f.mes) w += ` AND d.NO_MES = ${f.mes}`
  if (f.secretaria) w += ` AND f.SK_INSTITUCIONAL = ${f.secretaria}`
  return w
}
