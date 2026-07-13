// Helpers de filtro do painel de Receita.
// Ano e Mês são numéricos (seguros no WHERE). Espécie é texto: o agente do IQ
// quebra com string literal em WHERE, então a espécie é filtrada em JS após
// agregar por DS_ESPECIE_RECEITA.

import { ALINEA_TO_GRUPO } from './receita-grupo-alinea'

export interface FiltrosReceita {
  ano: number | null
  mes: number | null
  alinea: string | null   // filtro "Impostos e Taxas" — nível 1 = GRUPO ALÍNEA (planilha do BO)
  natureza: string | null // filtro "Impostos e Taxas" — nível 2 (DS_NATUREZA_RECEITA)
}

// ——— Grupo Alínea (1º nível do filtro "Impostos e Taxas"), conforme a planilha do BO ———
// A alínea completa do banco (DS_ALINEA_RECEITA) é agrupada num "Grupo Alínea"; a alínea
// em si não aparece no filtro. Normaliza (acentos/caixa/espaços) para casar o texto do banco
// com a chave da planilha.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')
function normAlinea(s: string): string {
  return s.normalize('NFD').replace(DIACRITICOS, '').replace(/\s+/g, ' ').trim().toUpperCase()
}
const ALINEA_NORM_TO_GRUPO: Record<string, string> = {}
for (const [ali, grupo] of Object.entries(ALINEA_TO_GRUPO)) ALINEA_NORM_TO_GRUPO[normAlinea(ali)] = grupo

// Grupo de uma alínea do banco. Sem mapeamento → a própria alínea (fallback).
export function grupoDaAlinea(alinea: string): string {
  return ALINEA_NORM_TO_GRUPO[normAlinea(alinea)] ?? alinea.trim()
}

// Grupo → alíneas que o compõem (para expandir o WHERE do nível 1).
export const GRUPO_TO_ALINEAS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  for (const [ali, grupo] of Object.entries(ALINEA_TO_GRUPO)) (m[grupo] ??= []).push(ali)
  return m
})()

export function lerFiltros(sp: URLSearchParams): FiltrosReceita {
  const ano = Number(sp.get('ano')) || null
  const mes = Number(sp.get('mes')) || null
  const alinea = sp.get('alinea')
  const natureza = sp.get('natureza')
  return {
    ano, mes,
    alinea: alinea && alinea !== 'TODAS' ? alinea : null,
    natureza: natureza && natureza !== 'TODAS' ? natureza : null,
  }
}

// WHERE numérico (alias d = calendário).
export function whereMes(f: FiltrosReceita): string {
  return f.mes ? ` AND d.NO_MES = ${f.mes}` : ''
}

const esc = (s: string) => s.replace(/'/g, "''")

// Filtro "Impostos e Taxas" — nível 2 (natureza) tem prioridade; senão nível 1 (GRUPO alínea).
// O agente aceita literal de texto; escapa aspas simples. Alias nr = DIM_BIORC_NATUREZA_RECEITA.
// Nível 1 = Grupo Alínea (planilha) → expande para as alíneas que o compõem (IN).
export function whereImpostoTaxa(f: FiltrosReceita): string {
  if (f.natureza) return ` AND nr.DS_NATUREZA_RECEITA = '${esc(f.natureza)}'`
  if (f.alinea) {
    const alineas = GRUPO_TO_ALINEAS[f.alinea] ?? [f.alinea]
    const inList = alineas.map(a => `'${esc(a)}'`).join(', ')
    return ` AND nr.DS_ALINEA_RECEITA IN (${inList})`
  }
  return ''
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
