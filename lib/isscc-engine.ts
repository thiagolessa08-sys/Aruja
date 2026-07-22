// Motor tributário do ISSCC — ISS Construção Civil (cd_tributo IN 40,17,18; 40 é o principal,
// 17/18 são legado de 2003). Mesmo padrão do IPTU/TCA. Ponte guia.cd_origem = imovel.cd_imovel_urbano
// (confirmada: 619/621 casam). Isento via tb_extr_isencoes filtrando pelo cd_tributo do ISSCC.
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const ISSCC = '40,17,18'
const LANC_SIT_EXCLUIR = new Set(['Recalculo', 'Validacao'])

export interface BucketsIssccAno {
  lancado: number
  arrecadado: number
  emAberto: number
  inadimplente: number
  isento: number
  suspenso: number
}

const MOV_ABERTO = '0,1,2,3,11,12,14,20', LANC_ABERTO = '0,4,7,10,1'
function qEmAbertoInad(vencido: boolean, exFloor = 2016): string {
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? '1' : '0'
  return `SELECT ex, SUM(valor) vl FROM (
      SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${ISSCC}) AND g.no_exercicio_lancamento >= ${exFloor} AND p.no_parcela <> 0
        AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}
      GROUP BY g.no_exercicio_lancamento, g.cd_devedor
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > ${th}
    ) t GROUP BY ex`
}

export async function bucketsIsscc(): Promise<Map<number, BucketsIssccAno>> {
  return cached('bucketsIsscc', TTL_15MIN, bucketsIssccRaw)
}

async function bucketsIssccRaw(): Promise<Map<number, BucketsIssccAno>> {
  const [lancR, arrecR, abertoR, inadR, isenR, suspR] = await Promise.all([
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${ISSCC}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
      GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 600),
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE g.cd_tributo IN (${ISSCC}) AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
        AND p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
      GROUP BY g.no_exercicio_lancamento`, 300),
    agentQuery(qEmAbertoInad(false), 300),
    agentQuery(qEmAbertoInad(true), 300),
    // Isento: devedores com isenção do próprio tributo ISSCC. try/catch (permissão).
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${ISSCC}) AND pm.cd_tipo_movimento <= 3 AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND g.cd_devedor IN (SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e WHERE e.cd_tributo IN (${ISSCC}))
      GROUP BY g.no_exercicio_lancamento`, 300).catch(() => null),
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${ISSCC}) AND pm.cd_tipo_movimento IN (20) AND p.no_parcela <> 0
      GROUP BY g.no_exercicio_lancamento`, 300),
  ])

  const map = new Map<number, BucketsIssccAno>()
  const get = (ex: number) => map.get(ex) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
  const ok = (ex: number) => ex >= 2005 && ex <= 2035

  for (const r of lancR.rows) {
    const ex = num(r[0]); if (!ok(ex)) continue
    if (LANC_SIT_EXCLUIR.has(String(r[1] ?? '').trim())) continue
    const b = get(ex); b.lancado += num(r[2]); map.set(ex, b)
  }
  for (const r of arrecR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.arrecadado = num(r[1]); map.set(ex, b) }
  for (const r of abertoR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.emAberto = Math.max(0, num(r[1])); map.set(ex, b) }
  for (const r of inadR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.inadimplente = Math.max(0, num(r[1])); map.set(ex, b) }
  if (isenR) for (const r of isenR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.isento = num(r[1]); map.set(ex, b) }
  for (const r of suspR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.suspenso = Math.max(0, num(r[1])); map.set(ex, b) }
  return map
}

/**
 * Buckets do ISSCC ACUMULADOS até um mês (vencimento da parcela <= mês), por exercício.
 * Espelha bucketsIptuAteMes/bucketsItbiAteMes. Isento/suspenso NÃO usam mês (mesma
 * convenção do IPTU/ITBI — são buckets anuais/posição, não fluxo acumulável).
 */
export interface BucketAteMesIsscc { lancado: number; arrecadado: number; emAberto: number; inadimplente: number }

function qAteMesIsscc(vencido: boolean, mes: number): string {
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? '1' : '0'
  return `SELECT ex, SUM(valor) vl FROM (
      SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${ISSCC}) AND g.no_exercicio_lancamento >= 2016 AND p.no_parcela <> 0
        AND MONTH(p.dt_vencimento) <= ${mes}
        AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}
      GROUP BY g.no_exercicio_lancamento, g.cd_devedor
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > ${th}
    ) t GROUP BY ex`
}

export async function bucketsIssccAteMes(mes: number): Promise<Map<number, BucketAteMesIsscc>> {
  return cached(`bucketsIssccAteMes:${mes}`, TTL_15MIN, async () => {
    const [lancR, arrecR, abertoR, inadR] = await Promise.all([
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
        FROM ${S}.tb_dsod_guias g
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (${ISSCC}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
          AND MONTH(p.dt_vencimento) <= ${mes}
        GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 600),
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
        FROM ${S}.tb_dsod_guias g
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
        WHERE g.cd_tributo IN (${ISSCC}) AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
          AND p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
          AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
          AND MONTH(p.dt_vencimento) <= ${mes}
        GROUP BY g.no_exercicio_lancamento`, 300),
      agentQuery(qAteMesIsscc(false, mes), 300),
      agentQuery(qAteMesIsscc(true, mes), 300),
    ])
    const map = new Map<number, BucketAteMesIsscc>()
    const get = (ex: number) => map.get(ex) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0 }
    const ok = (ex: number) => ex >= 2005 && ex <= 2035
    for (const r of lancR.rows) {
      const ex = num(r[0]); if (!ok(ex)) continue
      if (LANC_SIT_EXCLUIR.has(String(r[1] ?? '').trim())) continue
      const b = get(ex); b.lancado += num(r[2]); map.set(ex, b)
    }
    for (const r of arrecR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.arrecadado = num(r[1]); map.set(ex, b) }
    for (const r of abertoR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.emAberto = Math.max(0, num(r[1])); map.set(ex, b) }
    for (const r of inadR.rows) { const ex = num(r[0]); if (!ok(ex)) continue; const b = get(ex); b.inadimplente = Math.max(0, num(r[1])); map.set(ex, b) }
    return map
  })
}

/** Quantidade de guias/lançamentos de ISSCC por exercício (exclui Recalculo/Validacao). */
export async function qtdIsscc(): Promise<Map<number, number>> {
  return cached('qtdIsscc', TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT no_exercicio_lancamento ex, ds_situacao sit, COUNT(*) qt
      FROM ${S}.tb_dsod_guias WHERE cd_tributo IN (${ISSCC})
      GROUP BY no_exercicio_lancamento, ds_situacao`, 600)
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
 * Item 2 — Histórico de alterações de área edificada por ano (para cruzar com ISSCC).
 * Fonte: tb_dsod_imovel_urbano_alt_estrutura (registra cada alteração estrutural do imóvel,
 * com dt_alteracao). A metragem vem da área edificada ATUAL do imóvel (vl_area_edificaca),
 * somada 1× por imóvel/ano (MAX por imóvel para não multiplicar por nº de alterações).
 */
export interface AreaAno { imoveisAlterados: number; areaEdificada: number }

export async function historicoAreaEdificada(): Promise<Map<number, AreaAno>> {
  return cached('issccAreaHist', TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT ano, COUNT(*) imoveis, SUM(area) area FROM (
        SELECT YEAR(ae.dt_alteracao) ano, ae.cd_imovel_urbano, MAX(iu.vl_area_edificaca) area
        FROM ${S}.tb_dsod_imovel_urbano_alt_estrutura ae
        JOIN ${S}.tb_dsod_imovel_urbano iu ON iu.cd_imovel_urbano = ae.cd_imovel_urbano
        WHERE ae.dt_alteracao IS NOT NULL
        GROUP BY YEAR(ae.dt_alteracao), ae.cd_imovel_urbano
      ) t GROUP BY ano`, 60)
    const map = new Map<number, AreaAno>()
    for (const row of r.rows) {
      const ano = num(row[0]); if (!(ano >= 2005 && ano <= 2035)) continue
      map.set(ano, { imoveisAlterados: num(row[1]), areaEdificada: num(row[2]) })
    }
    return map
  })
}

/** Data de atualização (carga) = MAX(dt_alter_ods) das guias de ISSCC. */
export async function dataAtualizacaoIsscc(): Promise<string | null> {
  return cached('dataAtualizIsscc', TTL_15MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${S}.tb_dsod_guias WHERE cd_tributo IN (${ISSCC})`, 1)
    const v = r.rows[0]?.[0]
    return v ? String(v).slice(0, 10) : null
  })
}
