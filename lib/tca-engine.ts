// Motor tributário da TCA — Taxa de Coleta (cd_tributo = 67). Mesmo padrão do IPTU,
// conforme queries de referência do usuário. Tributo por imóvel (sem join de itbi).
// Isento usa tb_extr_isencoes.ds_tipo_isencao = 'IsentoTaxas' (regra própria da TCA).
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const TCA = '67'
const LANC_SIT_EXCLUIR = new Set(['Recalculo', 'Validacao'])

// Filtro por bairro/rua/imóvel — mesma ponte guia→imóvel (g.cd_origem) já validada em
// resumoTca e no motor "TCA por Bairro" (lib/bairros-tributo.ts). Usado para fazer a
// "Evolução da TCA" (bucketsTca/bucketsTcaAteMes/qtdImoveisTca) interagir com o drill do
// gráfico "TCA por Bairro".
export interface FiltrosTca { bairro?: string | null; rua?: string | null; imovel?: number | null }
function filtroImovelTca(f: FiltrosTca) {
  const tem = !!(f.bairro || f.rua || f.imovel)
  if (!tem) return { join: '', where: '' }
  const precisaCep = !!(f.bairro || f.rua)
  let join = `JOIN ${S}.tb_dsod_imovel_urbano iu ON g.cd_origem = iu.cd_imovel_urbano`
  if (precisaCep) join += ` JOIN ${S}.tb_dsod_cep ce ON iu.cd_cep = ce.cd_cep`
  let where = ''
  if (f.bairro) where += ` AND ce.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  if (f.rua) where += ` AND ce.ds_endereco = '${f.rua.replace(/'/g, "''")}'`
  if (f.imovel) where += ` AND g.cd_origem = ${f.imovel}`
  return { join, where }
}
function chaveFiltro(f: FiltrosTca) { return `${f.bairro ?? ''}:${f.rua ?? ''}:${f.imovel ?? ''}` }

export interface BucketsTcaAno {
  lancado: number
  arrecadado: number
  emAberto: number       // a receber total (net > 0 por devedor)
  inadimplente: number   // vencido (net > 1, dt_vencimento < hoje-1)
  isento: number
  suspenso: number
}

// Em aberto (net>0) / inadimplência (vencido net>1) por exercício. A referência da TCA
// agrupa o net por cd_devedor (sem vencimento). Floor de exercício por custo.
const MOV_ABERTO = '0,1,2,3,11,12,14,20', LANC_ABERTO = '0,4,7,10,1'
function qEmAbertoInad(vencido: boolean, f: FiltrosTca, exFloor = 2016): string {
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? '1' : '0'
  const { join, where } = filtroImovelTca(f)
  return `SELECT ex, SUM(valor) vl FROM (
      SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${S}.tb_dsod_guias g
      ${join}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${TCA} AND g.no_exercicio_lancamento >= ${exFloor} AND p.no_parcela <> 0
        AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}${where}
      GROUP BY g.no_exercicio_lancamento, g.cd_devedor
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > ${th}
    ) t GROUP BY ex`
}

// Sem filtro (bairro/rua/imóvel), usa o cache compartilhado; com filtro, cache próprio.
export async function bucketsTca(f: FiltrosTca = {}): Promise<Map<number, BucketsTcaAno>> {
  if (!(f.bairro || f.rua || f.imovel)) return cached('bucketsTca', TTL_15MIN, () => bucketsTcaRaw(f))
  return cached(`bucketsTca:${chaveFiltro(f)}`, TTL_15MIN, () => bucketsTcaRaw(f))
}

async function bucketsTcaRaw(f: FiltrosTca): Promise<Map<number, BucketsTcaAno>> {
  const { join, where } = filtroImovelTca(f)
  const [lancR, arrecR, abertoR, inadR, isenR, suspR] = await Promise.all([
    // Lançado: mov 1,2,3 · exclui Recalculo/Validacao (em JS)
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      ${join}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${TCA} AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0${where}
      GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 400),
    // Arrecadado: mov 11,14 · lanc 0,4,7,10 · tipo_baixa <> Estorno · exclui Recalculo/Validacao
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      ${join}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE g.cd_tributo = ${TCA} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
        AND p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND tb.ds_tipo_baixa <> 'Estorno de Baixa'${where}
      GROUP BY g.no_exercicio_lancamento`, 200),
    agentQuery(qEmAbertoInad(false, f), 200),
    agentQuery(qEmAbertoInad(true, f), 200),
    // Isento (IsentoTaxas): mov<=3 dos devedores com isenção de taxas. try/catch (permissão).
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      ${join}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${TCA} AND pm.cd_tipo_movimento <= 3 AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND g.cd_devedor IN (SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e WHERE e.ds_tipo_isencao IN ('IsentoTaxas'))${where}
      GROUP BY g.no_exercicio_lancamento`, 200).catch(() => null),
    // Suspenso: mov 20 (padrão do motor tributário; a query de referência veio duplicada da inadimplência)
    agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${S}.tb_dsod_guias g
      ${join}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${TCA} AND pm.cd_tipo_movimento IN (20) AND p.no_parcela <> 0${where}
      GROUP BY g.no_exercicio_lancamento`, 200),
  ])

  const map = new Map<number, BucketsTcaAno>()
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
 * Buckets da TCA ACUMULADOS até um mês (vencimento da parcela <= mês), por exercício.
 * Espelha bucketsIssccAteMes/bucketsIptuAteMes. Isento/suspenso NÃO usam mês (mesma
 * convenção do IPTU/ITBI/ISSCC — são buckets anuais/posição, não fluxo acumulável).
 */
export interface BucketAteMesTca { lancado: number; arrecadado: number; emAberto: number; inadimplente: number }

function qAteMesTca(vencido: boolean, mes: number, f: FiltrosTca): string {
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? '1' : '0'
  const { join, where } = filtroImovelTca(f)
  return `SELECT ex, SUM(valor) vl FROM (
      SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${S}.tb_dsod_guias g
      ${join}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = ${TCA} AND g.no_exercicio_lancamento >= 2016 AND p.no_parcela <> 0
        AND MONTH(p.dt_vencimento) <= ${mes}
        AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}${where}
      GROUP BY g.no_exercicio_lancamento, g.cd_devedor
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > ${th}
    ) t GROUP BY ex`
}

export async function bucketsTcaAteMes(mes: number, f: FiltrosTca = {}): Promise<Map<number, BucketAteMesTca>> {
  const key = (f.bairro || f.rua || f.imovel) ? `bucketsTcaAteMes:${mes}:${chaveFiltro(f)}` : `bucketsTcaAteMes:${mes}`
  return cached(key, TTL_15MIN, async () => {
    const { join, where } = filtroImovelTca(f)
    const [lancR, arrecR, abertoR, inadR] = await Promise.all([
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
        FROM ${S}.tb_dsod_guias g
        ${join}
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo = ${TCA} AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
          AND MONTH(p.dt_vencimento) <= ${mes}${where}
        GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 400),
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
        FROM ${S}.tb_dsod_guias g
        ${join}
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
        WHERE g.cd_tributo = ${TCA} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
          AND p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
          AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
          AND MONTH(p.dt_vencimento) <= ${mes}${where}
        GROUP BY g.no_exercicio_lancamento`, 200),
      agentQuery(qAteMesTca(false, mes, f), 200),
      agentQuery(qAteMesTca(true, mes, f), 200),
    ])
    const map = new Map<number, BucketAteMesTca>()
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

/** Quantidade de imóveis lançados de TCA por exercício = COUNT de guias (exclui Recalculo/Validacao). */
export async function qtdImoveisTca(f: FiltrosTca = {}): Promise<Map<number, number>> {
  const key = (f.bairro || f.rua || f.imovel) ? `qtdImoveisTca:${chaveFiltro(f)}` : 'qtdImoveisTca'
  return cached(key, TTL_15MIN, async () => {
    const { join, where } = filtroImovelTca(f)
    const r = await agentQuery(`
      SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, COUNT(*) qt
      FROM ${S}.tb_dsod_guias g
      ${join}
      WHERE g.cd_tributo = ${TCA}${where}
      GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 400)
    const map = new Map<number, number>()
    for (const row of r.rows) {
      const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
      if (LANC_SIT_EXCLUIR.has(String(row[1] ?? '').trim())) continue
      map.set(ex, (map.get(ex) ?? 0) + num(row[2]))
    }
    return map
  })
}

/** Data de atualização (carga) = MAX(dt_alter_ods) das guias de TCA. */
export async function dataAtualizacaoTca(): Promise<string | null> {
  return cached('dataAtualizTca', TTL_15MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${S}.tb_dsod_guias WHERE cd_tributo = ${TCA}`, 1)
    const v = r.rows[0]?.[0]
    return v ? String(v).slice(0, 10) : null
  })
}

// ===================== RESUMO (item: situação da guia × status de pagamento) =====================
// Espelha os quadros equivalentes do IPTU (lib/iptu-agg.ts: resumoIptu), restrito ao exercício.
export interface ResumoTca {
  situacao: { situacao: string; qt: number }[]
  pagamento: { status: string; qt: number; cor: string }[]
}

export interface FiltrosResumoTca extends FiltrosTca { ano: number }

export async function resumoTca(f: FiltrosResumoTca): Promise<ResumoTca> {
  const { ano } = f
  return cached(`tcaResumo:${ano}:${chaveFiltro(f)}`, TTL_15MIN, async () => {
    // Interação com "TCA por Bairro": quando um bairro/rua/imóvel está selecionado no
    // drill, os dois quadros abaixo passam a refletir só aquele recorte. Mês NÃO é
    // aplicado aqui: as guias de TCA são geradas em lote único (a grande maioria em
    // dezembro, conforme dt_geracao), então filtrar por mês esvaziaria os quadros para
    // qualquer mês antes disso — mesma decisão já tomada para os cards equivalentes do IPTU.
    const { join: jb, where: jbw } = filtroImovelTca(f)
    const [sitR, pagR] = await Promise.all([
      agentQuery(`SELECT g.ds_situacao, COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb}
        WHERE g.cd_tributo = ${TCA} AND g.no_exercicio_lancamento = ${ano}${jbw} GROUP BY g.ds_situacao`, 20),
      // Forma de pagamento por guia — "Parcelado" = pagou todas as parcelas; "Pago parcial" = pagou parte.
      agentQuery(`SELECT categoria, COUNT(*) qt FROM (
          SELECT g.cd_guia,
            CASE
              WHEN SUM(CASE WHEN p.no_parcela = 0 THEN pp.vl_pagto ELSE 0 END) > 0 THEN 'CotaUnica'
              WHEN SUM(pp.vl_pagto) = 0 THEN 'EmAberto'
              WHEN SUM(CASE WHEN p.no_parcela <> 0 THEN pp.vl_saldo ELSE 0 END) <= 0 THEN 'Parcelado'
              ELSE 'PagoParcial'
            END AS categoria
          FROM ${S}.tb_dsod_guias g
          ${jb}
          JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
          JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
          WHERE g.cd_tributo = ${TCA} AND g.no_exercicio_lancamento = ${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')${jbw}
          GROUP BY g.cd_guia
        ) t GROUP BY categoria`, 50),
    ])
    const situacao = sitR.rows
      .map(r => ({ situacao: String(r[0] ?? '').trim() || '—', qt: num(r[1]) }))
      .sort((a, b) => b.qt - a.qt)
    const fp = { cotaUnica: 0, parcelado: 0, pagoParcial: 0, emAberto: 0 }
    for (const r of pagR.rows) {
      const cat = String(r[0] ?? '').trim(), qt = num(r[1])
      if (cat === 'CotaUnica') fp.cotaUnica = qt
      else if (cat === 'Parcelado') fp.parcelado = qt
      else if (cat === 'PagoParcial') fp.pagoParcial = qt
      else if (cat === 'EmAberto') fp.emAberto = qt
    }
    const pagamento = [
      { status: 'Cota única', qt: fp.cotaUnica, cor: '#1fa463' },
      { status: 'Pago todas as parcelas', qt: fp.parcelado, cor: '#283e93' },
      { status: 'Pago parcelado', qt: fp.pagoParcial, cor: '#e8962e' },
      { status: 'Em aberto', qt: fp.emAberto, cor: '#d64545' },
    ]
    return { situacao, pagamento }
  })
}
