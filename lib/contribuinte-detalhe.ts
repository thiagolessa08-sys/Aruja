import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { CODIGOS_EXCLUIDOS } from '@/lib/tributos'

const SCHEMA = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Grupos de tributo do card "Consultar Contribuinte" — os mesmos 6 grupos "core" de
// lib/tributos.ts (IPTU/ITBI/ISS/TFE/TFHS/ISSCC) MAIS a TCA como grupo próprio, só aqui:
// não mexe em lib/tributos.ts (CODIGOS_CORE é usado por várias outras telas pra decidir o
// que cai em "Outros" — mudar isso ali reclassificaria a TCA em telas que não pediram essa
// quebra). "Outros" deste card = tudo que não é nenhum desses 7 grupos nem um código
// operacional/não-tributo (CODIGOS_EXCLUIDOS).
const GRUPOS_TRIBUTO: { label: string; codigos: number[] }[] = [
  { label: 'IPTU', codigos: [1, 25] },
  { label: 'ITBI', codigos: [10] },
  { label: 'ISS', codigos: [3, 7, 8, 33, 70, 301, 302, 303, 304, 572] },
  { label: 'TFE', codigos: [2002] },
  { label: 'TFHS', codigos: [2003] },
  { label: 'ISSCC', codigos: [40, 17, 18] },
  { label: 'TCA', codigos: [67] },
]
const COD_TO_GRUPO = new Map<number, string>()
for (const grp of GRUPOS_TRIBUTO) for (const c of grp.codigos) COD_TO_GRUPO.set(c, grp.label)
const ORDEM_GRUPOS = [...GRUPOS_TRIBUTO.map(g => g.label), 'Outros']

// Mesmo lookup de lib/divida-engine.ts (ATUALIZADA_LOOKUP) — cd_parcelas não é único em
// tb_dsod_parcelas_atualizadas, então pré-agrega ANTES do JOIN. Aqui sem filtro de situação
// de dívida (Normal/DividaAtiva/Ajuizada/Em Ajuizamento): "em aberto" deste card é o saldo
// inteiro do contribuinte, não só a parte já em dívida ativa.
const ATUALIZADA_LOOKUP = `SELECT cd_parcelas,
  SUM(vl_parcela) vl_parcela, SUM(vl_correcao) vl_correcao, SUM(vl_juros) vl_juros,
  SUM(vl_multa) vl_multa, SUM(vl_honorarios) vl_honorarios
  FROM ${SCHEMA}.tb_dsod_parcelas_atualizadas GROUP BY cd_parcelas`

export interface ContribuinteMatch { cd: number; nome: string; doc: string; pessoa: 'F' | 'J' }

// Busca por nome (LIKE em nm_rsocial) ou CPF/CNPJ (dígitos, LIKE em no_cpf_cnpj) — decide
// automaticamente pelo conteúdo digitado, mesmo padrão de app/api/mobiliario/empresa
// quando tipo="" (auto-detecção por regex de dígitos).
export async function buscarContribuintes(q: string, top = 15): Promise<ContribuinteMatch[]> {
  const qn = q.replace(/\D/g, '')
  const cond = qn.length >= 5
    ? `no_cpf_cnpj LIKE '%${esc(qn)}%'`
    : `nm_rsocial LIKE '%${esc(q.toUpperCase())}%'`
  const r = await agentQuery(`
    SELECT TOP ${top} cd_contr, nm_rsocial, no_cpf_cnpj, ic_pessoa
    FROM ${SCHEMA}.tb_dsod_contribuinte
    WHERE ${cond}
    ORDER BY nm_rsocial`, top)
  return r.rows.map(x => ({
    cd: num(x[0]), nome: String(x[1] ?? '').trim() || `Contribuinte ${num(x[0])}`,
    doc: String(x[2] ?? '').trim(), pessoa: String(x[3] ?? '').trim().toUpperCase() === 'F' ? 'F' as const : 'J' as const,
  }))
}

export interface TributoContribuinte { grupo: string; lancado: number; pago: number; saldo: number }
export interface ComposicaoContribuinte { original: number; correcao: number; juros: number; multa: number; honorarios: number; atualizado: number }
export interface EvolucaoAnoContribuinte { ano: number; lancado: number; pago: number; saldo: number }
export interface AdimplenciaContribuinte { totalParcelas: number; pagas: number; vencidas: number; aVencer: number; valorVencido: number; taxaAdimplencia: number }
export type BandaScore = 'A' | 'B' | 'C' | 'D' | 'E'
export interface DetalheContribuinte {
  cd: number; nome: string; doc: string; pessoa: 'F' | 'J'; situacao: string
  email: string; telefone: string; endereco: string; bairro: string; cep: string
  imoveis: number; estabelecimentos: number
  lancado: number; pago: number; saldo: number
  porTributo: TributoContribuinte[]
  composicao: ComposicaoContribuinte
  score: number; banda: BandaScore
  adimplencia: AdimplenciaContribuinte
  evolucaoPorAno: EvolucaoAnoContribuinte[]
}

function bandaDoScore(score: number): BandaScore {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'E'
}

/**
 * Perfil completo de um contribuinte — "o que ele tem" (imóveis, estabelecimentos/inscrição
 * mobiliária) e sua situação tributária (lançado/pago/em aberto por grupo de tributo, mais
 * a composição legal do saldo em aberto: valor original/correção/juros/multa/encargos —
 * mesmo modelo de lib/divida-engine.ts, aqui por contribuinte em vez de agregado). Motor:
 * tb_dsod_parcela_posicao (vl_lancto/vl_pagto/vl_saldo) → parcelas → guias, igual ao resto
 * do dashboard de Cobrança/Dívida Ativa.
 */
export async function detalheContribuinte(cd: number): Promise<DetalheContribuinte | null> {
  return cached(`contribuinteDetalhe:${cd}`, TTL_15MIN, () => detalheContribuinteRaw(cd))
}

async function detalheContribuinteRaw(cd: number): Promise<DetalheContribuinte | null> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const [cadR, imovR, estabR, tribR, compR, scoreR, adimplR, evolR] = await Promise.all([
    agentQuery(`
      SELECT TOP 1 c.cd_contr, c.nm_rsocial, c.no_cpf_cnpj, c.ic_pessoa, c.ds_sit_cadast, c.ds_endereco_email,
        ce.ds_endereco, e.no_logr, ce.nm_bairro, ce.no_cep, tc.telefone
      FROM ${SCHEMA}.tb_dsod_contribuinte c
      LEFT JOIN ${SCHEMA}.tb_dsod_contribuinte_endereco e ON e.cd_contr = c.cd_contr
      LEFT JOIN ${SCHEMA}.tb_dsod_cep ce ON ce.cd_cep = e.cd_cep
      LEFT JOIN (SELECT cd_contr, MIN(no_tel) telefone FROM ${SCHEMA}.tb_dsod_contribuinte_contato GROUP BY cd_contr) tc ON tc.cd_contr = c.cd_contr
      WHERE c.cd_contr = ${cd}`, 1),
    agentQuery(`SELECT COUNT(DISTINCT cd_imovel_urbano) FROM ${SCHEMA}.tb_dsod_imovel_urbano WHERE cd_contr_proprietario = ${cd}`, 1),
    agentQuery(`SELECT COUNT(*) FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario WHERE cd_contr = ${cd}`, 1),
    agentQuery(`
      SELECT g.cd_tributo AS cd, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago, SUM(pp.vl_saldo) AS saldo
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl})
      GROUP BY g.cd_tributo`, 300),
    agentQuery(`
      SELECT SUM(CASE WHEN pa.cd_parcelas IS NOT NULL THEN pa.vl_parcela ELSE pp.vl_saldo END) AS original,
        SUM(COALESCE(pa.vl_correcao,0)) AS correcao, SUM(COALESCE(pa.vl_juros,0)) AS juros,
        SUM(COALESCE(pa.vl_multa,0)) AS multa, SUM(COALESCE(pa.vl_honorarios,0)) AS honorarios
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      LEFT JOIN (${ATUALIZADA_LOOKUP}) pa ON pa.cd_parcelas = p.cd_parcelas
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND pp.vl_saldo > 0`, 1),
    // Score de Contribuinte (CRC) — mesma fórmula de lib/contribuinte-filtros.ts::scoreContribuinte
    // (cadastro completo 10 + vínculo CCM 45 + vínculo imóvel 45 − 1 por parcela vencida),
    // aqui pra UM cd_contr em vez de agregada — sem filtro de cd_tributo, igual ao original.
    agentQuery(`
      SELECT
        (CASE WHEN c.no_cpf_cnpj IS NOT NULL AND c.no_cpf_cnpj <> '-1'
              AND c.ds_endereco_email IS NOT NULL AND c.ds_endereco_email <> ''
              AND tc.telefone IS NOT NULL AND ed.cd_contr IS NOT NULL
          THEN 10 ELSE 0 END)
        + (CASE WHEN cp.ic_pessoa_contribuinte_mobiliario = 1 THEN 45 ELSE 0 END)
        + (CASE WHEN cp.ic_pessoa_proprietario = 1 OR cp.ic_pessoa_compromissario = 1 OR cp.ic_pessoa_posseiro = 1 THEN 45 ELSE 0 END)
        - COALESCE(pv.n, 0) AS raw
      FROM ${SCHEMA}.tb_dsod_contribuinte c
      LEFT JOIN ${SCHEMA}.tb_dsod_contribuinte_pessoa cp ON cp.cd_contr = c.cd_contr
      LEFT JOIN (SELECT cd_contr, MIN(no_tel) telefone FROM ${SCHEMA}.tb_dsod_contribuinte_contato GROUP BY cd_contr) tc ON tc.cd_contr = c.cd_contr
      LEFT JOIN (SELECT DISTINCT cd_contr FROM ${SCHEMA}.tb_dsod_contribuinte_endereco) ed ON ed.cd_contr = c.cd_contr
      LEFT JOIN (
        SELECT g.cd_contr cd_contr, COUNT(*) n
        FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
        JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
        WHERE pp.vl_saldo > 0 AND p.dt_vencimento < getdate() AND g.cd_contr > 0
        GROUP BY g.cd_contr
      ) pv ON pv.cd_contr = c.cd_contr
      WHERE c.cd_contr = ${cd}`, 1),
    // Indicadores de adimplência — situação de TODAS as parcelas (não só as com saldo>0),
    // pra dar a taxa de adimplência (pagas/total) além da contagem de vencidas/a vencer.
    agentQuery(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN pp.vl_saldo <= 0 THEN 1 ELSE 0 END) AS pagas,
        SUM(CASE WHEN pp.vl_saldo > 0 AND p.dt_vencimento < getdate() THEN 1 ELSE 0 END) AS vencidas,
        SUM(CASE WHEN pp.vl_saldo > 0 AND p.dt_vencimento >= getdate() THEN 1 ELSE 0 END) AS aVencer,
        SUM(CASE WHEN pp.vl_saldo > 0 AND p.dt_vencimento < getdate() THEN pp.vl_saldo ELSE 0 END) AS valorVencido
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl})`, 1),
    // Histórico/evolução dos débitos por exercício de lançamento — mesmo motor da quebra
    // por tributo acima, agrupado por ano em vez de por grupo.
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ano, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago, SUM(pp.vl_saldo) AS saldo
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl})
      GROUP BY g.no_exercicio_lancamento
      ORDER BY ano`, 100),
  ])

  const c = cadR.rows[0]
  if (!c) return null

  const rua = String(c[6] ?? '').trim()
  const numero = String(c[7] ?? '').trim()
  const bairro = String(c[8] ?? '').trim()
  const cep = String(c[9] ?? '').trim()

  const grupoMap = new Map<string, { lancado: number; pago: number; saldo: number }>()
  let lancadoTotal = 0, pagoTotal = 0, saldoTotal = 0
  for (const row of tribR.rows) {
    const grupo = COD_TO_GRUPO.get(num(row[0])) ?? 'Outros'
    const lancado = num(row[1]), pago = num(row[2]), saldo = num(row[3])
    lancadoTotal += lancado; pagoTotal += pago; saldoTotal += saldo
    const acc = grupoMap.get(grupo) ?? { lancado: 0, pago: 0, saldo: 0 }
    acc.lancado += lancado; acc.pago += pago; acc.saldo += saldo
    grupoMap.set(grupo, acc)
  }
  const porTributo: TributoContribuinte[] = ORDEM_GRUPOS
    .map(grupo => ({ grupo, ...(grupoMap.get(grupo) ?? { lancado: 0, pago: 0, saldo: 0 }) }))
    .filter(t => t.lancado > 0 || t.saldo > 0)

  const comp = compR.rows[0] ?? []
  const original = num(comp[0]), correcao = num(comp[1]), juros = num(comp[2]), multa = num(comp[3]), honorarios = num(comp[4])

  const scoreRaw = num(scoreR.rows[0]?.[0])
  const score = Math.max(0, Math.min(100, scoreRaw))

  const adm = adimplR.rows[0] ?? []
  const totalParcelas = num(adm[0]), pagasParcelas = num(adm[1]), vencidasParcelas = num(adm[2]), aVencerParcelas = num(adm[3]), valorVencido = num(adm[4])

  const evolucaoPorAno: EvolucaoAnoContribuinte[] = evolR.rows
    .map(row => ({ ano: num(row[0]), lancado: num(row[1]), pago: num(row[2]), saldo: num(row[3]) }))
    .filter(x => x.ano >= 1990 && x.ano <= 2035)

  return {
    cd, nome: String(c[1] ?? '').trim() || `Contribuinte ${cd}`, doc: String(c[2] ?? '').trim(),
    pessoa: String(c[3] ?? '').trim().toUpperCase() === 'F' ? 'F' : 'J',
    situacao: String(c[4] ?? '').trim(), email: String(c[5] ?? '').trim(), telefone: String(c[10] ?? '').trim(),
    endereco: `${rua}${numero ? ', ' + numero : ''}`, bairro, cep,
    imoveis: num(imovR.rows[0]?.[0]), estabelecimentos: num(estabR.rows[0]?.[0]),
    lancado: lancadoTotal, pago: pagoTotal, saldo: saldoTotal,
    porTributo,
    composicao: { original, correcao, juros, multa, honorarios, atualizado: original + correcao + juros + multa + honorarios },
    score, banda: bandaDoScore(score),
    adimplencia: {
      totalParcelas, pagas: pagasParcelas, vencidas: vencidasParcelas, aVencer: aVencerParcelas, valorVencido,
      taxaAdimplencia: totalParcelas ? (pagasParcelas / totalParcelas) * 100 : 0,
    },
    evolucaoPorAno,
  }
}
