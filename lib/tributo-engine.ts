import { agentQuery } from '@/lib/agent'
import { GrupoTributo, codigosDoGrupo, CODIGOS_CORE, CODIGOS_EXCLUIDOS } from '@/lib/tributos'

const SCHEMA = 'pref_aruja_sp'
const EXCL = [...CODIGOS_CORE, ...CODIGOS_EXCLUIDOS].join(',')

export interface SerieExercicio {
  ano: number
  lancado: number
  arrecadado: number
  saldo: number        // inadimplência (vl_saldo)
  isencao: number
  suspenso: number
}

const num = (v: unknown) => Number(v) || 0

// Cláusula de filtro por grupo de tributo (cd_tributo é numérico → IN seguro).
// "outros" = todos os códigos que NÃO são cobertos por abas dedicadas.
function whereTributo(grupo: GrupoTributo): string {
  if (grupo === 'outros') {
    return `g.cd_tributo NOT IN (${EXCL})`
  }
  const cods = codigosDoGrupo(grupo)
  return `g.cd_tributo IN (${cods.join(',')})`
}

/**
 * Série anual de lançado/arrecadado/saldo por exercício de lançamento para um grupo.
 * Motor: tb_dsod_parcela_posicao (vl_lancto/vl_pagto/vl_saldo) → parcelas → guias.
 */
export async function serieTributo(grupo: GrupoTributo, anoMin = 2018, anoMax = new Date().getFullYear()): Promise<SerieExercicio[]> {
  const r = await agentQuery(`
    SELECT g.no_exercicio_lancamento AS ex,
           SUM(pp.vl_lancto) AS lancado,
           SUM(pp.vl_pagto) AS pago,
           SUM(pp.vl_saldo) AS saldo,
           SUM(pp.vl_isencao) AS isencao,
           SUM(pp.vl_suspenso) AS suspenso
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    WHERE ${whereTributo(grupo)}
    GROUP BY g.no_exercicio_lancamento`, 200)

  return r.rows
    .map(row => ({
      ano: num(row[0]),
      lancado: num(row[1]),
      arrecadado: num(row[2]),
      saldo: num(row[3]),
      isencao: num(row[4]),
      suspenso: num(row[5]),
    }))
    .filter(s => s.ano >= anoMin && s.ano <= anoMax)
    .filter(s => !(s.lancado === 0 && s.arrecadado === 0 && s.saldo === 0)) // descarta anos futuros vazios
    .sort((a, b) => a.ano - b.ano)
}

/**
 * Ranking de tributos (cd_tributo + nome) por lançado/arrecadado/saldo,
 * usado na aba "Outros Tributos". Junta com tb_dsod_tributos para o rótulo.
 */
export interface RankTributo {
  cd: number
  nome: string
  lancado: number
  arrecadado: number
  saldo: number
}

export async function rankingTributos(somenteOutros = true, ano?: number): Promise<RankTributo[]> {
  const filtroAno = ano ? `AND g.no_exercicio_lancamento = ${ano}` : ''
  const filtroGrupo = somenteOutros
    ? `g.cd_tributo NOT IN (${EXCL})`
    : `g.cd_tributo NOT IN (${CODIGOS_EXCLUIDOS.join(',')})`

  const r = await agentQuery(`
    SELECT g.cd_tributo AS cd, t.ds_tributo AS nome,
           SUM(pp.vl_lancto) AS lancado,
           SUM(pp.vl_pagto) AS pago,
           SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    WHERE ${filtroGrupo} ${filtroAno}
    GROUP BY g.cd_tributo, t.ds_tributo`, 200)

  return r.rows
    .map(row => ({
      cd: num(row[0]),
      nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`,
      lancado: num(row[2]),
      arrecadado: num(row[3]),
      saldo: num(row[4]),
    }))
    .sort((a, b) => b.lancado - a.lancado)
}
