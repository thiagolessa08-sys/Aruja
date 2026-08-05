// Agregação "ITBI por Bairro" (drill: bairro → rua → imóveis) — espelha bairrosIptu
// (lib/iptu-agg.ts), mas para cd_tributo=10.
//
// ⚠️ Ponte imóvel: para ITBI, g.cd_devedor é o CONTRIBUINTE (cd_contr, pessoa devedora),
// NÃO o imóvel — diferente do IPTU, onde g.cd_devedor = cd_imovel_urbano. A ponte oficial
// guia→imóvel para ITBI é g.cd_origem = it.cd_itbi → tb_dsod_itbi_imovel_urbano (1:N) →
// cd_imovel_urbano. Usar g.cd_devedor como imóvel (como este arquivo fazia antes) casava
// por coincidência de ID com um imóvel qualquer, derrubando ~90% dos registros e atribuindo
// bairro errado aos poucos que "batiam" (bug real, corrigido — validado no agente: total
// batia com cd_devedor=516 imóveis/R$17,15mi "fantasma" vs 608 imóveis/R$17,07mi corretos,
// reconciliando com o total sem bairro (~716 guias)).
// Como a ponte é 1:N, usamos 1 imóvel por cd_itbi (MIN) só para atribuir bairro/contar
// imóveis, evitando fan-out no SUM(vl_movimento) (inflaria o valor).
import { agentQuery } from '@/lib/agent'
import { cached, CACHE_TTL } from '@/lib/cache'
import { detalhesImoveis, type ItemBairro } from '@/lib/iptu-agg'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const JITBI = `JOIN ${S}.tb_dsod_itbi it ON it.cd_itbi = g.cd_origem`
const ITBI_IMOVEL_1 = `(SELECT cd_itbi, MIN(cd_imovel_urbano) cd_imovel_urbano FROM ${S}.tb_dsod_itbi_imovel_urbano GROUP BY cd_itbi)`

export type MetricaBairroItbi = 'lancado' | 'arrecadado' | 'inadimplencia' | 'emAberto' | 'isento' | 'suspenso'
export interface FiltrosBairroItbi { ano: number; espolio: boolean; semNumero: boolean; bairro: string | null; rua?: string | null; metrica?: MetricaBairroItbi }

// FROM + WHERE base (ponte guia→itbi→itbi_imovel_urbano→imóvel→cep); junta contribuinte
// só p/ espólio.
function baseBairroItbi(f: FiltrosBairroItbi) {
  const joinProp = f.espolio ? `JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario` : ''
  let w = `g.cd_tributo = 10 AND g.no_exercicio_lancamento = ${f.ano} AND p.no_parcela <> 0 AND it.vl_total > 0`
  if (f.espolio) w += ` AND cp.nm_rsocial LIKE '%ESP_LIO%'`
  if (f.semNumero) w += ` AND (i.no_imovel IS NULL OR i.no_imovel = 0)`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  if (f.rua) w += ` AND c.ds_endereco = '${f.rua.replace(/'/g, "''")}'`
  const from = `FROM ${S}.tb_dsod_guias g
      ${JITBI}
      JOIN ${ITBI_IMOVEL_1} iiu ON iiu.cd_itbi = it.cd_itbi
      JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = iiu.cd_imovel_urbano
      JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep
      ${joinProp}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas`
  return { from, where: w }
}

// Monta a query da métrica (retorna: grupo, qtd de imóveis, valor) — fórmulas espelham
// bucketsItbiRaw (lib/itbi-engine.ts), a "fonte da verdade" já validada para os KPIs de ITBI.
function queryMetricaBairroItbi(f: FiltrosBairroItbi, grupo: string): string {
  const b = baseBairroItbi(f)
  const semRV = ` AND g.ds_situacao NOT IN ('Recalculo','Validacao')`
  switch (f.metrica) {
    case 'arrecadado':
      return `SELECT ${grupo} k, COUNT(DISTINCT iiu.cd_imovel_urbano) im, SUM(pm.vl_movimento) vl
        ${b.from}
        JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        JOIN ${S}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
        WHERE ${b.where}${semRV} AND g.ds_situacao NOT IN ('Cancelada') AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
          AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'
        GROUP BY ${grupo}`
    case 'isento':
      // Não Incidência de ITBI — mesma ponte iiu já presente em b.from (base).
      return `SELECT ${grupo} k, COUNT(DISTINCT iiu.cd_imovel_urbano) im, SUM(pm.vl_movimento) vl
        ${b.from}
        WHERE ${b.where}${semRV} AND pm.cd_tipo_movimento <= 3
          AND iiu.cd_imovel_urbano IN (SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e WHERE e.ds_isencao IN ('Não Incidência de ITBI'))
        GROUP BY ${grupo}`
    case 'suspenso': // mov 20
      return `SELECT ${grupo} k, COUNT(DISTINCT iiu.cd_imovel_urbano) im, SUM(pm.vl_movimento) vl
        ${b.from}
        WHERE ${b.where} AND pm.cd_tipo_movimento = 20
        GROUP BY ${grupo}`
    case 'emAberto': // saldo líquido em aberto (net>0) — net por (devedor,vencimento), oficial
      return `SELECT k, COUNT(DISTINCT imovel) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, iiu.cd_imovel_urbano imovel, g.cd_devedor cd_devedor, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
        ${b.from}
        WHERE ${b.where} AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
        GROUP BY ${grupo}, iiu.cd_imovel_urbano, g.cd_devedor, p.dt_vencimento HAVING SUM(pm.vl_movimento * pm.no_sinal) > 0
      ) t GROUP BY k`
    case 'inadimplencia': // saldo líquido VENCIDO (net>1)
      return `SELECT k, COUNT(DISTINCT imovel) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, iiu.cd_imovel_urbano imovel, g.cd_devedor cd_devedor, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
        ${b.from}
        WHERE ${b.where} AND p.dt_vencimento < getdate()-1
          AND pm.cd_tipo_movimento IN (0,1,2,3,12,11,14,20) AND pm.cd_tipo_lancamento IN (4,7,0,10,1)
        GROUP BY ${grupo}, iiu.cd_imovel_urbano, g.cd_devedor, p.dt_vencimento HAVING SUM(pm.vl_movimento * pm.no_sinal) > 1
      ) t GROUP BY k`
    default: // 'lancado'
      return `SELECT ${grupo} k, COUNT(DISTINCT iiu.cd_imovel_urbano) im, SUM(pm.vl_movimento) vl
        ${b.from}
        WHERE ${b.where}${semRV} AND pm.cd_tipo_movimento <= 3
        GROUP BY ${grupo}`
  }
}

async function agregadoBairroItbi(f: FiltrosBairroItbi, grupo: string) {
  const r = await agentQuery(queryMetricaBairroItbi(f, grupo), 4000)
  return r.rows
    .map(x => ({ chave: String(x[0] ?? '').trim(), imoveis: num(x[1]), valor: num(x[2]) }))
    .filter(b => b.valor !== 0 || b.imoveis > 0)
    .sort((a, b) => b.valor - a.valor)
}

export interface ItemBairroItbi extends ItemBairro { idItbi?: number }

// Ponte imóvel → cd_itbi (id da transmissão) no exercício, para exibir o ID ITBI junto do
// imóvel no drill "ITBI por Bairro". Vai pela ponte oficial itbi_imovel_urbano (1:N) — um
// imóvel pode ter mais de uma transmissão no mesmo exercício (ex.: cotas de
// coproprietários) — nesse caso fica com o cd_itbi mais recente (MAX), suficiente para
// identificação (o histórico completo já aparece em Consultar Imóvel).
async function idItbiPorImovel(ano: number, cds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!cds.length) return map
  const r = await agentQuery(`
    SELECT iiu.cd_imovel_urbano, MAX(it.cd_itbi) idItbi
    FROM ${S}.tb_dsod_guias g
    ${JITBI}
    JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
    WHERE g.cd_tributo = 10 AND g.no_exercicio_lancamento = ${ano} AND it.vl_total > 0
      AND iiu.cd_imovel_urbano IN (${cds.join(',')})
    GROUP BY iiu.cd_imovel_urbano`, cds.length)
  for (const row of r.rows) map.set(String(row[0]), num(row[1]))
  return map
}

export function bairrosItbi(f: FiltrosBairroItbi): Promise<ItemBairroItbi[]> {
  const grupo = f.rua ? 'iiu.cd_imovel_urbano' : f.bairro ? 'c.ds_endereco' : 'c.nm_bairro'
  const met = f.metrica ?? 'lancado'
  const key = `itbiBairros:${f.ano}:${met}:${f.espolio ? 1 : 0}:${f.semNumero ? 1 : 0}:${f.bairro ?? ''}:${f.rua ?? ''}`
  return cached(key, CACHE_TTL, async () => {
    const base = await agregadoBairroItbi({ ...f, metrica: met }, grupo)
    if (!f.rua) return base.map(b => ({ nome: b.chave || '—', imoveis: b.imoveis, valor: b.valor }))
    const cds = base.map(b => b.chave).filter(c => c && c !== '0')
    const [det, idItbi] = await Promise.all([detalhesImoveis(cds), idItbiPorImovel(f.ano, cds)])
    return base.map(b => {
      const d = det.get(b.chave)
      return {
        nome: d?.proprietario || `Imóvel ${b.chave}`,
        imoveis: b.imoveis,
        valor: b.valor,
        cd: Number(b.chave) || undefined,
        inscricao: d?.inscricao || '',
        numero: d?.numero || '',
        idItbi: idItbi.get(b.chave),
      }
    })
  })
}
