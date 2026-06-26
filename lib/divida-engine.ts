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
