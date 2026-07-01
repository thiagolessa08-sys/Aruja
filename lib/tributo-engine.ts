import { agentQuery } from '@/lib/agent'
import { GrupoTributo, codigosDoGrupo, CODIGOS_CORE, CODIGOS_EXCLUIDOS } from '@/lib/tributos'
import { cached, TTL_15MIN } from '@/lib/cache'

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
  return cached(`serie:${grupo}:${anoMin}:${anoMax}`, TTL_15MIN, () => serieTributoRaw(grupo, anoMin, anoMax))
}

async function serieTributoRaw(grupo: GrupoTributo, anoMin: number, anoMax: number): Promise<SerieExercicio[]> {
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
  return cached(`rank:${somenteOutros}:${ano ?? 'all'}`, TTL_15MIN, () => rankingTributosRaw(somenteOutros, ano))
}

async function rankingTributosRaw(somenteOutros: boolean, ano?: number): Promise<RankTributo[]> {
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

/**
 * LANÇADO oficial (Regra 1): SUM(vl_movimento) de tb_dsod_parcela_movimento com
 * cd_tipo_movimento IN (1,2,3), no_parcela <> 0 e guia.ds_situacao fora de
 * ('Recalculo','Validacao'). Retorna o lançado por exercício de lançamento.
 * NÃO usa parcela_posicao.vl_lancto (modelo antigo).
 */
const LANC_SIT_EXCLUIR = new Set(['Recalculo', 'Validacao'])

export async function lancadoOficial(codigos: number[]): Promise<Map<number, number>> {
  return cached(`lancOf:${codigos.join('.')}`, TTL_15MIN, () => lancadoOficialRaw(codigos))
}

async function lancadoOficialRaw(codigos: number[]): Promise<Map<number, number>> {
  const r = await agentQuery(`
    SELECT g.no_exercicio_lancamento AS ex, g.ds_situacao AS sit, SUM(pm.vl_movimento) AS vl
    FROM ${SCHEMA}.tb_dsod_guias g
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
    JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
    WHERE g.cd_tributo IN (${codigos.join(',')})
      AND pm.cd_tipo_movimento IN (1, 2, 3)
      AND p.no_parcela NOT IN (0)
    GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 3000)

  const map = new Map<number, number>()
  for (const row of r.rows) {
    const ex = num(row[0])
    if (!(ex >= 2005 && ex <= 2035)) continue
    const sit = String(row[1] ?? '').trim()
    if (LANC_SIT_EXCLUIR.has(sit)) continue
    map.set(ex, (map.get(ex) ?? 0) + num(row[2]))
  }
  return map
}

/**
 * Buckets oficiais do IPTU (Regras 1-6, def. do usuário) por exercício de lançamento.
 * Tudo em cima de tb_dsod_parcela_movimento (vl_movimento / vl_movimento*no_sinal),
 * cd_tributo 1, no_parcela<>0. Adaptado às restrições do IQ (sem <=, <>, literal
 * de texto no WHERE, sem subquery/HAVING) — filtros de texto e sinal resolvidos em JS.
 */
export interface BucketsIptuAno {
  lancado: number
  arrecadado: number
  emAberto: number       // saldo em aberto total (a receber)
  inadimplente: number   // saldo em aberto vencido
  isento: number
  suspenso: number
}

const IPTU_COD = '1'

export async function bucketsIptu(): Promise<Map<number, BucketsIptuAno>> {
  return cached('bucketsIptu', TTL_15MIN, bucketsIptuRaw)
}

async function bucketsIptuRaw(): Promise<Map<number, BucketsIptuAno>> {
  const [lanc, arrecRows, viRows, isenRows, suspRows] = await Promise.all([
    lancadoOficial([1]),
    // Arrecadado: movimento 11,14 · lançamento 0,4,7,10 · exclui tipo_baixa 28 (Estorno)
    // · exclui guia Recalculo/Validacao (em JS).
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, g.ds_situacao AS sit, SUM(pm.vl_movimento) AS vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (11, 14)
        AND p.no_parcela NOT IN (0) AND pm.cd_tipo_lancamento IN (0, 4, 7, 10)
        AND pb.cd_tipo_baixa NOT IN (28)
      GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 400),
    // Em Aberto (todos) + Inadimplente (vencidos) — net por ano/mês de vencimento.
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, YEAR(p.dt_vencimento) AS vy, MONTH(p.dt_vencimento) AS vm,
             SUM(pm.vl_movimento * pm.no_sinal) AS net
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (0, 1, 2, 3, 11, 12, 14, 20)
        AND p.no_parcela NOT IN (0) AND pm.cd_tipo_lancamento IN (0, 4, 7, 10, 1)
      GROUP BY g.no_exercicio_lancamento, YEAR(p.dt_vencimento), MONTH(p.dt_vencimento)`, 4000),
    // Isento: movimento 12,5 · lançamento 1 · setor de origem da baixa = 'Isencao' (filtro em JS).
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, pb.ds_setor_origem_baixa AS setor, SUM(pm.vl_movimento) AS vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (12, 5)
        AND pm.cd_tipo_lancamento IN (1) AND p.no_parcela NOT IN (0)
      GROUP BY g.no_exercicio_lancamento, pb.ds_setor_origem_baixa`, 400),
    // Suspenso: movimento 20 · valor = |net| (devedores com net<0). Aproximado por -SUM(net).
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, SUM(pm.vl_movimento * pm.no_sinal) AS net
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (20) AND p.no_parcela NOT IN (0)
      GROUP BY g.no_exercicio_lancamento`, 200),
  ])

  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1
  const get = (m: Map<number, BucketsIptuAno>, ex: number) =>
    m.get(ex) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
  const map = new Map<number, BucketsIptuAno>()

  // Lançado
  for (const [ex, v] of lanc) { const b = get(map, ex); b.lancado = v; map.set(ex, b) }
  // Arrecadado (exclui Recalculo/Validacao)
  for (const row of arrecRows.rows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    if (LANC_SIT_EXCLUIR.has(String(row[1] ?? '').trim())) continue
    const b = get(map, ex); b.arrecadado += num(row[2]); map.set(ex, b)
  }
  // Em Aberto (todos) + Inadimplente (vencidos)
  for (const row of viRows.rows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    const vy = num(row[1]), vm = num(row[2]), net = num(row[3])
    const b = get(map, ex)
    b.emAberto += net
    if (vy < curY || (vy === curY && vm < curM)) b.inadimplente += net
    map.set(ex, b)
  }
  // Isento (só setor 'Isencao')
  for (const row of isenRows.rows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    if (String(row[1] ?? '').trim() !== 'Isencao') continue
    const b = get(map, ex); b.isento += num(row[2]); map.set(ex, b)
  }
  // Suspenso (= -net, clamp >= 0)
  for (const row of suspRows.rows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    const b = get(map, ex); b.suspenso = Math.max(0, -num(row[1])); map.set(ex, b)
  }

  // Clamp de valores que não fazem sentido negativos
  for (const b of map.values()) {
    b.emAberto = Math.max(0, b.emAberto)
    b.inadimplente = Math.max(0, b.inadimplente)
  }
  return map
}

/**
 * Quantidade de imóveis lançados de IPTU por exercício = COUNT(DISTINCT cd_guia) na base oficial
 * de lançamento (cd_tributo 1, no_parcela<>0, exclui guia Recalculo/Validacao).
 */
export async function qtdImoveisIptu(): Promise<Map<number, number>> {
  return cached('qtdImoveisIptu', TTL_15MIN, async () => {
    // Cada guia de IPTU = um imóvel lançado no exercício. Conta direto na tabela de guias
    // (sem join com parcelas — evita 502 por peso), excluindo Recalculo/Validacao (em JS).
    const r = await agentQuery(`
      SELECT no_exercicio_lancamento AS ex, ds_situacao AS sit, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE cd_tributo IN (1)
      GROUP BY no_exercicio_lancamento, ds_situacao`, 400)
    const map = new Map<number, number>()
    for (const row of r.rows) {
      const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
      if (LANC_SIT_EXCLUIR.has(String(row[1] ?? '').trim())) continue
      map.set(ex, (map.get(ex) ?? 0) + num(row[2]))
    }
    return map
  })
}

/**
 * Split do saldo devedor por exercício em VENCIDO (inadimplência) × A VENCER (em aberto),
 * comparando a data de vencimento da parcela com hoje. Agrupa por ano/mês de vencimento
 * (evita operador < no SQL, que quebra o agente IQ) e classifica em JS.
 */
export async function saldoVencidoAberto(grupo: GrupoTributo): Promise<Map<number, { vencido: number; aberto: number }>> {
  return cached(`saldoVA:${grupo}`, TTL_15MIN, () => saldoVAraw(grupo))
}

async function saldoVAraw(grupo: GrupoTributo): Promise<Map<number, { vencido: number; aberto: number }>> {
  const r = await agentQuery(`
    SELECT g.no_exercicio_lancamento AS ex, YEAR(p.dt_vencimento) AS vy, MONTH(p.dt_vencimento) AS vm,
           SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    WHERE ${whereTributo(grupo)}
    GROUP BY g.no_exercicio_lancamento, YEAR(p.dt_vencimento), MONTH(p.dt_vencimento)`, 6000)

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const map = new Map<number, { vencido: number; aberto: number }>()
  for (const row of r.rows) {
    const ex = num(row[0])
    if (!(ex >= 2005 && ex <= 2035)) continue
    const vy = num(row[1]), vm = num(row[2]), saldo = num(row[3])
    if (saldo <= 0) continue
    const cur = map.get(ex) ?? { vencido: 0, aberto: 0 }
    const vencido = vy < curY || (vy === curY && vm < curM)
    if (vencido) cur.vencido += saldo
    else cur.aberto += saldo
    map.set(ex, cur)
  }
  return map
}
