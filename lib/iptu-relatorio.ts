// Relatório de download (PDF/Excel) do IPTU: por BAIRRO (sem bairro selecionado no filtro
// da tela) ou por CONTRIBUINTE (bairro selecionado). Sempre respeita ano + mês (YTD)
// selecionados. Isolado do motor de bairros (lib/iptu-agg.ts) para não arriscar o
// drill interativo bairro→rua já validado — aqui o agrupamento por bairro selecionado
// é por CONTRIBUINTE, não por rua.
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const MOV_ABERTO = '0,1,2,3,11,12,14,20', LANC_ABERTO = '0,4,7,10,1'
const SEM_RV = ` AND g.ds_situacao NOT IN ('Recalculo','Validacao')`

export interface FiltrosRelatorioIptu { ano: number; mes: number | null; bairro: string | null }
export interface LinhaRelatorioIptu {
  nome: string
  lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; isento: number; suspenso: number
  imoveis: number; espolio: number; semNumero: number
}

function base(f: FiltrosRelatorioIptu) {
  let w = `g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${f.ano} AND p.no_parcela <> 0`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  const from = `FROM ${S}.tb_dsod_guias g
    JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = g.cd_devedor
    JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep
    LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
    JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas`
  // Sem bairro selecionado: agrupa por bairro. Com bairro selecionado: agrupa por contribuinte (proprietário).
  const grupo = f.bairro ? 'i.cd_contr_proprietario' : 'c.nm_bairro'
  return { from, where: w, grupo }
}

const mesFlow = (f: FiltrosRelatorioIptu, aplica: boolean) => aplica && f.mes ? ` AND MONTH(p.dt_vencimento) <= ${f.mes}` : ''
const chaveValida = (f: FiltrosRelatorioIptu, k: string) => f.bairro ? (k !== '' && k !== '0' && k !== 'null') : true

// Métrica "simples" (soma direta): lançado (com nome+imóveis), arrecadado, isento.
async function metricaSimples(f: FiltrosRelatorioIptu, extraFrom: string, extraWhere: string, aplicaMes: boolean, comNome: boolean) {
  const b = base(f)
  const nomeSel = comNome ? (f.bairro ? ', MIN(cp.nm_rsocial) nome' : ', c.nm_bairro nome') : ''
  const q = `SELECT ${b.grupo} k${nomeSel}, COUNT(DISTINCT g.cd_devedor) im, SUM(pm.vl_movimento) vl
    ${b.from}${extraFrom}
    WHERE ${b.where}${extraWhere}${mesFlow(f, aplicaMes)}
    GROUP BY ${b.grupo}`
  const r = await agentQuery(q, 3000)
  const map = new Map<string, { nome: string; imoveis: number; valor: number }>()
  for (const row of r.rows) {
    const k = String(row[0] ?? '').trim()
    if (!chaveValida(f, k)) continue
    if (comNome) map.set(k, { nome: String(row[1] ?? '').trim() || '—', imoveis: num(row[2]), valor: num(row[3]) })
    else map.set(k, { nome: k, imoveis: num(row[1]), valor: num(row[2]) })
  }
  return map
}

// Métrica "líquida" (net por grupo+devedor+vencimento, HAVING threshold): em aberto, inadimplência.
async function metricaLiquida(f: FiltrosRelatorioIptu, vencido: boolean, aplicaMes: boolean) {
  const b = base(f)
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? 1 : 0
  const q = `SELECT k, SUM(valor) vl FROM (
      SELECT ${b.grupo} k, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento*pm.no_sinal) valor
      ${b.from}
      WHERE ${b.where} AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}${mesFlow(f, aplicaMes)}
      GROUP BY ${b.grupo}, g.cd_devedor, p.dt_vencimento
      HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${th}
    ) t GROUP BY k`
  const r = await agentQuery(q, 3000)
  const map = new Map<string, number>()
  for (const row of r.rows) {
    const k = String(row[0] ?? '').trim()
    if (!chaveValida(f, k)) continue
    map.set(k, Math.max(0, num(row[1])))
  }
  return map
}

// Suspenso: net por grupo (mov 20); suspenso = max(0, -net) — mesma fórmula do card oficial
// (lib/tributo-engine.ts bucketsIptu). Não usa mês (bucket anual, como isento).
async function metricaSuspenso(f: FiltrosRelatorioIptu) {
  const b = base(f)
  const q = `SELECT ${b.grupo} k, SUM(pm.vl_movimento*pm.no_sinal) net
    ${b.from}
    WHERE ${b.where} AND pm.cd_tipo_movimento IN (20)
    GROUP BY ${b.grupo}`
  const r = await agentQuery(q, 3000)
  const map = new Map<string, number>()
  for (const row of r.rows) {
    const k = String(row[0] ?? '').trim()
    if (!chaveValida(f, k)) continue
    map.set(k, Math.max(0, -num(row[1])))
  }
  return map
}

// Contagem de imóveis distintos que casam uma condição extra, dentro do universo do lançado
// do exercício (não respeita mês — é uma contagem de cadastro/população, não um fluxo).
async function contagem(f: FiltrosRelatorioIptu, extraWhere: string) {
  const b = base(f)
  const q = `SELECT ${b.grupo} k, COUNT(DISTINCT g.cd_devedor) qt
    ${b.from}
    WHERE ${b.where}${SEM_RV} AND pm.cd_tipo_movimento <= 3${extraWhere}
    GROUP BY ${b.grupo}`
  const r = await agentQuery(q, 3000)
  const map = new Map<string, number>()
  for (const row of r.rows) {
    const k = String(row[0] ?? '').trim()
    if (!chaveValida(f, k)) continue
    map.set(k, num(row[1]))
  }
  return map
}

export async function relatorioIptu(f: FiltrosRelatorioIptu): Promise<LinhaRelatorioIptu[]> {
  const arrecFrom = ` JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
    JOIN ${S}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa`
  const isentoWhere = ` AND pm.cd_tipo_movimento <= 3 AND g.cd_devedor IN (SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e
    WHERE datepart(year, e.dt_fim) >= ${f.ano}
      AND (e.ds_isencao NOT IN ('TCA','Não Incidência de ITBI','TCA - Imóvel Locado a Órgão Público') OR e.ds_isencao IS NULL))`

  const [lanc, arrec, isen, aberto, inad, susp, semNum, esp] = await Promise.all([
    metricaSimples(f, '', `${SEM_RV} AND pm.cd_tipo_movimento <= 3`, true, true),
    metricaSimples(f, arrecFrom, `${SEM_RV} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'`, true, false),
    metricaSimples(f, '', isentoWhere, false, false).catch(() => new Map<string, { nome: string; imoveis: number; valor: number }>()), // sem permissão na tabela de isenções → 0
    metricaLiquida(f, false, true),
    metricaLiquida(f, true, true),
    metricaSuspenso(f),
    contagem(f, ` AND (i.no_imovel IS NULL OR i.no_imovel = 0)`),
    contagem(f, ` AND cp.nm_rsocial LIKE '%ESP_LIO%'`),
  ])

  const linhas: LinhaRelatorioIptu[] = []
  for (const [k, l] of lanc) {
    linhas.push({
      nome: l.nome,
      lancado: l.valor,
      arrecadado: arrec.get(k)?.valor ?? 0,
      emAberto: aberto.get(k) ?? 0,
      inadimplencia: inad.get(k) ?? 0,
      isento: isen.get(k)?.valor ?? 0,
      suspenso: susp.get(k) ?? 0,
      imoveis: l.imoveis,
      espolio: esp.get(k) ?? 0,
      semNumero: semNum.get(k) ?? 0,
    })
  }
  return linhas.sort((a, b) => b.lancado - a.lancado)
}
