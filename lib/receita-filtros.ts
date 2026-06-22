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
