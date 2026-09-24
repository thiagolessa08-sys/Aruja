// Relatório de download (PDF/Excel) do IPTU: por BAIRRO (sem bairro selecionado no filtro
// da tela) ou por CONTRIBUINTE (bairro selecionado). Sempre respeita ano + mês (YTD) +
// espólio/sem número selecionados; se a rua também estiver selecionada (drill bairro→rua),
// estreita o filtro a essa rua, mantendo o agrupamento por contribuinte. Isolado do motor
// de bairros (lib/iptu-agg.ts) para não arriscar o drill interativo bairro→rua já validado.
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const MOV_ABERTO = '0,1,2,3,11,12,14,20', LANC_ABERTO = '0,4,7,10,1'
const SEM_RV = ` AND g.ds_situacao NOT IN ('Recalculo','Validacao')`

export interface FiltrosRelatorioIptu { ano: number; mes: number | null; bairro: string | null; rua: string | null; espolio: boolean; semNumero: boolean }
export interface LinhaImovelIptu {
  inscricao: string
  lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; isento: number; suspenso: number
  semNumero: number
}
export interface LinhaRelatorioIptu {
  nome: string
  inscricao: string
  lancado: number; arrecadado: number; emAberto: number; inadimplencia: number; isento: number; suspenso: number
  imoveis: number; espolio: number; semNumero: number
  // Drill de 2º nível (a pedido do usuário) — só presente quando imoveis > 1 (contribuinte com
  // mais de uma matrícula no bairro): lista CADA imóvel individual com sua própria inscrição e
  // valores, já que a inscrição do grupo (acima) fica vazia nesse caso (ver metricaSimples).
  detalhe?: LinhaImovelIptu[]
}

function base(f: FiltrosRelatorioIptu) {
  let w = `g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${f.ano} AND p.no_parcela <> 0`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  // Drill de rua (bairro → rua → imóvel, mesmo nível do gráfico interativo "IPTU por
  // Bairro") — só faz sentido combinado com bairro; estreita ainda mais o agrupamento
  // por contribuinte abaixo, sem mudar o nível de agrupamento em si.
  if (f.bairro && f.rua) w += ` AND c.ds_endereco = '${f.rua.replace(/'/g, "''")}'`
  // Filtros combináveis (um ou ambos ativos), mesmos usados no gráfico interativo de bairros.
  if (f.espolio) w += ` AND cp.nm_rsocial LIKE '%ESP_LIO%'`
  if (f.semNumero) w += ` AND (i.no_imovel IS NULL OR i.no_imovel = 0)`
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

// Métrica "simples" (soma direta): lançado (com nome+imóveis+inscrição), arrecadado, isento.
async function metricaSimples(f: FiltrosRelatorioIptu, extraFrom: string, extraWhere: string, aplicaMes: boolean, comNome: boolean) {
  const b = base(f)
  // Inscrição do imóvel (a pedido do usuário, coluna fixa no relatório) só faz sentido quando
  // a linha é UM imóvel — MIN() é só pra satisfazer o GROUP BY; quando o grupo tem mais de um
  // imóvel (bairro inteiro, ou proprietário com várias matrículas) o valor é descartado lá
  // embaixo em relatorioIptu(), pra não sugerir que aquele é "o" imóvel da linha.
  const nomeSel = comNome ? (f.bairro ? ', MIN(cp.nm_rsocial) nome, MIN(i.no_inscricao_imovel) inscricao' : ', c.nm_bairro nome, MIN(i.no_inscricao_imovel) inscricao') : ''
  const q = `SELECT ${b.grupo} k${nomeSel}, COUNT(DISTINCT g.cd_devedor) im, SUM(pm.vl_movimento) vl
    ${b.from}${extraFrom}
    WHERE ${b.where}${extraWhere}${mesFlow(f, aplicaMes)}
    GROUP BY ${b.grupo}`
  const r = await agentQuery(q, 3000)
  const map = new Map<string, { nome: string; inscricao: string; imoveis: number; valor: number }>()
  for (const row of r.rows) {
    const k = String(row[0] ?? '').trim()
    if (!chaveValida(f, k)) continue
    if (comNome) map.set(k, { nome: String(row[1] ?? '').trim() || '—', inscricao: String(row[2] ?? '').trim(), imoveis: num(row[3]), valor: num(row[4]) })
    else map.set(k, { nome: k, inscricao: '', imoveis: num(row[1]), valor: num(row[2]) })
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

// --- Drill de 2º nível (a pedido do usuário): contribuinte com mais de 1 imóvel no bairro
// (ex.: incorporadora com centenas de lotes) ganha a lista de CADA imóvel individual, com sua
// própria inscrição e valores. Mesmas métricas de metricaSimples/Liquida/Suspenso acima, só que
// agrupadas por IMÓVEL (g.cd_devedor) em vez de contribuinte/bairro, e restritas de uma vez só
// aos contribuintes com imoveis > 1 (uma leva de ~6 queries no total, não por contribuinte) —
// funções isoladas (não reaproveitam base()) pro mesmo motivo do comentário no topo do arquivo:
// não arriscar o agrupamento já validado do nível contribuinte/bairro.
function baseImovel(f: FiltrosRelatorioIptu, contribsIn: string[]) {
  let w = `g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${f.ano} AND p.no_parcela <> 0
    AND i.cd_contr_proprietario IN (${contribsIn.join(',')})`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  if (f.bairro && f.rua) w += ` AND c.ds_endereco = '${f.rua.replace(/'/g, "''")}'`
  if (f.espolio) w += ` AND cp.nm_rsocial LIKE '%ESP_LIO%'`
  if (f.semNumero) w += ` AND (i.no_imovel IS NULL OR i.no_imovel = 0)`
  const from = `FROM ${S}.tb_dsod_guias g
    JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = g.cd_devedor
    JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep
    LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
    JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas`
  return { from, where: w }
}

async function metricaSimplesImovel(f: FiltrosRelatorioIptu, contribsIn: string[], extraFrom: string, extraWhere: string, aplicaMes: boolean) {
  const b = baseImovel(f, contribsIn)
  const q = `SELECT g.cd_devedor k, MIN(i.cd_contr_proprietario) contrib, MIN(i.no_inscricao_imovel) inscricao,
      MIN(CASE WHEN i.no_imovel IS NULL OR i.no_imovel = 0 THEN 1 ELSE 0 END) semNumero, SUM(pm.vl_movimento) vl
    ${b.from}${extraFrom}
    WHERE ${b.where}${extraWhere}${mesFlow(f, aplicaMes)}
    GROUP BY g.cd_devedor`
  const r = await agentQuery(q, 5000)
  const map = new Map<string, { contrib: string; inscricao: string; semNumero: number; valor: number }>()
  for (const row of r.rows) {
    map.set(String(row[0]), { contrib: String(row[1] ?? '').trim(), inscricao: String(row[2] ?? '').trim(), semNumero: num(row[3]), valor: num(row[4]) })
  }
  return map
}

async function metricaLiquidaImovel(f: FiltrosRelatorioIptu, contribsIn: string[], vencido: boolean, aplicaMes: boolean) {
  const b = baseImovel(f, contribsIn)
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? 1 : 0
  const q = `SELECT k, SUM(valor) vl FROM (
      SELECT g.cd_devedor k, p.dt_vencimento venc, SUM(pm.vl_movimento*pm.no_sinal) valor
      ${b.from}
      WHERE ${b.where} AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}${mesFlow(f, aplicaMes)}
      GROUP BY g.cd_devedor, p.dt_vencimento
      HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${th}
    ) t GROUP BY k`
  const r = await agentQuery(q, 5000)
  const map = new Map<string, number>()
  for (const row of r.rows) map.set(String(row[0]), Math.max(0, num(row[1])))
  return map
}

async function metricaSuspensoImovel(f: FiltrosRelatorioIptu, contribsIn: string[]) {
  const b = baseImovel(f, contribsIn)
  const q = `SELECT g.cd_devedor k, SUM(pm.vl_movimento*pm.no_sinal) net
    ${b.from}
    WHERE ${b.where} AND pm.cd_tipo_movimento IN (20)
    GROUP BY g.cd_devedor`
  const r = await agentQuery(q, 5000)
  const map = new Map<string, number>()
  for (const row of r.rows) map.set(String(row[0]), Math.max(0, -num(row[1])))
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
  const chavePorLinha = new Map<LinhaRelatorioIptu, string>()
  for (const [k, l] of lanc) {
    const linha: LinhaRelatorioIptu = {
      nome: l.nome,
      inscricao: l.imoveis === 1 ? l.inscricao : '',
      lancado: l.valor,
      arrecadado: arrec.get(k)?.valor ?? 0,
      emAberto: aberto.get(k) ?? 0,
      inadimplencia: inad.get(k) ?? 0,
      isento: isen.get(k)?.valor ?? 0,
      suspenso: susp.get(k) ?? 0,
      imoveis: l.imoveis,
      espolio: esp.get(k) ?? 0,
      semNumero: semNum.get(k) ?? 0,
    }
    linhas.push(linha)
    chavePorLinha.set(linha, k)
  }

  // Drill de 2º nível (a pedido do usuário) — só existe com bairro selecionado, que é onde o
  // agrupamento é por contribuinte e pode ter mais de 1 imóvel por linha.
  if (f.bairro) {
    const multiImovel = linhas.filter(l => l.imoveis > 1)
    const idsMulti = multiImovel.map(l => chavePorLinha.get(l)!).filter(id => id && id !== 'null')
    if (idsMulti.length) {
      const [lancI, arrecI, isenI, abertoI, inadI, suspI] = await Promise.all([
        metricaSimplesImovel(f, idsMulti, '', `${SEM_RV} AND pm.cd_tipo_movimento <= 3`, true),
        metricaSimplesImovel(f, idsMulti, arrecFrom, `${SEM_RV} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'`, true),
        metricaSimplesImovel(f, idsMulti, '', isentoWhere, false).catch(() => new Map<string, { contrib: string; inscricao: string; semNumero: number; valor: number }>()),
        metricaLiquidaImovel(f, idsMulti, false, true),
        metricaLiquidaImovel(f, idsMulti, true, true),
        metricaSuspensoImovel(f, idsMulti),
      ])
      const porContrib = new Map<string, LinhaImovelIptu[]>()
      for (const [devedorId, li] of lancI) {
        const item: LinhaImovelIptu = {
          inscricao: li.inscricao || '—',
          lancado: li.valor,
          arrecadado: arrecI.get(devedorId)?.valor ?? 0,
          emAberto: abertoI.get(devedorId) ?? 0,
          inadimplencia: inadI.get(devedorId) ?? 0,
          isento: isenI.get(devedorId)?.valor ?? 0,
          suspenso: suspI.get(devedorId) ?? 0,
          semNumero: li.semNumero,
        }
        const lista = porContrib.get(li.contrib) ?? []
        lista.push(item)
        porContrib.set(li.contrib, lista)
      }
      for (const linha of multiImovel) {
        const k = chavePorLinha.get(linha)!
        const detalhe = porContrib.get(k)
        if (detalhe?.length) linha.detalhe = detalhe.sort((a, b) => b.lancado - a.lancado)
      }
    }
  }

  return linhas.sort((a, b) => b.lancado - a.lancado)
}
