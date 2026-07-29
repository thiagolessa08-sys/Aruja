import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const SCHEMA = 'pref_aruja_sp'

// Situações de dívida (tb_dsod_parcelas.ds_situacao). Texto → filtro em JS
// (IQ dá 500 com literal de texto no WHERE).
const SIT_DIVIDA: Record<string, 'administrativa' | 'judicial' | 'ajuizamento'> = {
  DividaAtiva: 'administrativa',
  Ajuizada: 'judicial',
  'Em Ajuizamento': 'ajuizamento',
}

export interface ResumoDivida {
  total: number
  administrativa: number
  judicial: number
  ajuizamento: number
  porTributo: { nome: string; valor: number }[]
  porExercicio: { ano: number; valor: number }[]
}

const num = (v: unknown) => Number(v) || 0

export async function resumoDivida(): Promise<ResumoDivida> {
  return cached('divida:resumo', TTL_15MIN, resumoDividaRaw)
}

async function resumoDividaRaw(): Promise<ResumoDivida> {
  // Uma passada: situação × tributo × exercício. Agregações feitas em JS.
  const r = await agentQuery(`
    SELECT p.ds_situacao AS sit, t.ds_tributo AS nome, g.no_exercicio_lancamento AS ex,
           SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    GROUP BY p.ds_situacao, t.ds_tributo, g.no_exercicio_lancamento`, 8000)

  let administrativa = 0, judicial = 0, ajuizamento = 0
  const trib = new Map<string, number>()
  const exerc = new Map<number, number>()

  for (const row of r.rows) {
    const sit = String(row[0] ?? '').trim()
    const tipo = SIT_DIVIDA[sit]
    if (!tipo) continue // só dívida (ignora Normal)
    const nome = String(row[1] ?? '').trim() || 'Não classificado'
    const ano = num(row[2])
    const saldo = num(row[3])
    if (saldo <= 0) continue

    if (tipo === 'administrativa') administrativa += saldo
    else if (tipo === 'judicial') judicial += saldo
    else ajuizamento += saldo

    trib.set(nome, (trib.get(nome) ?? 0) + saldo)
    if (ano >= 2005 && ano <= 2030) exerc.set(ano, (exerc.get(ano) ?? 0) + saldo)
  }

  const porTributo = Array.from(trib.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 9)

  const porExercicio = Array.from(exerc.entries())
    .map(([ano, valor]) => ({ ano, valor }))
    .sort((a, b) => a.ano - b.ano)

  return { total: administrativa + judicial + ajuizamento, administrativa, judicial, ajuizamento, porTributo, porExercicio }
}

export interface MaiorDevedor { cd: number; nome: string; cpfCnpj: string; saldo: number }

// Maiores devedores (dívida ativa) — agrupado por g.cd_contr (contribuinte devedor da
// guia, tributo-agnóstico, ao contrário de cd_origem/cd_devedor que apontam pra tabelas
// diferentes conforme o tributo). Soma vl_saldo de todas as guias em situação de dívida.
export async function maioresDevedores(limite = 200): Promise<MaiorDevedor[]> {
  return cached(`divida:devedores:${limite}`, TTL_15MIN, () => maioresDevedoresRaw(limite))
}

async function maioresDevedoresRaw(limite: number): Promise<MaiorDevedor[]> {
  const r = await agentQuery(`
    SELECT TOP ${limite} g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj, SUM(pp.vl_saldo) saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
    WHERE p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento')
    GROUP BY g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj
    ORDER BY saldo DESC`, limite)
  return r.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim(), cpfCnpj: String(row[2] ?? '').trim(), saldo: num(row[3]) }))
    .filter(x => x.saldo > 0)
}

export interface IptuDivida { imoveisComIptu: number; imoveisEmDivida: number; valorDivida: number }

// IPTU × Dívida Ativa: de todos os imóveis com IPTU lançado (cd_devedor, g.cd_tributo=1),
// quantos têm alguma guia em situação de dívida (administrativa/judicial/ajuizamento).
export async function iptuDividaResumo(): Promise<IptuDivida> {
  return cached('divida:iptu', TTL_15MIN, iptuDividaResumoRaw)
}

async function iptuDividaResumoRaw(): Promise<IptuDivida> {
  const [totR, divR] = await Promise.all([
    agentQuery(`SELECT COUNT(DISTINCT g.cd_devedor) FROM ${SCHEMA}.tb_dsod_guias g WHERE g.cd_tributo = 1`, 1),
    agentQuery(`
      SELECT COUNT(DISTINCT g.cd_devedor) qt, SUM(pp.vl_saldo) saldo
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = 1 AND p.ds_situacao IN ('DividaAtiva','Ajuizada','Em Ajuizamento') AND pp.vl_saldo > 0`, 1),
  ])
  return {
    imoveisComIptu: num(totR.rows[0]?.[0]),
    imoveisEmDivida: num(divR.rows[0]?.[0]),
    valorDivida: num(divR.rows[0]?.[1]),
  }
}
