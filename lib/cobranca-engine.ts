import { agentQuery } from '@/lib/agent'
import { rankingTributos, iptuOficialAno, type RankTributo } from '@/lib/tributo-engine'
import { CODIGOS_EXCLUIDOS } from '@/lib/tributos'
import { cached, TTL_15MIN } from '@/lib/cache'

// Sobrescreve a linha do IPTU (cd_tributo=1) do ranking genérico (rankingTributos, modelo
// tb_dsod_parcela_posicao) pelo lançado/arrecadado OFICIAL usado nos KPIs de Imobiliário
// (ver iptuOficialAno em tributo-engine.ts) — usado tanto pelo resumo (KPIs do topo + tabela
// "Conversão por Tributo") quanto pela Análise de Conversão ("Por Tributo"), pra manter os
// dois consistentes entre si e com a tela de Imobiliário. Não mexe em `saldo` (não foi
// pedido, e "A Recuperar" da tabela de resumo fica sem uma definição oficial equivalente
// aqui) nem em "IPTU Diferença de Área" (cd_tributo=25), que também fica de fora do IPTU
// oficial de Imobiliário.
async function aplicarIptuOficial(rank: RankTributo[], ano: number, mes?: number): Promise<RankTributo[]> {
  const iptuOficial = await iptuOficialAno(ano, mes)
  return rank.map(t => t.cd === 1 ? { ...t, lancado: iptuOficial.lancado, arrecadado: iptuOficial.arrecadado } : t)
}

const SCHEMA = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// tb_dsod_tipo_baixa.ds_tipo_baixa cujo evento é efetivamente um RECEBIMENTO em dinheiro
// (Pgto/Pago/depósito bancário/Simples Nacional pago). O restante das baixas — cancelamento,
// estorno, compensação, isenção, "sem movimento", etc. — NÃO representa dinheiro efetivamente
// pago pelo contribuinte. Usado por damsGeradas, resultadoMensalArrecadacao e
// comparativoDamPorId.
const TIPOS_BAIXA_PAGO = [
  'Pgto Normal (Prefeitura)', 'Pgto em Atraso (Tesouraria)', 'Pgto em Banco',
  'Pago pela parcela Unica', 'Pago pela parcela Normal',
  'Pago pela parcela Unica, MAS nao tem uma unica, conversao',
  'Pagamento efetuado por deposito bancario',
  'Simples Nacional - Pagto Matriz x Filial', 'Simples Nacional - Pagto PGFN',
]
const TIPOS_BAIXA_PAGO_SQL = TIPOS_BAIXA_PAGO.map(t => `'${t.replace(/'/g, "''")}'`).join(',')

export interface ResumoCobranca {
  ano: number
  lancado: number
  arrecadado: number
  saldo: number
  conversao: number
  totalBaixas: number
  tributos: { nome: string; lancado: number; arrecadado: number; saldo: number; conversao: number }[]
  canais: { nome: string; n: number }[]
  baixasPorAno: { ano: number; n: number }[]
}

export async function resumoCobranca(ano = 2025, mes?: number): Promise<ResumoCobranca> {
  return cached(`cobranca:${ano}:${mes ?? ''}`, TTL_15MIN, () => resumoCobrancaRaw(ano, mes))
}

async function resumoCobrancaRaw(ano: number, mes?: number): Promise<ResumoCobranca> {
  const filtroMesBaixa = mes ? ` AND MONTH(dt_baixa) <= ${mes}` : ''
  const whereMesBaixa = mes ? `WHERE MONTH(dt_baixa) <= ${mes}` : ''
  const [rank, canaisR, anoR] = await Promise.all([
    rankingTributos(false, ano, mes),
    // Canais de arrecadação (baixas) do exercício/mês selecionado — mesmo filtro de
    // ano/mes usado no resto do resumo, pra "Canais de Arrecadação" e o KPI "Baixas
    // Processadas" reagirem aos filtros da tela.
    agentQuery(`
      SELECT ds_setor_origem_baixa AS setor, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      WHERE YEAR(dt_baixa) = ${ano}${filtroMesBaixa}
      GROUP BY ds_setor_origem_baixa`, 100),
    // Série histórica (todos os anos) pro gráfico "Baixas Processadas por Ano" — não
    // restringe por exercício (é o propósito do gráfico mostrar a tendência plurianual),
    // mas acompanha o filtro de mês (acumulado até o mês, em cada ano) quando selecionado.
    agentQuery(`
      SELECT YEAR(dt_baixa) AS ano, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_parcela_baixas
      ${whereMesBaixa}
      GROUP BY YEAR(dt_baixa)`, 100),
  ])

  const rankAjustado = await aplicarIptuOficial(rank, ano, mes)

  const tributos = rankAjustado
    .filter(t => t.lancado > 0)
    .map(t => ({ nome: t.nome, lancado: t.lancado, arrecadado: t.arrecadado, saldo: t.saldo, conversao: t.lancado ? (t.arrecadado / t.lancado) * 100 : 0 }))
    .slice(0, 10)

  const lancado = rankAjustado.reduce((a, t) => a + t.lancado, 0)
  const arrecadado = rankAjustado.reduce((a, t) => a + t.arrecadado, 0)
  const saldo = rankAjustado.reduce((a, t) => a + t.saldo, 0)

  const canais = canaisR.rows
    .map(r => ({ nome: String(r[0] ?? '').trim() || 'Outros', n: num(r[1]) }))
    .filter(c => c.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)

  const baixasPorAno = anoR.rows
    .map(r => ({ ano: num(r[0]), n: num(r[1]) }))
    .filter(x => x.ano >= 2015 && x.ano <= 2026)
    .sort((a, b) => a.ano - b.ano)

  const totalBaixas = canaisR.rows.reduce((a, r) => a + num(r[1]), 0)

  return {
    ano, lancado, arrecadado, saldo,
    conversao: lancado ? (arrecadado / lancado) * 100 : 0,
    totalBaixas, tributos, canais, baixasPorAno,
  }
}

export interface DamMes { mes: number; qt: number }
export interface DamTributo { nome: string; codigos: number[]; qt: number }
export interface DamTributoMes { nome: string; qt: number }
export interface DamOperador { nome: string; qt: number }
export interface DamsGeradas {
  ano: number
  total: number
  porMes: DamMes[]
  porTributo: DamTributo[]
  porOperador: DamOperador[]
}

const TOP_N_DAM_TRIB = 10
const TOP_N_DAM_OPER = 10

/**
 * Documentos de Arrecadação Municipal (DAM) gerados — tb_dsod_guias, cada linha é uma guia
 * (= um DAM) emitida. Contagem por `no_exercicio_lancamento` (o exercício fiscal a que a
 * guia pertence — mesmo critério de ano usado em Análise de Conversão), não por `dt_geracao`
 * (quando foi fisicamente gerada/impressa): uma guia lançada em 2025 pode ser gerada em 2026
 * (reemissão), e dt_geracao sozinho concentrava um pico artificial em dezembro sem relação
 * com o exercício. O recorte por MÊS continua usando `dt_geracao` (não dt_vencimento da
 * parcela, que é por parcela — uma guia parcelada vence em vários meses, o que faria a soma
 * mensal passar do total anual) pra os 12 meses somarem exatamente o total anual — decisão
 * confirmada com o usuário. `cd_usuario_gerador` = operador que gerou (nome de atendente, ou
 * identificadores especiais como "Internet"/autoatendimento pelo portal e "Schedule"/geração
 * automática agendada — nem todo valor é uma pessoa). Por tributo usa o mesmo cd_tributo=20
 * "Documento de Arrecadacao" (DAM genérico, sem tributo específico vinculado) já mapeado em
 * lib/tributos.ts CODIGOS_EXCLUIDOS. Só conta GERADAS — "Pagas" foi removida do painel a
 * pedido do usuário (ficou só a informação de DAM baseada no lançamento).
 */
export async function damsGeradas(ano = 2025, mes?: number): Promise<DamsGeradas> {
  return cached(`dams:${ano}:${mes ?? ''}`, TTL_15MIN, () => damsGeradasRaw(ano, mes))
}

async function damsGeradasRaw(ano: number, mes?: number): Promise<DamsGeradas> {
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const [totalR, mesR, tribR, operR] = await Promise.all([
    agentQuery(`SELECT COUNT(*) FROM ${SCHEMA}.tb_dsod_guias WHERE no_exercicio_lancamento = ${ano}${filtroMes}`, 1),
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE no_exercicio_lancamento = ${ano}${filtroMes}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias g
      LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
      WHERE g.no_exercicio_lancamento = ${ano}${filtroMes}
      GROUP BY g.cd_tributo, t.ds_tributo`, 200),
    // cd_usuario_gerador mistura login de atendente ("CalebeAM") com CPF/CNPJ/código numérico
    // de contribuintes que geraram a própria guia pelo portal (milhares de valores distintos) —
    // PATINDEX filtra só os valores com pelo menos uma letra (atendentes reais + o literal
    // "Internet"), universo pequeno, então busca TODOS sem TOP; o resto (autoemitido) some ao
    // balde "Internet" por diferença do total do ano.
    agentQuery(`
      SELECT cd_usuario_gerador, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE no_exercicio_lancamento = ${ano}${filtroMes}
        AND PATINDEX('%[A-Za-z]%', cd_usuario_gerador) > 0
      GROUP BY cd_usuario_gerador`, 300),
  ])

  const total = num(totalR.rows[0]?.[0])

  const porMesMap = new Map<number, number>()
  for (const row of mesR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) porMesMap.set(m, num(row[1])) }
  const porMes: DamMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, qt: porMesMap.get(m) ?? 0 })

  const tribList = tribR.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`, qt: num(row[2]) }))
    .filter(x => x.qt > 0)
    .sort((a, b) => b.qt - a.qt)
  const topTrib = tribList.slice(0, TOP_N_DAM_TRIB)
  const restoTrib = tribList.slice(TOP_N_DAM_TRIB)
  const porTributo: DamTributo[] = topTrib.map(t => ({ nome: t.nome, codigos: [t.cd], qt: t.qt }))
  if (restoTrib.length) {
    porTributo.push({
      nome: `Demais tributos (${restoTrib.length})`, codigos: restoTrib.map(t => t.cd),
      qt: restoTrib.reduce((s, t) => s + t.qt, 0),
    })
  }

  // Todos os operadores NOMEADOS (login de atendente com letra, incluindo o literal "Internet")
  // entram individualmente — nada fica escondido num "Demais". O que sobra do total do ano
  // (autoemissão via CPF/código numérico) é somado ao balde "Internet" — se "Internet" já
  // existir na lista (é um cd_usuario_gerador literal), soma nele em vez de duplicar a linha.
  const operNomeados = operR.rows
    .map(row => ({ nome: String(row[0] ?? '').trim(), qt: num(row[1]) }))
    .filter(x => x.nome && x.qt > 0)
  const somaNomeadoQt = operNomeados.reduce((s, x) => s + x.qt, 0)
  const restoQt = Math.max(0, total - somaNomeadoQt)
  const operList = [...operNomeados]
  if (restoQt > 0) {
    const internetExistente = operList.find(x => x.nome === 'Internet')
    if (internetExistente) internetExistente.qt += restoQt
    else operList.push({ nome: 'Internet', qt: restoQt })
  }
  const porOperador: DamOperador[] = operList.sort((a, b) => b.qt - a.qt)

  return { ano, total, porMes, porTributo, porOperador }
}

export type DamDrillFiltro =
  | { tipo: 'tributo'; codigos: number[] }
  | { tipo: 'operador'; nome: string }

/**
 * Drill de 2º nível do painel DAM — geradas por mês, restrito a um tributo (ou grupo "Demais
 * tributos", daí `codigos` ser uma lista) ou a um operador específico da lente escolhida em
 * "Por Tributo"/"Por Operador". O balde "Internet" de porOperador combina o cd_usuario_gerador
 * literal "Internet" com todo código sem letra (CPF/numérico) — o filtro reproduz essa mesma
 * composição pro qt do drill bater com o qt exibido na linha.
 */
export async function damsDrillMes(ano: number, mes: number | undefined, filtro: DamDrillFiltro): Promise<DamMes[]> {
  const chave = filtro.tipo === 'tributo' ? `trib:${filtro.codigos.join(',')}` : `oper:${filtro.nome}`
  return cached(`damsDrill:${ano}:${mes ?? ''}:${chave}`, TTL_15MIN, () => damsDrillMesRaw(ano, mes, filtro))
}

async function damsDrillMesRaw(ano: number, mes: number | undefined, filtro: DamDrillFiltro): Promise<DamMes[]> {
  const filtroGuia = filtro.tipo === 'tributo'
    ? `g.cd_tributo IN (${filtro.codigos.join(',')})`
    : filtro.nome === 'Internet'
      ? `(g.cd_usuario_gerador = 'Internet' OR PATINDEX('%[A-Za-z]%', g.cd_usuario_gerador) = 0)`
      : `g.cd_usuario_gerador = '${filtro.nome.replace(/'/g, "''")}'`
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const geradasR = await agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias g
      WHERE g.no_exercicio_lancamento = ${ano}${filtroMes} AND ${filtroGuia}
      GROUP BY MONTH(dt_geracao)`, 20)

  const geradasMap = new Map<number, number>()
  for (const row of geradasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) geradasMap.set(m, num(row[1])) }

  const porMes: DamMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, qt: geradasMap.get(m) ?? 0 })
  return porMes
}

/**
 * Drill de 3º nível do painel DAM na lente "Por Período" — ao clicar num mês no gráfico "Por
 * período (mês)", quebra aquele mês específico (ano + mês EXATOS, não acumulado como o
 * filtroMes "<=" do resto do painel) POR TRIBUTO. Mesmo agrupamento top 10 + "Demais
 * tributos" de damsGeradasRaw (tribR), só que restrito a um único mês.
 */
export async function damsPorTributoMes(ano: number, mesAlvo: number): Promise<DamTributoMes[]> {
  return cached(`damsPorTributoMes:${ano}:${mesAlvo}`, TTL_15MIN, () => damsPorTributoMesRaw(ano, mesAlvo))
}

async function damsPorTributoMesRaw(ano: number, mesAlvo: number): Promise<DamTributoMes[]> {
  const tribR = await agentQuery(`
      SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias g
      LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
      WHERE g.no_exercicio_lancamento = ${ano} AND MONTH(g.dt_geracao) = ${mesAlvo}
      GROUP BY g.cd_tributo, t.ds_tributo`, 200)

  const tribList = tribR.rows
    .map(row => ({ cd: num(row[0]), nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`, qt: num(row[2]) }))
    .filter(x => x.qt > 0)
    .sort((a, b) => b.qt - a.qt)
  const topTrib = tribList.slice(0, TOP_N_DAM_TRIB)
  const restoTrib = tribList.slice(TOP_N_DAM_TRIB)
  const porTributoMes: DamTributoMes[] = topTrib.map(t => ({ nome: t.nome, qt: t.qt }))
  if (restoTrib.length) {
    porTributoMes.push({
      nome: `Demais tributos (${restoTrib.length})`,
      qt: restoTrib.reduce((s, t) => s + t.qt, 0),
    })
  }
  return porTributoMes
}

export interface ResultadoMes { mes: number; geradas: number; pagas: number }
export interface ResultadoMensal { ano: number; totalGeradas: number; totalPagas: number; porMes: ResultadoMes[] }

/**
 * Resultado mensal da arrecadação: DAM GERADAS (tb_dsod_guias.dt_geracao — emitidas) × DAM
 * PAGAS pelo setor de Cobrança (evento de baixa cujo tipo é um recebimento em dinheiro — ver
 * TIPOS_BAIXA_PAGO; o restante das baixas é cancelamento/estorno/compensação/etc., não paga).
 * Datas de geração e de baixa são eventos independentes — uma guia gerada em dezembro (ex.:
 * lote de IPTU do próximo exercício) só é "paga" quando o contribuinte efetivamente paga,
 * meses depois; por isso os volumes mensais não precisam (e tipicamente não vão) bater.
 */
export async function resultadoMensalArrecadacao(ano = 2025, mes?: number): Promise<ResultadoMensal> {
  return cached(`resultadoMensal:${ano}:${mes ?? ''}`, TTL_15MIN, () => resultadoMensalRaw(ano, mes))
}

async function resultadoMensalRaw(ano: number, mes?: number): Promise<ResultadoMensal> {
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const filtroMesBaixa = mes ? ` AND MONTH(pb.dt_baixa) <= ${mes}` : ''
  const [geradasR, pagasR] = await Promise.all([
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}${filtroMes}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT MONTH(pb.dt_baixa) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL})
      GROUP BY MONTH(pb.dt_baixa)`, 20),
  ])

  const geradasMap = new Map<number, number>()
  for (const row of geradasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) geradasMap.set(m, num(row[1])) }
  const pagasMap = new Map<number, number>()
  for (const row of pagasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) pagasMap.set(m, num(row[1])) }

  const porMes: ResultadoMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, geradas: geradasMap.get(m) ?? 0, pagas: pagasMap.get(m) ?? 0 })

  return {
    ano,
    totalGeradas: porMes.reduce((s, x) => s + x.geradas, 0),
    totalPagas: porMes.reduce((s, x) => s + x.pagas, 0),
    porMes,
  }
}

export interface ResultadoTributoMes { nome: string; geradas: number; pagas: number }

const TOP_N_RESULTADO_TRIB = 10

/**
 * Drill de 2º nível do "Resultado Mensal da Arrecadação" — ao clicar num mês, quebra aquele
 * mês específico (ano + mês EXATOS) por tributo, tanto geradas (tb_dsod_guias.dt_geracao)
 * quanto pagas (tb_dsod_parcela_baixas.dt_baixa, evento de baixa — mesmo critério de
 * resultadoMensalRaw). Como são eventos independentes, um tributo pode ter pagas > 0 num mês
 * sem ter nenhuma guia gerada naquele mesmo mês (guia gerada antes, paga agora) — por isso a
 * lista usa a UNIÃO dos tributos que aparecem em qualquer um dos dois lados, não só quem tem
 * geradas > 0 (senão a soma de "pagas" da lista ficaria menor que o total da barra do mês).
 */
export async function resultadoPorTributoMes(ano: number, mesAlvo: number): Promise<ResultadoTributoMes[]> {
  return cached(`resultadoPorTributoMes:${ano}:${mesAlvo}`, TTL_15MIN, () => resultadoPorTributoMesRaw(ano, mesAlvo))
}

async function resultadoPorTributoMesRaw(ano: number, mesAlvo: number): Promise<ResultadoTributoMes[]> {
  const [geradasR, pagasR] = await Promise.all([
    agentQuery(`
      SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias g
      LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
      WHERE YEAR(g.dt_geracao) = ${ano} AND MONTH(g.dt_geracao) = ${mesAlvo}
      GROUP BY g.cd_tributo, t.ds_tributo`, 200),
    agentQuery(`
      SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
      WHERE YEAR(pb.dt_baixa) = ${ano} AND MONTH(pb.dt_baixa) = ${mesAlvo} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL})
      GROUP BY g.cd_tributo, t.ds_tributo`, 200),
  ])

  const geradasMap = new Map<number, { nome: string; qt: number }>()
  for (const row of geradasR.rows) {
    const cd = num(row[0])
    geradasMap.set(cd, { nome: String(row[1] ?? '').trim() || `Tributo ${cd}`, qt: num(row[2]) })
  }
  const pagasMap = new Map<number, { nome: string; qt: number }>()
  for (const row of pagasR.rows) {
    const cd = num(row[0])
    pagasMap.set(cd, { nome: String(row[1] ?? '').trim() || `Tributo ${cd}`, qt: num(row[2]) })
  }

  const codigos = new Set([...geradasMap.keys(), ...pagasMap.keys()])
  const lista = Array.from(codigos)
    .map(cd => ({
      nome: geradasMap.get(cd)?.nome ?? pagasMap.get(cd)?.nome ?? `Tributo ${cd}`,
      geradas: geradasMap.get(cd)?.qt ?? 0,
      pagas: pagasMap.get(cd)?.qt ?? 0,
    }))
    .filter(x => x.geradas > 0 || x.pagas > 0)
    .sort((a, b) => (b.geradas + b.pagas) - (a.geradas + a.pagas))

  const top = lista.slice(0, TOP_N_RESULTADO_TRIB)
  const resto = lista.slice(TOP_N_RESULTADO_TRIB)
  const porTributo: ResultadoTributoMes[] = top.map(t => ({ nome: t.nome, geradas: t.geradas, pagas: t.pagas }))
  if (resto.length) {
    porTributo.push({
      nome: `Demais tributos (${resto.length})`,
      geradas: resto.reduce((s, t) => s + t.geradas, 0),
      pagas: resto.reduce((s, t) => s + t.pagas, 0),
    })
  }
  return porTributo
}

export interface ComparativoDamIdMes { mes: number; geradas: number; pagas: number }
export interface ComparativoDamId { ano: number; totalGeradas: number; totalPagas: number; porMes: ComparativoDamIdMes[] }

/**
 * Comparativo de DAM por ID (documento) — GERADAS (tb_dsod_guias, 1 linha = 1 cd_guia = 1 DAM)
 * × PAGAS, contando DAMs DISTINTAS (COUNT DISTINCT cd_guia), não eventos de baixa como em
 * resultadoMensalArrecadacao. Diferença real: uma guia com várias parcelas (ex.: IPTU
 * parcelado) gera uma baixa "paga" por parcela — em 2025 são ~268 mil eventos pagos mas só
 * ~247 mil DAMs distintas por trás deles, porque parte dessas guias teve mais de uma parcela
 * paga no período. cd_guia = -1 é a linha sentinela ("Não Informado") de tb_dsod_parcelas — só
 * ~250 baixas pagas caem nela no ano e são excluídas do COUNT DISTINCT (senão contam como 1 DAM
 * fantasma). Uma DAM com parcelas pagas em meses diferentes aparece em mais de um mês aqui —
 * por isso a soma dos meses pode superar o total anual (que é DISTINCT sobre o ano inteiro).
 */
export async function comparativoDamPorId(ano = 2025, mes?: number): Promise<ComparativoDamId> {
  return cached(`comparativoDamId:${ano}:${mes ?? ''}`, TTL_15MIN, () => comparativoDamPorIdRaw(ano, mes))
}

async function comparativoDamPorIdRaw(ano: number, mes?: number): Promise<ComparativoDamId> {
  const filtroMes = mes ? ` AND MONTH(dt_geracao) <= ${mes}` : ''
  const filtroMesBaixa = mes ? ` AND MONTH(pb.dt_baixa) <= ${mes}` : ''
  const [geradasR, pagasR, totalPagasR] = await Promise.all([
    agentQuery(`
      SELECT MONTH(dt_geracao) AS mes, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE YEAR(dt_geracao) = ${ano}${filtroMes}
      GROUP BY MONTH(dt_geracao)`, 20),
    agentQuery(`
      SELECT MONTH(pb.dt_baixa) AS mes, COUNT(DISTINCT p.cd_guia) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL}) AND p.cd_guia > 0
      GROUP BY MONTH(pb.dt_baixa)`, 20),
    agentQuery(`
      SELECT COUNT(DISTINCT p.cd_guia) AS qt
      FROM ${SCHEMA}.tb_dsod_parcela_baixas pb
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pb.cd_parcelas
      WHERE YEAR(pb.dt_baixa) = ${ano}${filtroMesBaixa} AND tbx.ds_tipo_baixa IN (${TIPOS_BAIXA_PAGO_SQL}) AND p.cd_guia > 0`, 1),
  ])

  const geradasMap = new Map<number, number>()
  for (const row of geradasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) geradasMap.set(m, num(row[1])) }
  const pagasMap = new Map<number, number>()
  for (const row of pagasR.rows) { const m = num(row[0]); if (m >= 1 && m <= 12) pagasMap.set(m, num(row[1])) }

  const porMes: ComparativoDamIdMes[] = []
  for (let m = 1; m <= 12; m++) porMes.push({ mes: m, geradas: geradasMap.get(m) ?? 0, pagas: pagasMap.get(m) ?? 0 })

  return {
    ano,
    totalGeradas: porMes.reduce((s, x) => s + x.geradas, 0),
    totalPagas: num(totalPagasR.rows[0]?.[0]),
    porMes,
  }
}

export interface ConversaoItem { nome: string; lancado: number; arrecadado: number; conversao: number }
export interface AnaliseConversao {
  ano: number
  porTributo: ConversaoItem[]
  porPeriodo: ConversaoItem[]
  porOperador: ConversaoItem[]
}

const ANO_MIN_CONV = 2018

/**
 * Análise de Conversão (arrecadado ÷ lançado) sob 3 lentes — mesma métrica de
 * "Conversão por Tributo" já mostrado no topo da tela, aqui reaproveitada em rankingTributos
 * (por tributo) e cruzada com duas dimensões novas: por período (exercício de lançamento,
 * desde ${ANO_MIN_CONV}) e por operador (cd_usuario_gerador da guia — mesmo campo usado em
 * damsGeradas, mas aqui pesando o valor $ lançado/pago em vez da contagem de guias). "Por
 * operador" revela conversão por QUEM gerou a guia — útil pra distinguir guias trabalhadas
 * ativamente por atendentes de guias autoemitidas pelo portal que ficam sem seguimento.
 */
export async function analiseConversao(ano = 2025, mes?: number): Promise<AnaliseConversao> {
  return cached(`analiseConversao:${ano}:${mes ?? ''}`, TTL_15MIN, () => analiseConversaoRaw(ano, mes))
}

async function analiseConversaoRaw(ano: number, mes?: number): Promise<AnaliseConversao> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const [rank, periodoR, totalAnoR, operR, iptuOficial] = await Promise.all([
    rankingTributos(false, ano, mes),
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento >= ${ANO_MIN_CONV}${filtroMes}
      GROUP BY g.no_exercicio_lancamento`, 30),
    agentQuery(`
      SELECT SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento = ${ano}${filtroMes}`, 1),
    // cd_usuario_gerador mistura login de atendente ("CalebeAM") com código numérico/CPF de
    // autoemissão pelo portal (milhares de valores distintos) — PATINDEX filtra só os valores
    // com pelo menos uma letra (atendentes reais), universo pequeno (~70-90), então busca TODOS
    // sem TOP; o resto (autoemitido) vira o balde "Internet" por diferença do total do ano.
    agentQuery(`
      SELECT g.cd_usuario_gerador, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento = ${ano}${filtroMes}
        AND PATINDEX('%[A-Za-z]%', g.cd_usuario_gerador) > 0
      GROUP BY g.cd_usuario_gerador`, 300),
    iptuOficialAno(ano, mes),
  ])

  // "Por Tributo" precisa refletir o mesmo lançado/arrecadado OFICIAL do IPTU usado nos KPIs
  // da tela de Imobiliário (Regras 1-6, tb_dsod_parcela_movimento — ver iptuOficialAno), não
  // o modelo de tb_dsod_parcela_posicao usado por rankingTributos pros demais tributos.
  // Sobrescreve só a linha do IPTU (cd_tributo=1) antes do corte de top 10 — os outros
  // tributos continuam no modelo de rankingTributos. "IPTU Diferença de Área" (cd_tributo=25)
  // fica de fora dessa troca porque também fica de fora do IPTU oficial de Imobiliário.
  const rankAjustado = rank.map(t => t.cd === 1
    ? { ...t, lancado: iptuOficial.lancado, arrecadado: iptuOficial.arrecadado }
    : t)

  const porTributo: ConversaoItem[] = rankAjustado
    .filter(t => t.lancado > 0)
    .sort((a, b) => b.lancado - a.lancado)
    .slice(0, 10)
    .map(t => ({ nome: t.nome, lancado: t.lancado, arrecadado: t.arrecadado, conversao: t.lancado ? (t.arrecadado / t.lancado) * 100 : 0 }))

  // Descarta exercícios "futuros" além do corrente com valores residuais (poucos reais,
  // ruído de lançamento/teste) — mantém só anos com volume real de lançamento.
  const anoAtual = new Date().getFullYear()
  const porPeriodo: ConversaoItem[] = periodoR.rows
    .map(row => ({ ex: num(row[0]), lancado: num(row[1]), pago: num(row[2]) }))
    .filter(x => x.ex >= ANO_MIN_CONV && x.ex <= anoAtual && x.lancado >= 1000)
    .sort((a, b) => a.ex - b.ex)
    .map(x => ({ nome: String(x.ex), lancado: x.lancado, arrecadado: x.pago, conversao: x.lancado ? (x.pago / x.lancado) * 100 : 0 }))

  const totalLancadoAno = num(totalAnoR.rows[0]?.[0])
  const totalPagoAno = num(totalAnoR.rows[0]?.[1])

  // Todos os operadores NOMEADOS (login de atendente com letra) entram individualmente — nada
  // fica escondido num "Demais". O que sobra do total do ano (autoemissão pelo portal via CPF
  // ou código numérico) vira o balde "Internet", calculado por diferença.
  const operNomeados = operR.rows
    .map(row => ({ nome: String(row[0] ?? '').trim(), lancado: num(row[1]), pago: num(row[2]) }))
    .filter(x => x.nome && x.lancado > 0)
  const somaNomeadoLancado = operNomeados.reduce((s, x) => s + x.lancado, 0)
  const somaNomeadoPago = operNomeados.reduce((s, x) => s + x.pago, 0)
  const internetLancado = Math.max(0, totalLancadoAno - somaNomeadoLancado)
  const internetPago = Math.max(0, totalPagoAno - somaNomeadoPago)
  const operList = [...operNomeados]
  if (internetLancado > 0) {
    // "Internet" pode já existir como cd_usuario_gerador literal — soma nele em vez de duplicar.
    const internetExistente = operList.find(x => x.nome === 'Internet')
    if (internetExistente) { internetExistente.lancado += internetLancado; internetExistente.pago += internetPago }
    else operList.push({ nome: 'Internet', lancado: internetLancado, pago: internetPago })
  }
  const porOperador: ConversaoItem[] = operList
    .sort((a, b) => b.lancado - a.lancado)
    .map(x => ({ nome: x.nome, lancado: x.lancado, arrecadado: x.pago, conversao: x.lancado ? (x.pago / x.lancado) * 100 : 0 }))

  return { ano, porTributo, porPeriodo, porOperador }
}

export type ConversaoDrillFiltro =
  | { tipo: 'periodo'; ano: number }
  | { tipo: 'operador'; nome: string }

/**
 * Drill de 2º nível da Análise de Conversão — ao clicar num item nas lentes "Por Período" ou
 * "Por Operador", quebra a conversão daquele período/operador POR TRIBUTO, na própria card
 * (in-place). Usa o mesmo modelo tb_dsod_parcela_posicao já usado por porPeriodo/porOperador
 * acima — SEM a correção de IPTU oficial que porTributo aplica pro card principal — pra a
 * soma dos tributos aqui bater exatamente com o lançado/arrecadado já exibido na linha
 * clicada (que também vem do modelo posicao, não do oficial de Imobiliário). "Internet" em
 * operador reproduz a mesma composição usada no balde por diferença logo acima
 * (analiseConversaoRaw) e em damsDrillMesRaw: o literal "Internet" mais todo
 * cd_usuario_gerador sem letra (autoemitido pelo portal).
 */
export async function conversaoDrillTributo(ano: number, mes: number | undefined, filtro: ConversaoDrillFiltro): Promise<ConversaoItem[]> {
  const chave = filtro.tipo === 'periodo' ? `periodo:${filtro.ano}` : `operador:${filtro.nome}`
  return cached(`conversaoDrillTributo:${ano}:${mes ?? ''}:${chave}`, TTL_15MIN, () => conversaoDrillTributoRaw(ano, mes, filtro))
}

async function conversaoDrillTributoRaw(ano: number, mes: number | undefined, filtro: ConversaoDrillFiltro): Promise<ConversaoItem[]> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const anoFiltro = filtro.tipo === 'periodo' ? filtro.ano : ano
  const filtroOperador = filtro.tipo === 'operador'
    ? (filtro.nome === 'Internet'
        ? ` AND (g.cd_usuario_gerador = 'Internet' OR PATINDEX('%[A-Za-z]%', g.cd_usuario_gerador) = 0)`
        : ` AND g.cd_usuario_gerador = '${filtro.nome.replace(/'/g, "''")}'`)
    : ''

  const r = await agentQuery(`
    SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    WHERE g.cd_tributo NOT IN (${excl}) AND g.no_exercicio_lancamento = ${anoFiltro}${filtroMes}${filtroOperador}
    GROUP BY g.cd_tributo, t.ds_tributo`, 200)

  return r.rows
    .map(row => ({ nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`, lancado: num(row[2]), arrecadado: num(row[3]) }))
    .filter(x => x.lancado > 0)
    .sort((a, b) => b.lancado - a.lancado)
    .map(x => ({ ...x, conversao: x.lancado ? (x.arrecadado / x.lancado) * 100 : 0 }))
}
