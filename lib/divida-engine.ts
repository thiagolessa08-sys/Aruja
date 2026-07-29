import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { CODIGOS_EXCLUIDOS } from '@/lib/tributos'

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
  recuperacao: {
    lancado: number; pago: number; taxa: number
    porExercicio: { ano: number; lancado: number; pago: number; taxa: number }[]
  }
}

const num = (v: unknown) => Number(v) || 0

export async function resumoDivida(): Promise<ResumoDivida> {
  return cached('divida:resumo', TTL_15MIN, resumoDividaRaw)
}

async function resumoDividaRaw(): Promise<ResumoDivida> {
  // Uma passada: situação × tributo × exercício. Agregações feitas em JS. vl_lancto/vl_pagto
  // (além de vl_saldo, já usado) dão a Taxa de Recuperação: de tudo que foi inscrito em
  // dívida ativa (lançado), quanto já foi efetivamente pago.
  const r = await agentQuery(`
    SELECT p.ds_situacao AS sit, t.ds_tributo AS nome, g.no_exercicio_lancamento AS ex,
           SUM(pp.vl_lancto) AS lancto, SUM(pp.vl_pagto) AS pagto, SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    GROUP BY p.ds_situacao, t.ds_tributo, g.no_exercicio_lancamento`, 8000)

  let administrativa = 0, judicial = 0, ajuizamento = 0
  let lancadoTotal = 0, pagoTotal = 0
  const trib = new Map<string, number>()
  const exerc = new Map<number, number>()
  const exercRec = new Map<number, { lancado: number; pago: number }>()

  for (const row of r.rows) {
    const sit = String(row[0] ?? '').trim()
    const tipo = SIT_DIVIDA[sit]
    if (!tipo) continue // só dívida (ignora Normal)
    const nome = String(row[1] ?? '').trim() || 'Não classificado'
    const ano = num(row[2])
    const lancto = num(row[3]), pagto = num(row[4]), saldo = num(row[5])

    lancadoTotal += lancto
    pagoTotal += pagto
    if (ano >= 2005 && ano <= 2030) {
      const e = exercRec.get(ano) ?? { lancado: 0, pago: 0 }
      e.lancado += lancto; e.pago += pagto
      exercRec.set(ano, e)
    }

    if (saldo <= 0) continue // porTributo/porExercicio (saldo em aberto) ignoram saldo zerado
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

  const recPorExercicio = Array.from(exercRec.entries())
    .map(([ano, x]) => ({ ano, lancado: x.lancado, pago: x.pago, taxa: x.lancado ? (x.pago / x.lancado) * 100 : 0 }))
    .filter(x => x.lancado > 0)
    .sort((a, b) => a.ano - b.ano)

  return {
    total: administrativa + judicial + ajuizamento, administrativa, judicial, ajuizamento, porTributo, porExercicio,
    recuperacao: {
      lancado: lancadoTotal, pago: pagoTotal, taxa: lancadoTotal ? (pagoTotal / lancadoTotal) * 100 : 0,
      porExercicio: recPorExercicio,
    },
  }
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

export interface DebitosPassiveis { total: number; quantidade: number; porTributo: { nome: string; valor: number }[] }

// Débitos passíveis de serem inscritos em Dívida Ativa: parcelas ainda em situação
// 'Normal' (nunca formalizadas em dívida ativa), já vencidas, com saldo líquido em aberto
// (net > 0 por tributo+devedor+vencimento — mesma convenção de "emAberto/inadimplência"
// usada em bucketsIptu/bucketsItbi; SUM(vl_saldo) bruto não serve aqui, pois parcelas
// substituídas/recalculadas deixam saldo "fantasma" que só o net por movimento resolve).
// Exclui os códigos de tributo de CODIGOS_EXCLUIDOS (ruído/não-tributário, ex.: cd 20
// sozinho infla o total em ~R$8 bi se não for excluído — validado contra dados reais).
const EX_FLOOR_DEBITOS = 2019

export async function debitosPassiveisDivida(): Promise<DebitosPassiveis> {
  return cached('divida:passiveis', TTL_15MIN, debitosPassiveisDividaRaw)
}

async function debitosPassiveisDividaRaw(): Promise<DebitosPassiveis> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const r = await agentQuery(`
    SELECT trib, t.ds_tributo nome, SUM(valor) saldo, COUNT(*) qt FROM (
      SELECT g.cd_tributo trib, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE p.ds_situacao = 'Normal' AND p.no_parcela <> 0
        AND g.no_exercicio_lancamento >= ${EX_FLOOR_DEBITOS} AND g.cd_tributo NOT IN (${excl})
        AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
        AND p.dt_vencimento < getdate()-1
      GROUP BY g.cd_tributo, g.cd_devedor, p.dt_vencimento
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > 1
    ) x
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = x.trib
    GROUP BY trib, t.ds_tributo`, 500)

  let total = 0, quantidade = 0
  const trib = new Map<string, number>()
  for (const row of r.rows) {
    const nome = String(row[1] ?? '').trim() || 'Não classificado'
    const saldo = num(row[2]), qt = num(row[3])
    total += saldo
    quantidade += qt
    trib.set(nome, (trib.get(nome) ?? 0) + saldo)
  }
  const porTributo = Array.from(trib.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 9)

  return { total, quantidade, porTributo }
}
