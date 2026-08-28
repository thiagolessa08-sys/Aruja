import { agentQuery } from '@/lib/agent'
import { GrupoTributo, codigosDoGrupo, CODIGOS, CODIGOS_CORE, CODIGOS_EXCLUIDOS, LABEL_GRUPO } from '@/lib/tributos'
import { cached, TTL_15MIN, TTL_30MIN } from '@/lib/cache'

const SCHEMA = 'pref_aruja_sp'
const EXCL = [...CODIGOS_CORE, ...CODIGOS_EXCLUIDOS].join(',')

export interface SerieExercicio {
  ano: number
  lancado: number
  arrecadado: number
  saldo: number        // inadimplência (vl_saldo)
  isencao: number
  suspenso: number
}

const num = (v: unknown) => Number(v) || 0

// Cláusula de filtro por grupo de tributo (cd_tributo é numérico → IN seguro).
// "outros" = todos os códigos que NÃO são cobertos por abas dedicadas.
function whereTributo(grupo: GrupoTributo): string {
  if (grupo === 'outros') {
    return `g.cd_tributo NOT IN (${EXCL})`
  }
  const cods = codigosDoGrupo(grupo)
  return `g.cd_tributo IN (${cods.join(',')})`
}

/**
 * Série anual de lançado/arrecadado/saldo por exercício de lançamento para um grupo.
 * Motor: tb_dsod_parcela_posicao (vl_lancto/vl_pagto/vl_saldo) → parcelas → guias.
 * `mes` (opcional) restringe lançado/arrecadado/saldo às parcelas com vencimento até o
 * mês informado (acumulado), para todos os anos da série — mesma convenção do IPTU/ITBI
 * (bucketsIptuAteMes/bucketsItbiAteMes). Isenção/suspenso continuam anuais (não acumulam por mês).
 */
export async function serieTributo(grupo: GrupoTributo, anoMin = 2018, anoMax = new Date().getFullYear(), mes?: number): Promise<SerieExercicio[]> {
  return cached(`serie:${grupo}:${anoMin}:${anoMax}:${mes ?? ''}`, TTL_15MIN, () => serieTributoWhereRaw(whereTributo(grupo), anoMin, anoMax, mes))
}

/**
 * Série anual para um conjunto arbitrário de códigos de tributo (cd_tributo), em vez de um
 * grupo pré-definido. Usada pelo drill "detalhe de um tipo" do ranking de Outros Tributos
 * (rankingTributos) — ao selecionar um item do ranking, mostra a evolução anual daquele(s)
 * código(s) específico(s) (um único código, ou vários no caso da linha agregada "Demais").
 */
export async function serieTributoPorCodigos(codigos: number[], anoMin = 2018, anoMax = new Date().getFullYear(), mes?: number): Promise<SerieExercicio[]> {
  const chave = [...codigos].sort((a, b) => a - b).join('.')
  return cached(`serieCod:${chave}:${anoMin}:${anoMax}:${mes ?? ''}`, TTL_15MIN, () => serieTributoWhereRaw(`g.cd_tributo IN (${codigos.join(',')})`, anoMin, anoMax, mes))
}

export interface CenariosTributo { conservador: number; moderado: number; agressivo: number }
export interface PrevisaoTributoResp {
  anoInicio: number      // primeiro exercício com lançamento usado na regressão (início da série histórica)
  anoBase: number        // exercício-âncora (o mais recente com lançamento real, pode ser o corrente)
  anoPrevisao: number    // exercício projetado (sempre anoAtual + 1, ex.: 2026 → 2027)
  base: number            // lançado real do anoBase (mesma base dos 3 cenários)
  cenarios: CenariosTributo
}

// Regressão linear simples (mínimos quadrados) — mesma técnica de previsaoIssFora
// (lib/iss-fora-previsao.ts) e previsaoMensalIptu, aplicada aqui ao lançado anual de um
// código (ou conjunto de códigos) de tributo específico.
function regressaoLinearSimples(pontos: { x: number; y: number }[]): (x: number) => number {
  const n = pontos.length
  const sx = pontos.reduce((s, p) => s + p.x, 0)
  const sy = pontos.reduce((s, p) => s + p.y, 0)
  const sxx = pontos.reduce((s, p) => s + p.x * p.x, 0)
  const sxy = pontos.reduce((s, p) => s + p.x * p.y, 0)
  const den = n * sxx - sx * sx
  if (!den) return () => sy / n
  const b = (n * sxy - sx * sy) / den
  const a0 = (sy - b * sx) / n
  return (x: number) => a0 + b * x
}

/**
 * Previsão do LANÇADO pro próximo exercício fechado (sempre anoAtual + 1, ex.: em 2026 →
 * previsão 2027) de um conjunto de códigos de tributo, pro drill "detalhe" do ranking de
 * Outros Tributos. Ao contrário de previsaoIssFora (que exclui o ano corrente por ser
 * parcial), aqui o ano corrente ENTRA na regressão sempre que já houver lançamento — um
 * código novo como a TCA (só 2025 e 2026) já tem 2 pontos reais, o suficiente pra estimar
 * uma tendência, em vez de descartar o único dado mais recente e ficar sem crescimento
 * nenhum pra projetar. A âncora (anoBase/base) é o exercício mais recente que de fato tem
 * lançamento pro(s) código(s) — não necessariamente anoAtual, pois códigos descontinuados
 * (sem lançamento neste nem no ano anterior) caem num ano mais antigo. Regressão linear sobre
 * TODA a série histórica disponível do(s) código(s) (desde 2018, mesmo mínimo usado em todo o
 * app — não só os últimos anos), pra não descartar histórico real de tributos antigos — mesma
 * técnica e mesma convenção de 3 níveis de previsaoIssFora (conservador = metade do
 * crescimento projetado, moderado = regressão cheia, agressivo = 1,5× o crescimento — todos
 * ancorados no valor real da âncora). Sempre em base ANUAL, independente do filtro de mês da
 * tela.
 */
export async function previsaoTributoCodigos(codigos: number[]): Promise<PrevisaoTributoResp> {
  const chave = [...codigos].sort((a, b) => a - b).join('.')
  return cached(`previsaoTributoCod:${chave}`, TTL_15MIN, async () => {
    const anoAtual = new Date().getFullYear()
    const anoPrevisao = anoAtual + 1
    const serie = await serieTributoPorCodigos(codigos, undefined, anoAtual)

    const pontos = serie.map(s => ({ x: s.ano, y: s.lancado }))
    const moderado = pontos.length ? Math.max(0, regressaoLinearSimples(pontos)(anoPrevisao)) : 0
    // Âncora = exercício mais recente com lançamento real (pode ser o ano corrente, se já
    // houver dado). serie vem ordenada por ano crescente e sem anos vazios (serieTributoWhereRaw
    // descarta lancado=arrecadado=saldo=0), então o último item é sempre a âncora correta.
    const ultimo = serie[serie.length - 1]
    const anoBase = ultimo?.ano ?? anoAtual - 1
    const anoInicio = serie[0]?.ano ?? anoBase
    const base = ultimo?.lancado ?? 0
    const crescimento = moderado - base

    return {
      anoInicio,
      anoBase,
      anoPrevisao,
      base,
      cenarios: {
        conservador: Math.max(0, base + crescimento * 0.5),
        moderado,
        agressivo: Math.max(0, base + crescimento * 1.5),
      },
    }
  })
}

async function serieTributoWhereRaw(where: string, anoMin: number, anoMax: number, mes?: number): Promise<SerieExercicio[]> {
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const [principal, anual] = await Promise.all([
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex,
             SUM(pp.vl_lancto) AS lancado,
             SUM(pp.vl_pagto) AS pago,
             SUM(pp.vl_saldo) AS saldo
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE ${where}${filtroMes}
      GROUP BY g.no_exercicio_lancamento`, 200),
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex,
             SUM(pp.vl_isencao) AS isencao,
             SUM(pp.vl_suspenso) AS suspenso
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE ${where}
      GROUP BY g.no_exercicio_lancamento`, 200),
  ])

  const anuais = new Map<number, { isencao: number; suspenso: number }>()
  for (const row of anual.rows) anuais.set(num(row[0]), { isencao: num(row[1]), suspenso: num(row[2]) })

  return principal.rows
    .map(row => {
      const ex = num(row[0])
      const a = anuais.get(ex)
      return {
        ano: ex,
        lancado: num(row[1]),
        arrecadado: num(row[2]),
        saldo: num(row[3]),
        isencao: a?.isencao ?? 0,
        suspenso: a?.suspenso ?? 0,
      }
    })
    .filter(s => s.ano >= anoMin && s.ano <= anoMax)
    .filter(s => !(s.lancado === 0 && s.arrecadado === 0 && s.saldo === 0)) // descarta anos futuros vazios
    .sort((a, b) => a.ano - b.ano)
}

export interface MesTributo { mes: number; lancado: number; arrecadado: number; saldo: number }

/**
 * Drill do gráfico "Lançado × Arrecadado" (PainelTributo): abre o exercício clicado por
 * mês de vencimento da parcela. Mesma fonte (tb_dsod_parcela_posicao) do serieTributo,
 * só que agrupada por MONTH(p.dt_vencimento) em vez de exercício.
 */
export async function serieMensalTributo(grupo: GrupoTributo, ano: number): Promise<MesTributo[]> {
  return cached(`serieMensalTributo:${grupo}:${ano}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT MONTH(p.dt_vencimento) AS m, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_pagto) AS pago, SUM(pp.vl_saldo) AS saldo
      FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
      JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
      WHERE ${whereTributo(grupo)} AND g.no_exercicio_lancamento = ${ano}
      GROUP BY MONTH(p.dt_vencimento)`, 40)
    const map = new Map<number, MesTributo>()
    for (const row of r.rows) {
      const m = num(row[0])
      if (m >= 1 && m <= 12) map.set(m, { mes: m, lancado: num(row[1]), arrecadado: num(row[2]), saldo: num(row[3]) })
    }
    const out: MesTributo[] = []
    for (let m = 1; m <= 12; m++) out.push(map.get(m) ?? { mes: m, lancado: 0, arrecadado: 0, saldo: 0 })
    return out
  })
}

export interface LancadoGrupo { grupo: GrupoTributo; label: string; lancado: number; debito: number }

const GRUPOS_ORDEM: GrupoTributo[] = ['iptu', 'itbi', 'isscc', 'iss', 'tfe', 'tfhs', 'outros']

function caseGrupo(): string {
  const whens = (['iptu', 'itbi', 'isscc', 'iss', 'tfe', 'tfhs'] as const)
    .map(g => `WHEN g.cd_tributo IN (${CODIGOS[g].join(',')}) THEN '${g}'`).join(' ')
  return `CASE ${whens} WHEN g.cd_tributo NOT IN (${EXCL}) THEN 'outros' END`
}

/**
 * Lançado × Débitos (saldo em aberto) por grupo de tributo (IPTU, ITBI, ISS Construção
 * Civil, ISS/ISSQN, TFE, TFHS, Outros) — usado no gráfico "Tributos Lançados" da tela de
 * Contribuintes. "Débitos" = valores em aberto que o contribuinte possui (vl_saldo),
 * mesmo campo usado como saldo devedor em serieTributo. Mesma fonte/bucketing do
 * serieTributo/whereTributo, só que numa única consulta com CASE em vez de uma consulta
 * por grupo. `ano` (opcional) restringe ao exercício de lançamento; `mes` (opcional)
 * acumula as parcelas com vencimento até aquele mês — mesma convenção do
 * PainelTributo/mei-enquadramento.
 */
export async function lancadoPorGrupo(ano?: number, mes?: number): Promise<LancadoGrupo[]> {
  return cached(`lancadoPorGrupo:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => lancadoPorGrupoRaw(ano, mes))
}

async function lancadoPorGrupoRaw(ano?: number, mes?: number): Promise<LancadoGrupo[]> {
  const cond = [
    ano ? `g.no_exercicio_lancamento = ${ano}` : '',
    mes ? `MONTH(p.dt_vencimento) <= ${mes}` : '',
  ].filter(Boolean).join(' AND ')
  const filtro = cond ? `WHERE ${cond}` : ''
  const grp = caseGrupo()
  const r = await agentQuery(`
    SELECT ${grp} AS grp, SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    ${filtro}
    GROUP BY ${grp}`, 20)
  const map = new Map<string, { lancado: number; debito: number }>()
  for (const row of r.rows) {
    if (row[0] != null) map.set(String(row[0]), { lancado: num(row[1]), debito: num(row[2]) })
  }
  return GRUPOS_ORDEM
    .map(g => ({ grupo: g, label: LABEL_GRUPO[g], lancado: map.get(g)?.lancado ?? 0, debito: map.get(g)?.debito ?? 0 }))
    .sort((a, b) => b.lancado - a.lancado)
}

export interface DevedorGrupo { cd: number; nome: string; doc: string; pessoa: 'F' | 'J' | ''; lancado: number; debito: number }

const TOP_N_DEVEDOR_GRUPO = 15

/**
 * Maiores devedores de um grupo de tributo (drill do gráfico "Tributos Lançados" da tela
 * de Contribuinte) — TOP N contribuintes por débito (saldo em aberto), com nome e tipo de
 * pessoa (F/J) via tb_dsod_contribuinte. Mesma fonte/filtro (ano/mês) de lancadoPorGrupo,
 * só que agrupado por contribuinte em vez de por grupo de tributo inteiro.
 */
export async function devedoresPorGrupo(grupo: GrupoTributo, ano?: number, mes?: number, top = TOP_N_DEVEDOR_GRUPO): Promise<DevedorGrupo[]> {
  return cached(`devedoresGrupo:${grupo}:${ano ?? 'all'}:${mes ?? ''}:${top}`, TTL_15MIN, () => devedoresPorGrupoRaw(grupo, ano, mes, top))
}

async function devedoresPorGrupoRaw(grupo: GrupoTributo, ano?: number, mes?: number, top = TOP_N_DEVEDOR_GRUPO): Promise<DevedorGrupo[]> {
  // pp.vl_saldo > 0 restringe às parcelas efetivamente em aberto — sem isso, grupos grandes
  // (IPTU sem filtro de ano) escaneiam décadas de parcelas já quitadas e estouram o timeout
  // do agente (~100s). Também é mais correto: quem já quitou tudo não é "devedor".
  const cond = [
    whereTributo(grupo),
    'g.cd_contr > 0',
    'pp.vl_saldo > 0',
    ano ? `g.no_exercicio_lancamento = ${ano}` : '',
    mes ? `MONTH(p.dt_vencimento) <= ${mes}` : '',
  ].filter(Boolean).join(' AND ')
  const r = await agentQuery(`
    SELECT TOP ${top} g.cd_contr, c.nm_rsocial, c.no_cpf_cnpj, c.ic_pessoa,
           SUM(pp.vl_lancto) AS lancado, SUM(pp.vl_saldo) AS debito
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    JOIN ${SCHEMA}.tb_dsod_contribuinte c ON c.cd_contr = g.cd_contr
    WHERE ${cond}
    GROUP BY g.cd_contr, c.nm_rsocial, c.no_cpf_cnpj, c.ic_pessoa
    ORDER BY debito DESC`, top)

  return r.rows.map(row => {
    const doc = String(row[2] ?? '').trim()
    const p = String(row[3] ?? '').trim()
    return {
      cd: num(row[0]),
      nome: String(row[1] ?? '').trim() || `Contribuinte ${num(row[0])}`,
      doc: doc && doc !== '-1' ? doc : '',
      pessoa: p === 'F' || p === 'J' ? p as 'F' | 'J' : '',
      lancado: num(row[4]),
      debito: num(row[5]),
    }
  })
}

/**
 * Ranking de tributos (cd_tributo + nome) por lançado/arrecadado/saldo,
 * usado na aba "Outros Tributos". Junta com tb_dsod_tributos para o rótulo.
 */
export interface RankTributo {
  cd: number
  nome: string
  lancado: number
  arrecadado: number
  saldo: number
}

export async function rankingTributos(somenteOutros = true, ano?: number, mes?: number): Promise<RankTributo[]> {
  return cached(`rank:${somenteOutros}:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => rankingTributosRaw(somenteOutros, ano, mes))
}

async function rankingTributosRaw(somenteOutros: boolean, ano?: number, mes?: number): Promise<RankTributo[]> {
  const filtroAno = ano ? `AND g.no_exercicio_lancamento = ${ano}` : ''
  const filtroMes = mes ? `AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const filtroGrupo = somenteOutros
    ? `g.cd_tributo NOT IN (${EXCL})`
    : `g.cd_tributo NOT IN (${CODIGOS_EXCLUIDOS.join(',')})`

  const r = await agentQuery(`
    SELECT g.cd_tributo AS cd, t.ds_tributo AS nome,
           SUM(pp.vl_lancto) AS lancado,
           SUM(pp.vl_pagto) AS pago,
           SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    WHERE ${filtroGrupo} ${filtroAno} ${filtroMes}
    GROUP BY g.cd_tributo, t.ds_tributo`, 200)

  return r.rows
    .map(row => ({
      cd: num(row[0]),
      nome: String(row[1] ?? '').trim() || `Tributo ${num(row[0])}`,
      lancado: num(row[2]),
      arrecadado: num(row[3]),
      saldo: num(row[4]),
    }))
    .sort((a, b) => b.lancado - a.lancado)
}

export interface DevedorTributo { cd: number; nome: string; cpfCnpj: string; saldo: number; endereco?: string }

/**
 * Drill "quem deve" do painel "Quando Vence" (Cobrança) — um nível além de
 * potencialMensalTributo: ao clicar num mês específico do gráfico, mostra os maiores
 * devedores daquele(s) código(s) de tributo com parcela vencendo naquele mês/ano exato
 * (YEAR/MONTH de dt_vencimento, não exercício de lançamento). Agrupa por g.cd_contr
 * (contribuinte devedor da guia). Inclui o endereço completo (tb_dsod_contribuinte_endereco
 * + tb_dsod_cep, tributo-agnóstico — mesma tabela de endereço usada em mobiliario-empresa.ts
 * detalhe(), mas aqui por cd_contr direto em vez de cd_contr_mob) — é o endereço CADASTRAL
 * do contribuinte, não necessariamente o do imóvel gerador da guia (podem divergir, ex.:
 * empresa com sede fora de Arujá).
 */
export async function devedoresPorTributoMes(codigos: number[], anoVenc: number, mesVenc: number, top = 15): Promise<DevedorTributo[]> {
  const chave = [...codigos].sort((a, b) => a - b).join('.')
  return cached(`devedoresTributoMes:${chave}:${anoVenc}:${mesVenc}:${top}`, TTL_15MIN, () => devedoresPorTributoMesRaw(codigos, anoVenc, mesVenc, top))
}

async function devedoresPorTributoMesRaw(codigos: number[], anoVenc: number, mesVenc: number, top: number): Promise<DevedorTributo[]> {
  const r = await agentQuery(`
    SELECT TOP ${top} g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj, SUM(pp.vl_saldo) saldo,
           MIN(ce.ds_endereco) rua, MIN(e.no_logr) numero, MIN(ce.nm_bairro) bairro, MIN(ce.no_cep) cep
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    JOIN ${SCHEMA}.tb_dsod_contribuinte cp ON cp.cd_contr = g.cd_contr
    LEFT JOIN ${SCHEMA}.tb_dsod_contribuinte_endereco e ON e.cd_contr = g.cd_contr
    LEFT JOIN ${SCHEMA}.tb_dsod_cep ce ON ce.cd_cep = e.cd_cep
    WHERE g.cd_tributo IN (${codigos.join(',')}) AND YEAR(p.dt_vencimento) = ${anoVenc} AND MONTH(p.dt_vencimento) = ${mesVenc}
    GROUP BY g.cd_contr, cp.nm_rsocial, cp.no_cpf_cnpj
    ORDER BY saldo DESC`, top)
  return r.rows
    .map(row => {
      const rua = String(row[4] ?? '').trim()
      const numero = String(row[5] ?? '').trim()
      const bairro = String(row[6] ?? '').trim()
      const cep = String(row[7] ?? '').trim()
      const partes = [rua && (numero ? `${rua}, ${numero}` : rua), bairro, cep ? `CEP ${cep}` : ''].filter(Boolean)
      return {
        cd: num(row[0]), nome: String(row[1] ?? '').trim() || 'Não informado', cpfCnpj: String(row[2] ?? '').trim(), saldo: num(row[3]),
        endereco: partes.join(' — ') || 'Endereço não cadastrado',
      }
    })
    .filter(x => x.saldo > 0)
}

/**
 * LANÇADO oficial (Regra 1): SUM(vl_movimento) de tb_dsod_parcela_movimento com
 * cd_tipo_movimento IN (1,2,3), no_parcela <> 0 e guia.ds_situacao fora de
 * ('Recalculo','Validacao'). Retorna o lançado por exercício de lançamento.
 * NÃO usa parcela_posicao.vl_lancto (modelo antigo).
 */
const LANC_SIT_EXCLUIR = new Set(['Recalculo', 'Validacao'])

export async function lancadoOficial(codigos: number[]): Promise<Map<number, number>> {
  return cached(`lancOf:${codigos.join('.')}`, TTL_15MIN, () => lancadoOficialRaw(codigos))
}

async function lancadoOficialRaw(codigos: number[]): Promise<Map<number, number>> {
  const r = await agentQuery(`
    SELECT g.no_exercicio_lancamento AS ex, g.ds_situacao AS sit, SUM(pm.vl_movimento) AS vl
    FROM ${SCHEMA}.tb_dsod_guias g
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
    JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
    WHERE g.cd_tributo IN (${codigos.join(',')})
      AND pm.cd_tipo_movimento IN (1, 2, 3)
      AND p.no_parcela NOT IN (0)
    GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 3000)

  const map = new Map<number, number>()
  for (const row of r.rows) {
    const ex = num(row[0])
    if (!(ex >= 2005 && ex <= 2035)) continue
    const sit = String(row[1] ?? '').trim()
    if (LANC_SIT_EXCLUIR.has(sit)) continue
    map.set(ex, (map.get(ex) ?? 0) + num(row[2]))
  }
  return map
}

/**
 * Buckets oficiais do IPTU (Regras 1-6, def. do usuário) por exercício de lançamento.
 * Tudo em cima de tb_dsod_parcela_movimento (vl_movimento / vl_movimento*no_sinal),
 * cd_tributo 1, no_parcela<>0. Adaptado às restrições do IQ (sem <=, <>, literal
 * de texto no WHERE, sem subquery/HAVING) — filtros de texto e sinal resolvidos em JS.
 */
export interface BucketsIptuAno {
  lancado: number
  arrecadado: number
  emAberto: number       // saldo em aberto total (a receber)
  inadimplente: number   // saldo em aberto vencido
  isento: number
  suspenso: number
}

const IPTU_COD = '1'

/**
 * Lançado/Arrecadado OFICIAL do IPTU (mesmas regras de lancadoOficial/bucketsIptu acima)
 * para UM único exercício — versão enxuta pra telas que só precisam desses dois números de
 * um ano específico (ex.: Cobrança → Análise de Conversão, "Por Tributo"). bucketsIptu/
 * bucketsIptuAteMes calculam a série de TODOS os exercícios de uma vez (caro, só viável
 * porque bucketsIptu() é pré-aquecido 2x/dia via lib/warmup.ts — bucketsIptuAteMes NÃO é
 * pré-aquecido, então chamá-la sob demanda por mês arrisca timeout); aqui o filtro
 * `g.no_exercicio_lancamento = ano` já na query mantém o escopo pequeno o bastante pra
 * rodar direto, sem depender de cache pré-aquecido.
 */
export interface IptuOficialAno { lancado: number; arrecadado: number }

export async function iptuOficialAno(ano: number, mes?: number): Promise<IptuOficialAno> {
  return cached(`iptuOficialAno:${ano}:${mes ?? ''}`, TTL_15MIN, () => iptuOficialAnoRaw(ano, mes))
}

async function iptuOficialAnoRaw(ano: number, mes?: number): Promise<IptuOficialAno> {
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const [lancR, arrecR] = await Promise.all([
    agentQuery(`
      SELECT g.ds_situacao AS sit, SUM(pm.vl_movimento) AS vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (1, 2, 3)
        AND p.no_parcela NOT IN (0) AND g.no_exercicio_lancamento = ${ano}${filtroMes}
      GROUP BY g.ds_situacao`, 20),
    agentQuery(`
      SELECT g.ds_situacao AS sit, SUM(pm.vl_movimento) AS vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (11, 14)
        AND p.no_parcela NOT IN (0) AND pm.cd_tipo_lancamento IN (0, 4, 7, 10)
        AND pb.cd_tipo_baixa NOT IN (28) AND YEAR(pb.dt_baixa) >= g.no_exercicio_lancamento
        AND g.no_exercicio_lancamento = ${ano}${filtroMes}
      GROUP BY g.ds_situacao`, 20),
  ])
  const soma = (rows: unknown[][]) => rows
    .filter(r => !LANC_SIT_EXCLUIR.has(String(r[0] ?? '').trim()))
    .reduce((s, r) => s + num(r[1]), 0)
  return { lancado: soma(lancR.rows), arrecadado: soma(arrecR.rows) }
}

export async function bucketsIptu(): Promise<Map<number, BucketsIptuAno>> {
  return cached('bucketsIptu', TTL_15MIN, bucketsIptuRaw)
}

// Em aberto / inadimplência conforme queries de referência (15/07): net por
// (exercício, devedor, vencimento), com HAVING. Em aberto = todos net>0; inadimplência
// = só vencidos (dt_vencimento < hoje-1) net>1. Limitado a exercícios recentes (custo).
const MOV_ABERTO = '0,1,2,3,11,12,14,20', LANC_ABERTO = '0,4,7,10,1'
function qEmAbertoInad(vencido: boolean, exFloor = 2019): string {
  const venc = vencido ? ' AND p.dt_vencimento < getdate()-1' : ''
  const th = vencido ? '1' : '0'
  return `SELECT ex, SUM(valor) vl FROM (
      SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${IPTU_COD}) AND g.no_exercicio_lancamento >= ${exFloor} AND p.no_parcela <> 0
        AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${venc}
      GROUP BY g.no_exercicio_lancamento, g.cd_devedor, p.dt_vencimento
      HAVING SUM(pm.vl_movimento * pm.no_sinal) > ${th}
    ) t GROUP BY ex`
}

async function bucketsIptuRaw(): Promise<Map<number, BucketsIptuAno>> {
  const [lanc, arrecRows, abertoRows, inadRows, isenRows, suspRows] = await Promise.all([
    lancadoOficial([1]),
    // Arrecadado: movimento 11,14 · lançamento 0,4,7,10 · exclui tipo_baixa 28 (Estorno)
    // · exclui guia Recalculo/Validacao (em JS).
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, g.ds_situacao AS sit, SUM(pm.vl_movimento) AS vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (11, 14)
        AND p.no_parcela NOT IN (0) AND pm.cd_tipo_lancamento IN (0, 4, 7, 10)
        AND pb.cd_tipo_baixa NOT IN (28)
        AND YEAR(pb.dt_baixa) >= g.no_exercicio_lancamento
      GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 400),
    // Em aberto (todos net>0) e Inadimplência (vencidos net>1) — por exercício (referência 15/07)
    agentQuery(qEmAbertoInad(false), 200),
    agentQuery(qEmAbertoInad(true), 200),
    // Isento: movimento 12,5 · lançamento 1 · setor de origem da baixa = 'Isencao' (filtro em JS).
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, pb.ds_setor_origem_baixa AS setor, SUM(pm.vl_movimento) AS vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (12, 5)
        AND pm.cd_tipo_lancamento IN (1) AND p.no_parcela NOT IN (0)
      GROUP BY g.no_exercicio_lancamento, pb.ds_setor_origem_baixa`, 400),
    // Suspenso: movimento 20 · valor = |net| (devedores com net<0). Aproximado por -SUM(net).
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ex, SUM(pm.vl_movimento * pm.no_sinal) AS net
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (20) AND p.no_parcela NOT IN (0)
      GROUP BY g.no_exercicio_lancamento`, 200),
  ])

  return montarBuckets(lanc, arrecRows.rows, abertoRows.rows, inadRows.rows, isenRows.rows, suspRows.rows)
}

// Montagem dos buckets a partir das linhas cruas (compartilhado entre total e por bairro).
// abertoRows/inadRows já vêm agregados por exercício ([ex, valor]).
function montarBuckets(lanc: Map<number, number>, arrecRows: unknown[][], abertoRows: unknown[][], inadRows: unknown[][], isenRows: unknown[][], suspRows: unknown[][]): Map<number, BucketsIptuAno> {
  const get = (m: Map<number, BucketsIptuAno>, ex: number) =>
    m.get(ex) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
  const map = new Map<number, BucketsIptuAno>()

  for (const [ex, v] of lanc) { const b = get(map, ex); b.lancado = v; map.set(ex, b) }
  for (const row of arrecRows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    if (LANC_SIT_EXCLUIR.has(String(row[1] ?? '').trim())) continue
    const b = get(map, ex); b.arrecadado += num(row[2]); map.set(ex, b)
  }
  for (const row of abertoRows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    const b = get(map, ex); b.emAberto = Math.max(0, num(row[1])); map.set(ex, b)
  }
  for (const row of inadRows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    const b = get(map, ex); b.inadimplente = Math.max(0, num(row[1])); map.set(ex, b)
  }
  for (const row of isenRows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    if (String(row[1] ?? '').trim() !== 'Isencao') continue
    const b = get(map, ex); b.isento += num(row[2]); map.set(ex, b)
  }
  for (const row of suspRows) {
    const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
    const b = get(map, ex); b.suspenso = Math.max(0, -num(row[1])); map.set(ex, b)
  }
  return map
}

/**
 * Buckets do IPTU FILTRADOS por bairro (via cd_origem→imóvel→cep). Mesma lógica do
 * bucketsIptu, mas com o JOIN de imóvel/cep e o bairro no WHERE. Como um bairro é um
 * subconjunto pequeno, roda rápido. Usado no filtro "tela toda por bairro".
 */
export async function bucketsIptuBairro(bairro: string): Promise<Map<number, BucketsIptuAno>> {
  return cached(`bucketsIptuBairro:${bairro}`, TTL_15MIN, async () => {
    const jb = `JOIN ${SCHEMA}.tb_dsod_imovel_urbano iu ON g.cd_devedor = iu.cd_imovel_urbano
      JOIN ${SCHEMA}.tb_dsod_cep ce ON iu.cd_cep = ce.cd_cep AND ce.nm_bairro = '${bairro.replace(/'/g, "''")}'`
    const qAbInBairro = (vencido: boolean) => `SELECT ex, SUM(valor) vl FROM (
        SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento*pm.no_sinal) valor
        FROM ${SCHEMA}.tb_dsod_guias g ${jb}
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
        WHERE g.cd_tributo IN (${IPTU_COD}) AND p.no_parcela <> 0
          AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${vencido ? ' AND p.dt_vencimento < getdate()-1' : ''}
        GROUP BY g.no_exercicio_lancamento, g.cd_devedor, p.dt_vencimento
        HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${vencido ? '1' : '0'}
      ) t GROUP BY ex`
    const [lancRows, arrecRows, abertoRows, inadRows, isenRows, suspRows] = await Promise.all([
      agentQuery(`SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
        FROM ${SCHEMA}.tb_dsod_guias g ${jb}
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
        WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela NOT IN (0)
        GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 800),
      agentQuery(`SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
        FROM ${SCHEMA}.tb_dsod_guias g ${jb}
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
        JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
        WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
          AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
          AND YEAR(pb.dt_baixa) >= g.no_exercicio_lancamento
        GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 800),
      agentQuery(qAbInBairro(false), 200),
      agentQuery(qAbInBairro(true), 200),
      agentQuery(`SELECT g.no_exercicio_lancamento ex, pb.ds_setor_origem_baixa setor, SUM(pm.vl_movimento) vl
        FROM ${SCHEMA}.tb_dsod_guias g ${jb}
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
        JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
        WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (12,5) AND pm.cd_tipo_lancamento IN (1) AND p.no_parcela NOT IN (0)
        GROUP BY g.no_exercicio_lancamento, pb.ds_setor_origem_baixa`, 400),
      agentQuery(`SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento*pm.no_sinal) net
        FROM ${SCHEMA}.tb_dsod_guias g ${jb}
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
        WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (20) AND p.no_parcela NOT IN (0)
        GROUP BY g.no_exercicio_lancamento`, 200),
    ])
    // Lançado do bairro (mesma regra do lancadoOficial: exclui Recalculo/Validacao)
    const lancMap = new Map<number, number>()
    for (const row of lancRows.rows) {
      const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
      if (LANC_SIT_EXCLUIR.has(String(row[1] ?? '').trim())) continue
      lancMap.set(ex, (lancMap.get(ex) ?? 0) + num(row[2]))
    }
    return montarBuckets(lancMap, arrecRows.rows, abertoRows.rows, inadRows.rows, isenRows.rows, suspRows.rows)
  })
}

/**
 * ISENTO oficial (regra do usuário): SUM(vl_movimento) mov<=3, cd_tributo 1, parcela<>0,
 * guia fora de Recalculo/Validacao, dos devedores com isenção ativa no exercício
 * (datepart(year, dt_fim) >= exercício) e ds_isencao que NÃO seja TCA / Não Incidência ITBI /
 * TCA-Imóvel Locado (ou nula). Fonte: tb_extr_isencoes (por cd_origem = cd_devedor).
 * ⚠️ Requer permissão de SELECT em tb_extr_isencoes — se não houver, retorna null (fallback).
 */
export async function isentoIptu(ano: number): Promise<number | null> {
  return cached(`iptuIsento:${ano}`, TTL_15MIN, async () => {
    try {
      const r = await agentQuery(`
        SELECT SUM(pm.vl_movimento) AS vl
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON g.cd_guia = p.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (${ano})
          AND pm.cd_tipo_movimento <= 3 AND p.no_parcela <> 0
          AND g.ds_situacao NOT IN ('Recalculo','Validacao')
          AND g.cd_devedor IN (
            SELECT e.cd_origem FROM ${SCHEMA}.tb_extr_isencoes e
            WHERE datepart(year, e.dt_fim) >= ${ano}
              AND (e.ds_isencao NOT IN ('TCA','Não Incidência de ITBI','TCA - Imóvel Locado a Órgão Público') OR e.ds_isencao IS NULL))`, 1)
      return num(r.rows[0]?.[0])
    } catch {
      return null // sem permissão na tabela de isenções → usa fallback (regra antiga)
    }
  })
}

/**
 * Data de atualização dos dados = MAX(dt_alter_ods) das guias (data de carga da origem).
 * Retorna string 'YYYY-MM-DD' ou null. TTL próprio de 30min (não o TTL_15MIN de 24h usado
 * pelo resto do arquivo) — a carga de origem foi medida caindo às 21h; com cache de 24h
 * (só reabastecido pelo warmup às 8h/12h) o rótulo ficaria mostrando o dia anterior por até
 * ~11h depois da carga do dia. Ver REGISTRO em lib/cache.ts (TTL_30MIN).
 */
export async function dataAtualizacaoIptu(): Promise<string | null> {
  return cached('dataAtualizIptu', TTL_30MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${SCHEMA}.tb_dsod_guias`, 1)
    const v = r.rows[0]?.[0]
    if (!v) return null
    return String(v).slice(0, 10) // 'YYYY-MM-DD'
  })
}
// Alias — o dado é o mesmo (data de carga das guias, cross-tributo), reaproveitado pelo
// painel compartilhado ISS/TFE/TFHS/Outros Tributos (PainelTributo).
export const dataAtualizacaoTributo = dataAtualizacaoIptu

/**
 * ARRECADADO do IPTU acumulado até um MÊS DE REFERÊNCIA (YTD), por exercício — parcelas
 * com vencimento até o mês `mesRef`. Serve para comparar anos de forma justa: o arrecadado
 * é um FLUXO que acumula ao longo do ano, então comparar 2026-até-julho com 2025-até-julho
 * evita a distorção do ano corrente parcial. (Em aberto e inadimplência NÃO usam mês de
 * referência — são posições atuais: ver bucketsIptu, que já separa vencido de a vencer.)
 */
export async function arrecadadoIptuMes(mesRef: number): Promise<Map<number, number>> {
  return cached(`arrecadadoIptuMes:${mesRef}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
        AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
        AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND MONTH(p.dt_vencimento) <= ${mesRef}
      GROUP BY g.no_exercicio_lancamento`, 200)
    const map = new Map<number, number>()
    for (const row of r.rows) { const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue; map.set(ex, num(row[1])) }
    return map
  })
}

/**
 * Buckets do IPTU ACUMULADOS até um mês (posição das parcelas com vencimento até `mes`),
 * por exercício. Usado quando o usuário seleciona um mês no filtro — a tela reflete a
 * posição "ano + mês acumulado":
 *  • lancado    = SUM(mov 1,2,3) das parcelas venc mês<=ref (exclui Recalculo/Validacao)
 *  • arrecadado = baixas 11,14 dessas parcelas
 *  • emAberto   = saldo total (parcela_posicao) dessas parcelas (a receber)
 *  • inadimplente = saldo vencido (dt_vencimento < hoje) dessas parcelas (atrasado)
 */
export interface BucketAteMesIptu { lancado: number; arrecadado: number; emAberto: number; inadimplente: number }

export async function bucketsIptuAteMes(mes: number): Promise<Map<number, BucketAteMesIptu>> {
  return cached(`bucketsIptuAteMes:${mes}`, TTL_15MIN, async () => {
    // Em aberto/inadimplência acumulados até o mês (net por devedor+vencimento, referência 15/07)
    const qAteMes = (vencido: boolean) => `SELECT ex, SUM(valor) vl FROM (
        SELECT g.no_exercicio_lancamento ex, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento*pm.no_sinal) valor
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (${IPTU_COD}) AND g.no_exercicio_lancamento >= 2019 AND p.no_parcela <> 0
          AND MONTH(p.dt_vencimento) <= ${mes}
          AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${vencido ? ' AND p.dt_vencimento < getdate()-1' : ''}
        GROUP BY g.no_exercicio_lancamento, g.cd_devedor, p.dt_vencimento
        HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${vencido ? '1' : '0'}
      ) t GROUP BY ex`
    const [lancR, arrecR, abertoR, inadR] = await Promise.all([
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, g.ds_situacao sit, SUM(pm.vl_movimento) vl
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela NOT IN (0)
          AND MONTH(p.dt_vencimento) <= ${mes}
        GROUP BY g.no_exercicio_lancamento, g.ds_situacao`, 800),
      agentQuery(`
        SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        WHERE g.cd_tributo IN (${IPTU_COD}) AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
          AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
          AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND MONTH(p.dt_vencimento) <= ${mes}
          AND YEAR(pb.dt_baixa) >= g.no_exercicio_lancamento
        GROUP BY g.no_exercicio_lancamento`, 200),
      agentQuery(qAteMes(false), 200),
      agentQuery(qAteMes(true), 200),
    ])
    const map = new Map<number, BucketAteMesIptu>()
    const get = (ex: number) => map.get(ex) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0 }
    for (const r of lancR.rows) {
      const ex = num(r[0]); if (!(ex >= 2005 && ex <= 2035)) continue
      if (LANC_SIT_EXCLUIR.has(String(r[1] ?? '').trim())) continue
      const b = get(ex); b.lancado += num(r[2]); map.set(ex, b)
    }
    for (const r of arrecR.rows) { const ex = num(r[0]); if (!(ex >= 2005 && ex <= 2035)) continue; const b = get(ex); b.arrecadado = num(r[1]); map.set(ex, b) }
    for (const r of abertoR.rows) { const ex = num(r[0]); if (!(ex >= 2005 && ex <= 2035)) continue; const b = get(ex); b.emAberto = Math.max(0, num(r[1])); map.set(ex, b) }
    for (const r of inadR.rows) { const ex = num(r[0]); if (!(ex >= 2005 && ex <= 2035)) continue; const b = get(ex); b.inadimplente = Math.max(0, num(r[1])); map.set(ex, b) }
    return map
  })
}

/**
 * Série MENSAL do IPTU de um exercício (para o drill "por mês"), tudo por MÊS:
 *  • lancado  = SUM(vl_movimento) mov 1,2,3 por MÊS de vencimento da parcela
 *  • arrecadado = SUM(vl_movimento) baixas 11,14 por MÊS da baixa (pagamento)
 *  • inadimplencia = saldo VENCIDO (dt_vencimento < hoje, em aberto) por MÊS de vencimento
 *    — distribui a inadimplência no mês real em que a parcela venceu (consistente com o card anual).
 */
export interface IptuMes { mes: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }

export async function serieMensalIptu(ano: number): Promise<IptuMes[]> {
  return cached(`iptuMensal:${ano}`, TTL_15MIN, async () => {
    // em aberto (net>0) e inadimplência (vencido net>1) por MÊS de vencimento — referência 15/07
    const qMes = (vencido: boolean) => `SELECT m, SUM(valor) vl FROM (
        SELECT MONTH(p.dt_vencimento) m, g.cd_devedor dev, p.dt_vencimento venc, SUM(pm.vl_movimento*pm.no_sinal) valor
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (${ano}) AND p.no_parcela <> 0
          AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${vencido ? ' AND p.dt_vencimento < getdate()-1' : ''}
        GROUP BY MONTH(p.dt_vencimento), g.cd_devedor, p.dt_vencimento
        HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${vencido ? '1' : '0'}
      ) t GROUP BY m`
    const [lancR, arrecR, abertoR, inadR] = await Promise.all([
      agentQuery(`
        SELECT MONTH(p.dt_vencimento) AS m, SUM(pm.vl_movimento) AS vl
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (${ano})
          AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela NOT IN (0)
          AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        GROUP BY MONTH(p.dt_vencimento)`, 40),
      agentQuery(`
        SELECT MONTH(pb.dt_baixa) AS m, SUM(pm.vl_movimento) AS vl
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (${ano})
          AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
          AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
          AND g.ds_situacao NOT IN ('Recalculo','Validacao')
          AND YEAR(pb.dt_baixa) >= ${ano}
        GROUP BY MONTH(pb.dt_baixa)`, 40),
      agentQuery(qMes(false), 40),
      agentQuery(qMes(true), 40),
    ])
    const lanc = new Map<number, number>(), arr = new Map<number, number>(), aberto = new Map<number, number>(), inad = new Map<number, number>()
    for (const r of lancR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) lanc.set(m, num(r[1])) }
    for (const r of arrecR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) arr.set(m, num(r[1])) }
    for (const r of abertoR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) aberto.set(m, Math.max(0, num(r[1]))) }
    for (const r of inadR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) inad.set(m, Math.max(0, num(r[1]))) }
    const out: IptuMes[] = []
    for (let m = 1; m <= 12; m++) {
      out.push({ mes: m, lancado: lanc.get(m) ?? 0, arrecadado: arr.get(m) ?? 0, emAberto: aberto.get(m) ?? 0, inadimplencia: inad.get(m) ?? 0 })
    }
    return out
  })
}

/**
 * PREVISÃO mês a mês de um exercício futuro (ex.: 2027). Distribui os totais anuais
 * projetados (regressão linear dos 5 anos reais, por métrica) pela SAZONALIDADE média
 * dos 3 últimos anos reais (participação de cada mês no total do ano). Usado no drill do
 * gráfico de Evolução ao clicar na barra de previsão.
 */
export async function previsaoMensalIptu(anoPrev: number): Promise<IptuMes[]> {
  return cached(`iptuPrevMensal:${anoPrev}`, TTL_15MIN, async () => {
    const anoMax = anoPrev - 1
    const buckets = await bucketsIptu()
    // Projeção anual (full year) por regressão linear simples dos 5 anos reais.
    const histAnos: number[] = []
    for (let a = anoMax - 4; a <= anoMax; a++) histAnos.push(a)
    const zero = { lancado: 0, arrecadado: 0, emAberto: 0, inadimplente: 0, isento: 0, suspenso: 0 }
    const hist = histAnos.map(a => buckets.get(a) ?? zero)
    const proj = (sel: (b: typeof zero) => number) => {
      const pts = histAnos.map((x, i) => ({ x, y: sel(hist[i]) }))
      const n = pts.length, sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0)
      const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
      const den = n * sxx - sx * sx
      if (!den) return sy / n
      const b = (n * sxy - sx * sy) / den, a0 = (sy - b * sx) / n
      return Math.max(0, a0 + b * anoPrev)
    }
    const annL = proj(b => b.lancado), annA = proj(b => b.arrecadado), annE = proj(b => b.emAberto), annI = proj(b => b.inadimplente)

    // Sazonalidade: média da participação mensal dos 3 últimos anos reais, por métrica.
    const anosShare = [anoMax, anoMax - 1, anoMax - 2].filter(a => a >= 2005)
    const series = await Promise.all(anosShare.map(a => serieMensalIptu(a)))
    const shL = Array(12).fill(0), shA = Array(12).fill(0), shE = Array(12).fill(0), shI = Array(12).fill(0)
    let nL = 0, nA = 0, nE = 0, nI = 0
    for (const s of series) {
      const tL = s.reduce((x, m) => x + m.lancado, 0), tA = s.reduce((x, m) => x + m.arrecadado, 0), tE = s.reduce((x, m) => x + m.emAberto, 0), tI = s.reduce((x, m) => x + m.inadimplencia, 0)
      if (tL > 0) { for (const m of s) shL[m.mes - 1] += m.lancado / tL; nL++ }
      if (tA > 0) { for (const m of s) shA[m.mes - 1] += m.arrecadado / tA; nA++ }
      if (tE > 0) { for (const m of s) shE[m.mes - 1] += m.emAberto / tE; nE++ }
      if (tI > 0) { for (const m of s) shI[m.mes - 1] += m.inadimplencia / tI; nI++ }
    }
    const out: IptuMes[] = []
    for (let m = 1; m <= 12; m++) {
      out.push({
        mes: m,
        lancado: annL * (nL ? shL[m - 1] / nL : 1 / 12),
        arrecadado: annA * (nA ? shA[m - 1] / nA : 1 / 12),
        emAberto: annE * (nE ? shE[m - 1] / nE : 1 / 12),
        inadimplencia: annI * (nI ? shI[m - 1] / nI : 1 / 12),
      })
    }
    return out
  })
}

/**
 * Quantidade de imóveis lançados de IPTU por exercício = COUNT(DISTINCT cd_guia) na base oficial
 * de lançamento (cd_tributo 1, no_parcela<>0, exclui guia Recalculo/Validacao).
 */
export async function qtdImoveisIptu(): Promise<Map<number, number>> {
  return cached('qtdImoveisIptu', TTL_15MIN, async () => {
    // Cada guia de IPTU = um imóvel lançado no exercício. Conta direto na tabela de guias
    // (sem join com parcelas — evita 502 por peso), excluindo Recalculo/Validacao (em JS).
    const r = await agentQuery(`
      SELECT no_exercicio_lancamento AS ex, ds_situacao AS sit, COUNT(*) AS qt
      FROM ${SCHEMA}.tb_dsod_guias
      WHERE cd_tributo IN (1)
      GROUP BY no_exercicio_lancamento, ds_situacao`, 400)
    const map = new Map<number, number>()
    for (const row of r.rows) {
      const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
      if (LANC_SIT_EXCLUIR.has(String(row[1] ?? '').trim())) continue
      map.set(ex, (map.get(ex) ?? 0) + num(row[2]))
    }
    return map
  })
}

// Guias de IPTU com baixa de ISENÇÃO (movimento 12/5, lançamento 1, setor de origem da baixa
// = 'Isencao') — mesma regra oficial usada em bucketsIptu para o KPI "Total Isento". Isenção
// NÃO aparece em g.ds_situacao (só 3 guias no banco inteiro têm ds_situacao='Isenta', ambas de
// 2001/2002) — o sinal real é essa baixa. Reaproveitada por formaPagamentoIptu (abaixo) e pelas
// queries de status de pagamento em lib/iptu-agg.ts (resumoIptu/imoveisPorPagamento): todas
// precisam excluir guia isenta da classificação de pagamento, senão ela cai em "Em aberto" (um
// imóvel isento nunca tem vl_pagto > 0 — não é "pago", é dispensado). Lista pequena (54 guias
// no total, medido) — usada como NOT IN direto, nunca como JOIN (uma guia isenta tem várias
// linhas de baixa Isencao, uma por lançamento — juntar na query de classificação inflaria o
// SUM(vl_pagto)/SUM(vl_saldo) por fan-out).
export async function guiasIsentasIptu(): Promise<number[]> {
  return cached('guiasIsentasIptu', TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT DISTINCT g.cd_guia
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_tributo IN (1) AND pm.cd_tipo_movimento IN (12, 5)
        AND pm.cd_tipo_lancamento IN (1) AND p.no_parcela NOT IN (0)
        AND pb.ds_setor_origem_baixa = 'Isencao'`, 500)
    return r.rows.map(row => num(row[0])).filter(Boolean)
  })
}

/**
 * Imóveis (guias) de IPTU por FORMA DE PAGAMENTO e exercício. Classifica cada guia:
 *  • Cota única  = parcela 0 (única) teve pagamento (vl_pagto > 0)
 *  • Em aberto   = nenhum pagamento
 *  • Parcelado   = parcelas 1-N totalmente quitadas (saldo <= 0), sem pagar a única
 *  • Pago Parcial= pagou parte (nem tudo, e não pela única)
 * Só guias ATIVA (não Recalculo/Validacao/Cancelada/etc.) e excluindo guias isentas (ver
 * guiasIsentasIptu acima) — bug relatado: um imóvel isento (ex.: Arujá Golf Clube) caía em
 * "Em aberto" mesmo sem dever nada.
 */
export interface FormaPagtoAno { cotaUnica: number; parcelado: number; pagoParcial: number; emAberto: number }

export async function formaPagamentoIptu(): Promise<Map<number, FormaPagtoAno>> {
  return cached('formaPagtoIptu', TTL_15MIN, async () => {
    const guiasIsentas = await guiasIsentasIptu()
    const excluirIsentas = guiasIsentas.length ? ` AND g.cd_guia NOT IN (${guiasIsentas.join(',')})` : ''

    const r = await agentQuery(`
      SELECT ex, categoria, COUNT(*) AS qt FROM (
        SELECT g.no_exercicio_lancamento AS ex, g.cd_guia,
          CASE
            WHEN SUM(CASE WHEN p.no_parcela = 0 THEN pp.vl_pagto ELSE 0 END) > 0 THEN 'CotaUnica'
            WHEN SUM(pp.vl_pagto) = 0 THEN 'EmAberto'
            WHEN SUM(CASE WHEN p.no_parcela <> 0 THEN pp.vl_saldo ELSE 0 END) <= 0 THEN 'Parcelado'
            ELSE 'PagoParcial'
          END AS categoria
        FROM ${SCHEMA}.tb_dsod_guias g
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${SCHEMA}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento BETWEEN 2018 AND 2030
          AND g.ds_situacao = 'Ativa'${excluirIsentas}
        GROUP BY g.no_exercicio_lancamento, g.cd_guia
      ) t GROUP BY ex, categoria`, 200)
    const map = new Map<number, FormaPagtoAno>()
    for (const row of r.rows) {
      const ex = num(row[0]); if (!(ex >= 2005 && ex <= 2035)) continue
      const cat = String(row[1] ?? '').trim(), qt = num(row[2])
      const b = map.get(ex) ?? { cotaUnica: 0, parcelado: 0, pagoParcial: 0, emAberto: 0 }
      if (cat === 'CotaUnica') b.cotaUnica = qt
      else if (cat === 'Parcelado') b.parcelado = qt
      else if (cat === 'PagoParcial') b.pagoParcial = qt
      else if (cat === 'EmAberto') b.emAberto = qt
      map.set(ex, b)
    }
    return map
  })
}

/**
 * Split do saldo devedor por exercício em VENCIDO (inadimplência) × A VENCER (em aberto),
 * comparando a data de vencimento da parcela com hoje. Agrupa por ano/mês de vencimento
 * (evita operador < no SQL, que quebra o agente IQ) e classifica em JS.
 */
export async function saldoVencidoAberto(grupo: GrupoTributo): Promise<Map<number, { vencido: number; aberto: number }>> {
  return cached(`saldoVA:${grupo}`, TTL_15MIN, () => saldoVAraw(grupo))
}

export interface PotencialTributo { nome: string; codigos: number[]; vencido: number; aVencer: number }
export interface PotencialArrecadacao {
  vencido: number
  aVencer: number
  porTributo: PotencialTributo[]
}

const TOP_N_POTENCIAL = 10

/**
 * "Potencial de Arrecadação" (Cobrança): do total de saldo em aberto (todos os tributos, a
 * nível analítico), quanto já está VENCIDO (inadimplência genuína, ação de cobrança já
 * cabível) × quanto está A VENCER (parcela ainda não venceu — potencial futuro, não
 * cobrável ainda). Mesma classificação vencido/aberto de saldoVencidoAberto (compara
 * ano/mês de vencimento com hoje, em JS — evita operador < no SQL, que quebra o agente IQ),
 * mas por tributo analítico (cd_tributo individual) em vez de por grupo. `ano` (opcional)
 * restringe ao exercício de lançamento — mesma convenção de rankingTributos.
 */
export async function potencialArrecadacao(ano?: number, mes?: number): Promise<PotencialArrecadacao> {
  return cached(`potencialArrec:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => potencialArrecadacaoRaw(ano, mes))
}

async function potencialArrecadacaoRaw(ano?: number, mes?: number): Promise<PotencialArrecadacao> {
  const filtroAno = ano ? ` AND g.no_exercicio_lancamento = ${ano}` : ''
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const r = await agentQuery(`
    SELECT g.cd_tributo AS cd, t.ds_tributo AS nome, YEAR(p.dt_vencimento) AS vy, MONTH(p.dt_vencimento) AS vm,
           SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    LEFT JOIN ${SCHEMA}.tb_dsod_tributos t ON t.cd_tributo = g.cd_tributo
    WHERE g.cd_tributo NOT IN (${CODIGOS_EXCLUIDOS.join(',')})${filtroAno}${filtroMes}
    GROUP BY g.cd_tributo, t.ds_tributo, YEAR(p.dt_vencimento), MONTH(p.dt_vencimento)`, 5000)

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const porCd = new Map<number, { nome: string; vencido: number; aVencer: number }>()

  for (const row of r.rows) {
    const cd = num(row[0])
    const nome = String(row[1] ?? '').trim() || `Tributo ${cd}`
    const vy = num(row[2]), vm = num(row[3]), saldo = num(row[4])
    if (saldo <= 0) continue
    const vencido = vy < curY || (vy === curY && vm < curM)
    const cur = porCd.get(cd) ?? { nome, vencido: 0, aVencer: 0 }
    if (vencido) cur.vencido += saldo; else cur.aVencer += saldo
    porCd.set(cd, cur)
  }

  const lista = Array.from(porCd.entries())
    .map(([cd, v]) => ({ cd, nome: v.nome, vencido: v.vencido, aVencer: v.aVencer }))
    .filter(x => x.vencido > 0 || x.aVencer > 0)
    .sort((a, b) => b.vencido - a.vencido)

  const top = lista.slice(0, TOP_N_POTENCIAL)
  const resto = lista.slice(TOP_N_POTENCIAL)
  const porTributo: PotencialTributo[] = top.map(t => ({ nome: t.nome, codigos: [t.cd], vencido: t.vencido, aVencer: t.aVencer }))
  if (resto.length) {
    porTributo.push({
      nome: `Demais tributos (${resto.length})`,
      codigos: resto.map(t => t.cd),
      vencido: resto.reduce((s, t) => s + t.vencido, 0),
      aVencer: resto.reduce((s, t) => s + t.aVencer, 0),
    })
  }

  return {
    vencido: lista.reduce((s, t) => s + t.vencido, 0),
    aVencer: lista.reduce((s, t) => s + t.aVencer, 0),
    porTributo,
  }
}

export interface PotencialMes { ano: number; mes: number; saldo: number; vencido: boolean }

/**
 * Drill "quando vence" do ranking de Potencial de Arrecadação (Cobrança): saldo por MÊS DE
 * VENCIMENTO de um ou mais códigos de tributo específicos — a granularidade mensal que
 * potencialArrecadacaoRaw já busca, mas aqui exposta como série (não colapsada em
 * vencido/aVencer), pra revelar a distribuição temporal da dívida (concentrada em meses
 * recentes = mais recuperável; concentrada em meses antigos = mais difícil). Cada
 * (ano,mês) é integralmente vencido ou a vencer relativamente a hoje — não há mistura
 * dentro do mesmo mês.
 */
export async function potencialMensalTributo(codigos: number[], ano?: number, mes?: number): Promise<PotencialMes[]> {
  const chave = [...codigos].sort((a, b) => a - b).join('.')
  return cached(`potencialMensal:${chave}:${ano ?? 'all'}:${mes ?? ''}`, TTL_15MIN, () => potencialMensalTributoRaw(codigos, ano, mes))
}

async function potencialMensalTributoRaw(codigos: number[], ano?: number, mes?: number): Promise<PotencialMes[]> {
  const filtroAno = ano ? ` AND g.no_exercicio_lancamento = ${ano}` : ''
  const filtroMes = mes ? ` AND MONTH(p.dt_vencimento) <= ${mes}` : ''
  const r = await agentQuery(`
    SELECT YEAR(p.dt_vencimento) AS vy, MONTH(p.dt_vencimento) AS vm, SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    WHERE g.cd_tributo IN (${codigos.join(',')})${filtroAno}${filtroMes}
    GROUP BY YEAR(p.dt_vencimento), MONTH(p.dt_vencimento)`, 500)

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1

  return r.rows
    .map(row => {
      const ano2 = num(row[0]), mes = num(row[1]), saldo = num(row[2])
      return { ano: ano2, mes, saldo, vencido: ano2 < curY || (ano2 === curY && mes < curM) }
    })
    .filter(x => x.saldo > 0 && x.ano >= 2005 && x.ano <= 2035 && x.mes >= 1 && x.mes <= 12)
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
}

async function saldoVAraw(grupo: GrupoTributo): Promise<Map<number, { vencido: number; aberto: number }>> {
  const r = await agentQuery(`
    SELECT g.no_exercicio_lancamento AS ex, YEAR(p.dt_vencimento) AS vy, MONTH(p.dt_vencimento) AS vm,
           SUM(pp.vl_saldo) AS saldo
    FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
    JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
    JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
    WHERE ${whereTributo(grupo)}
    GROUP BY g.no_exercicio_lancamento, YEAR(p.dt_vencimento), MONTH(p.dt_vencimento)`, 6000)

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const map = new Map<number, { vencido: number; aberto: number }>()
  for (const row of r.rows) {
    const ex = num(row[0])
    if (!(ex >= 2005 && ex <= 2035)) continue
    const vy = num(row[1]), vm = num(row[2]), saldo = num(row[3])
    if (saldo <= 0) continue
    const cur = map.get(ex) ?? { vencido: 0, aberto: 0 }
    const vencido = vy < curY || (vy === curY && vm < curM)
    if (vencido) cur.vencido += saldo
    else cur.aberto += saldo
    map.set(ex, cur)
  }
  return map
}
