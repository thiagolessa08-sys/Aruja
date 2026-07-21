// Agregação por BAIRRO/RUA genérica para tributos imobiliários (TCA, ISSCC…), espelhando
// o motor de bairro do IPTU (lib/iptu-agg) mas parametrizado por cd_tributo e regra de isento.
// Ponte imóvel: guia.cd_origem = imovel.cd_imovel_urbano (validada p/ TCA e ISSCC).
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

export type MetricaBairro = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia' | 'isento' | 'suspenso'
export interface FiltrosBairroTrib { ano: number; bairro: string | null; metrica: MetricaBairro }
export interface OpcoesBairro { codigos: string; isentoWhere: string; cacheKey: string }
export interface BairroLinha { nome: string; imoveis: number; valor: number }

function baseFrom() {
  return `FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = g.cd_origem
      JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas`
}

function whereBase(o: OpcoesBairro, f: FiltrosBairroTrib) {
  let w = `g.cd_tributo IN (${o.codigos}) AND g.no_exercicio_lancamento = ${f.ano} AND p.no_parcela <> 0`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  return w
}

function query(o: OpcoesBairro, f: FiltrosBairroTrib, grupo: string): string {
  const from = baseFrom()
  const w = whereBase(o, f)
  const semRV = ` AND g.ds_situacao NOT IN ('Recalculo','Validacao')`
  switch (f.metrica) {
    case 'arrecadado':
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_origem) im, SUM(pm.vl_movimento) vl
        ${from}
        JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        JOIN ${S}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
        WHERE ${w}${semRV} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
          AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'
        GROUP BY ${grupo}`
    case 'isento':
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_origem) im, SUM(pm.vl_movimento) vl
        ${from}
        WHERE ${w}${semRV} AND pm.cd_tipo_movimento <= 3 AND g.cd_origem IN (${o.isentoWhere})
        GROUP BY ${grupo}`
    case 'suspenso':
      return `SELECT k, COUNT(DISTINCT cd_origem) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, g.cd_origem cd_origem, SUM(pm.vl_movimento) valor
        ${from}
        WHERE ${w} AND pm.cd_tipo_movimento IN (20)
        GROUP BY ${grupo}, g.cd_origem HAVING SUM(pm.vl_movimento * pm.no_sinal) < 0
      ) t GROUP BY k`
    case 'emAberto':
      return `SELECT k, COUNT(DISTINCT cd_origem) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, g.cd_origem cd_origem, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
        ${from}
        WHERE ${w} AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
        GROUP BY ${grupo}, g.cd_origem, p.dt_vencimento HAVING SUM(pm.vl_movimento * pm.no_sinal) > 0
      ) t GROUP BY k`
    case 'inadimplencia':
      return `SELECT k, COUNT(DISTINCT cd_origem) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, g.cd_origem cd_origem, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
        ${from}
        WHERE ${w} AND p.dt_vencimento < getdate()-1
          AND pm.cd_tipo_movimento IN (0,1,2,3,12,11,14,20) AND pm.cd_tipo_lancamento IN (4,7,0,10,1)
        GROUP BY ${grupo}, g.cd_origem, p.dt_vencimento HAVING SUM(pm.vl_movimento * pm.no_sinal) > 1
      ) t GROUP BY k`
    default: // lancado
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_origem) im, SUM(pm.vl_movimento) vl
        ${from}
        WHERE ${w}${semRV} AND pm.cd_tipo_movimento <= 3
        GROUP BY ${grupo}`
  }
}

export async function bairrosTributo(o: OpcoesBairro, f: FiltrosBairroTrib): Promise<BairroLinha[]> {
  const grupo = f.bairro ? 'c.ds_endereco' : 'c.nm_bairro' // nível rua quando um bairro está selecionado
  const key = `${o.cacheKey}:${f.ano}:${f.metrica}:${f.bairro ?? ''}`
  return cached(key, TTL_15MIN, async () => {
    const r = await agentQuery(query(o, f, grupo), 4000)
    return r.rows
      .map(row => ({ nome: String(row[0] ?? '').trim() || '(sem)', imoveis: num(row[1]), valor: num(row[2]) }))
      .filter(x => x.nome && x.valor !== 0)
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
  })
}

// Configurações por tributo.
export const OPC_TCA: OpcoesBairro = {
  codigos: '67', cacheKey: 'bairroTca',
  isentoWhere: `SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e WHERE e.ds_tipo_isencao = 'IsentoTaxas'`,
}
export const OPC_ISSCC: OpcoesBairro = {
  codigos: '40,17,18', cacheKey: 'bairroIsscc',
  isentoWhere: `SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e WHERE e.cd_tributo IN (40,17,18)`,
}
