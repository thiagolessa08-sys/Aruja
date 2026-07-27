// Agregação por BAIRRO/RUA genérica para tributos imobiliários (TCA, ISSCC…), espelhando
// o motor de bairro do IPTU (lib/iptu-agg) mas parametrizado por cd_tributo e regra de isento.
// Ponte imóvel: guia.cd_origem = imovel.cd_imovel_urbano (validada p/ TCA e ISSCC).
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { detalhesImoveis } from '@/lib/iptu-agg'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

export type MetricaBairro = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia' | 'isento' | 'suspenso' | 'naoLancados'
export interface FiltrosBairroTrib { ano: number; bairro: string | null; rua?: string | null; metrica: MetricaBairro }
export interface OpcoesBairro { codigos: string; isentoWhere: string; cacheKey: string }
export interface BairroLinha { nome: string; imoveis: number; valor: number; cd?: number; inscricao?: string; numero?: string }

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
  if (f.rua) w += ` AND c.ds_endereco = '${f.rua.replace(/'/g, "''")}'`
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
    case 'naoLancados':
      // Complemento de "Lançado": imóveis do bairro que NÃO têm nenhuma guia válida deste
      // tributo no exercício. Não passa pela guia (é o oposto) — parte direto do cadastro
      // de imóveis e exclui quem já tem lançamento (mesmo critério do caso "lancado" acima:
      // fora de Recalculo/Validação), então os dois conjuntos são complementares.
      return `SELECT ${grupo} k, COUNT(*) im, COUNT(*) vl
        FROM ${S}.tb_dsod_imovel_urbano i
        JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep
        WHERE ${f.bairro ? `c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'` : '1=1'}
          ${f.rua ? `AND c.ds_endereco = '${f.rua.replace(/'/g, "''")}'` : ''}
          AND i.cd_imovel_urbano NOT IN (
            SELECT DISTINCT g.cd_origem FROM ${S}.tb_dsod_guias g
            WHERE g.cd_tributo IN (${o.codigos}) AND g.no_exercicio_lancamento = ${f.ano}
              AND g.ds_situacao NOT IN ('Recalculo','Validacao'))
        GROUP BY ${grupo}`
    default: // lancado
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_origem) im, SUM(pm.vl_movimento) vl
        ${from}
        WHERE ${w}${semRV} AND pm.cd_tipo_movimento <= 3
        GROUP BY ${grupo}`
  }
}

export async function bairrosTributo(o: OpcoesBairro, f: FiltrosBairroTrib): Promise<BairroLinha[]> {
  // nível: bairro → rua (bairro selecionado) → imóveis (rua selecionada, identificados por
  // inscrição/número/proprietário, igual ao drill do IPTU/ITBI).
  const grupo = f.rua ? 'i.cd_imovel_urbano' : f.bairro ? 'c.ds_endereco' : 'c.nm_bairro'
  const key = `${o.cacheKey}:${f.ano}:${f.metrica}:${f.bairro ?? ''}:${f.rua ?? ''}`
  return cached(key, TTL_15MIN, async () => {
    const r = await agentQuery(query(o, f, grupo), 4000)
    const base = r.rows
      .map(row => ({ chave: String(row[0] ?? '').trim(), imoveis: num(row[1]), valor: num(row[2]) }))
      .filter(x => x.chave && x.valor !== 0)
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
    if (!f.rua) return base.map(b => ({ nome: b.chave || '(sem)', imoveis: b.imoveis, valor: b.valor }))
    const det = await detalhesImoveis(base.map(b => b.chave))
    return base.map(b => {
      const d = det.get(b.chave)
      return {
        nome: d?.proprietario || `Imóvel ${b.chave}`,
        imoveis: b.imoveis, valor: b.valor,
        cd: Number(b.chave) || undefined, inscricao: d?.inscricao || '', numero: d?.numero || '',
      }
    })
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
