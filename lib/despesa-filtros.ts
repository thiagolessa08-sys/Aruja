// Helpers de filtro do painel de Despesa.
// IMPORTANTE: o agente do Sybase IQ retorna 500 com QUALQUER string literal em WHERE,
// por isso todos os filtros aqui são numéricos (NO_ANO, NO_MES, SK_INSTITUCIONAL).

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

// Fragmento WHERE (assumindo aliases f = fato, d = calendário) — só números.
export function whereExtra(f: Filtros): string {
  let w = ''
  if (f.mes) w += ` AND d.NO_MES = ${f.mes}`
  if (f.secretaria) w += ` AND f.SK_INSTITUCIONAL = ${f.secretaria}`
  return w
}
