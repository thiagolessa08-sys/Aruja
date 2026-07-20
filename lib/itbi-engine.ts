// Motor tributário do ITBI (cd_tributo = 10) — espelha o bucketsIptu do IPTU, mas com a
// ponte guia.cd_origem = itbi.cd_itbi (1:1, sem fan-out) e os filtros das queries oficiais
// de referência (03/07/26). NÃO junta tb_dsod_itbi_imovel_urbano nos agregados (é 1:N e
// inflaria o valor); só junta tb_dsod_itbi para o filtro vl_total > 0.
//
// Métricas por exercício de lançamento (no_exercicio_lancamento), consistente com o IPTU:
//   • lancado      = SUM(vl_movimento) mov 1,2,3, parcela<>0, guia fora de Recalculo/Validacao
//   • arrecadado   = baixas 11,14 · lanc 0,4,7,10 · exclui Estorno de Baixa e Cancelada
//   • emAberto     = net (vl_movimento*no_sinal) por (devedor,vencimento) HAVING net>0
//   • inadimplente = idem, só vencidos (dt_vencimento < hoje-1) HAVING net>1
//   • suspenso     = SUM(vl_movimento) mov 20
//   • isento       = "Não Incidência de ITBI" (via tb_extr_isencoes; requer permissão)
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const ITBI = '10'
const num = (v: unknown) => Number(v) || 0

// Ponte 1:1 guia→itbi (sem fan-out) + filtro de ITBI com imposto (vl_total>0).
const JITBI = `JOIN ${S}.tb_dsod_itbi it ON it.cd_itbi = g.cd_origem`
// movimentos/lançamentos aceitos no cálculo de em aberto / inadimplência (referência 03/07)
const MOV_ABERTO = '0,1,2,3,11,12,14,20'
const LANC_ABERTO = '0,4,7,10,1'

export interface BucketsItbiAno {
  lancado: number
  arrecadado: number
  emAberto: number        // a receber (todos net>0)
  inadimplente: number    // vencido (net>1)
  isento: number
  suspenso: number
}

const zeroBucket = (): BucketsItbiAno => ({ lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 })

// Piso de exercício para os cálculos "net" (em aberto/inadimplência) — limita custo. Os
// KPIs e a evolução mostram os últimos ~5 anos, então 2019 cobre com folga.
const EX_FLOOR = 2019

export async function bucketsItbi(): Promise<Map<number, BucketsItbiAno>> {
  return cached('bucketsItbi', TTL_15MIN, bucketsItbiRaw)
}

async function bucketsItbiRaw(): Promise<Map<number, BucketsItbiAno>> {
  // net por (exercício, devedor, vencimento) → soma por exercício. vencido = só parcelas vencidas.
  const qNet = (vencido: boolean) => `SELECT ex, SUM(valor) vl FROM (
      SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento*pm.no_sinal) valor
      FROM ${S}.tb_dsod_guias g ${JITBI}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${ITBI} AND g.no_exercicio_lancamento >= ${EX_FLOOR} AND p.no_parcela <> 0
        AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})
        AND it.vl_total > 0${vencido ? ' AND p.dt_vencimento < getdate()-1' : ''}
      GROUP BY g.no_exercicio_lancamento, g.cd_devedor, p.dt_vencimento
      HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${vencido ? '1' : '0'}
    ) t GROUP BY ex`

  const [lancR, arrecR, abertoR, inadR, suspR] = await Promise.all([
    // Lançado — mov 1,2,3
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g ${JITBI}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${ITBI} AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND it.vl_total > 0
      GROUP BY g.no_exercicio_lancamento`, 200),
    // Arrecadado — baixas 11,14 · lanc 0,4,7,10 · exclui Estorno de Baixa e guia Cancelada
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g ${JITBI}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE g.cd_tributo = ${ITBI} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
        AND p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao','Cancelada')
        AND tb.ds_tipo_baixa <> 'Estorno de Baixa' AND it.vl_total > 0
      GROUP BY g.no_exercicio_lancamento`, 200),
    agentQuery(qNet(false), 200),
    agentQuery(qNet(true), 200),
    // Suspenso — mov 20
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g ${JITBI}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${ITBI} AND pm.cd_tipo_movimento = 20 AND p.no_parcela <> 0 AND it.vl_total > 0
      GROUP BY g.no_exercicio_lancamento`, 200),
  ])

  const map = new Map<number, BucketsItbiAno>()
  const get = (ex: number) => map.get(ex) ?? zeroBucket()
  const okEx = (ex: number) => ex >= 2005 && ex <= 2035

  for (const r of lancR.rows) { const ex = num(r[0]); if (!okEx(ex)) continue; const b = get(ex); b.lancado = num(r[1]); map.set(ex, b) }
  for (const r of arrecR.rows) { const ex = num(r[0]); if (!okEx(ex)) continue; const b = get(ex); b.arrecadado = num(r[1]); map.set(ex, b) }
  for (const r of abertoR.rows) { const ex = num(r[0]); if (!okEx(ex)) continue; const b = get(ex); b.emAberto = Math.max(0, num(r[1])); map.set(ex, b) }
  for (const r of inadR.rows) { const ex = num(r[0]); if (!okEx(ex)) continue; const b = get(ex); b.inadimplente = Math.max(0, num(r[1])); map.set(ex, b) }
  for (const r of suspR.rows) { const ex = num(r[0]); if (!okEx(ex)) continue; const b = get(ex); b.suspenso = Math.max(0, num(r[1])); map.set(ex, b) }

  // Isento (não incidência) — best-effort: pode falhar por permissão em tb_extr_isencoes.
  const isento = await isentoItbiPorExercicio()
  if (isento) for (const [ex, v] of isento) { const b = get(ex); b.isento = v; map.set(ex, b) }

  return map
}

// Isento / Não Incidência de ITBI por exercício. Soma o vl_movimento (mov<=3) das guias cujo
// imóvel consta em tb_extr_isencoes com ds_isencao = 'Não Incidência de ITBI'. Requer permissão
// de SELECT na tabela — se negada, retorna null (fallback: card sem valor oficial).
async function isentoItbiPorExercicio(): Promise<Map<number, number> | null> {
  try {
    const r = await agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g ${JITBI}
      JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${ITBI} AND pm.cd_tipo_movimento <= 3 AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND iiu.cd_imovel_urbano IN (
          SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e WHERE e.ds_isencao IN ('Não Incidência de ITBI'))
      GROUP BY g.no_exercicio_lancamento`, 200)
    const map = new Map<number, number>()
    for (const row of r.rows) { const ex = num(row[0]); if (ex >= 2005 && ex <= 2035) map.set(ex, num(row[1])) }
    return map
  } catch {
    return null
  }
}

/**
 * Nº de transmissões (ITBIs com imposto) por exercício = COUNT(DISTINCT cd_itbi) das guias de
 * ITBI com vl_total>0, fora de Recalculo/Validacao. Análogo ao qtdImoveisIptu.
 */
export async function qtdTransmissoesItbi(): Promise<Map<number, number>> {
  return cached('qtdTransmissoesItbi', TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT g.no_exercicio_lancamento ex, COUNT(DISTINCT it.cd_itbi) qt
      FROM ${S}.tb_dsod_guias g ${JITBI}
      WHERE g.cd_tributo = ${ITBI} AND it.vl_total > 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY g.no_exercicio_lancamento`, 200)
    const map = new Map<number, number>()
    for (const row of r.rows) { const ex = num(row[0]); if (ex >= 2005 && ex <= 2035) map.set(ex, num(row[1])) }
    return map
  })
}

/**
 * Data de atualização dos dados de ITBI = MAX(dt_alter_ods) da tb_dsod_itbi. 'YYYY-MM-DD' ou null.
 */
export async function dataAtualizacaoItbi(): Promise<string | null> {
  return cached('dataAtualizItbi', TTL_15MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${S}.tb_dsod_itbi`, 1)
    const v = r.rows[0]?.[0]
    return v ? String(v).slice(0, 10) : null
  })
}
