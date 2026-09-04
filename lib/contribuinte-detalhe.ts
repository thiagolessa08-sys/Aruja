import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { CODIGOS_EXCLUIDOS } from '@/lib/tributos'

const SCHEMA = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Grupos de tributo do card "Consultar Contribuinte" — os mesmos 6 grupos "core" de
// lib/tributos.ts (IPTU/ITBI/ISS/TFE/TFHS/ISSCC) MAIS a TCA como grupo próprio, só aqui:
// não mexe em lib/tributos.ts (CODIGOS_CORE é usado por várias outras telas pra decidir o
// que cai em "Outros" — mudar isso ali reclassificaria a TCA em telas que não pediram essa
// quebra). "Outros" deste card = tudo que não é nenhum desses 7 grupos nem um código
// operacional/não-tributo (CODIGOS_EXCLUIDOS).
const GRUPOS_TRIBUTO: { label: string; codigos: number[] }[] = [
  { label: 'IPTU', codigos: [1, 25] },
  { label: 'ITBI', codigos: [10] },
  { label: 'ISS', codigos: [3, 7, 8, 33, 70, 301, 302, 303, 304, 572] },
  { label: 'TFE', codigos: [2002] },
  { label: 'TFHS', codigos: [2003] },
  { label: 'ISSCC', codigos: [40, 17, 18] },
  { label: 'TCA', codigos: [67] },
]
const COD_TO_GRUPO = new Map<number, string>()
for (const grp of GRUPOS_TRIBUTO) for (const c of grp.codigos) COD_TO_GRUPO.set(c, grp.label)
const ORDEM_GRUPOS = [...GRUPOS_TRIBUTO.map(g => g.label), 'Outros']

// Mesmo lookup de lib/divida-engine.ts (ATUALIZADA_LOOKUP) — cd_parcelas não é único em
// tb_dsod_parcelas_atualizadas, então pré-agrega ANTES do JOIN.
const ATUALIZADA_LOOKUP = `SELECT cd_parcelas,
  SUM(vl_parcela) vl_parcela, SUM(vl_correcao) vl_correcao, SUM(vl_juros) vl_juros,
  SUM(vl_multa) vl_multa, SUM(vl_honorarios) vl_honorarios
  FROM ${SCHEMA}.tb_dsod_parcelas_atualizadas GROUP BY cd_parcelas`

// Filtros do "livro-razão de movimento" (tb_dsod_parcela_movimento) — modelo OFICIAL de
// lançado/arrecadado/em aberto por tributo (ver docs/REGRAS-DE-NEGOCIO.md REGRA 4/5 e
// lib/regras-negocio.ts). tb_dsod_parcela_posicao (usado antes aqui) é o "modelo antigo":
// seu vl_lancto NÃO desconta cancelamentos/estornos (fica com o valor bruto original), o que
// fazia "Lançado" aparecer muito maior que "Pago + Em Aberto" pra contribuintes com guias
// canceladas/isentas/suspensas — caso real que motivou a troca: 2HOUSE TRANSACOES IMOBILIARIAS,
// TFE lançado 25,3 mil (posição) vs 12,7 mil (movimento, líquido de estorno), com pago 855 e
// saldo 0 nos dois — só o "lançado" bruto estava errado, mascarando que boa parte já tinha
// sido cancelada/isenta/suspensa, não que o dinheiro estava "sumindo" do em aberto.
const MOV_BASE = `p.no_parcela <> 0 AND g.ds_situacao NOT IN ('Recalculo','Validacao')`
const MOV_LANCADO = `pm.cd_tipo_movimento <= 3`
const MOV_ABERTO = `pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)`

export interface ContribuinteMatch { cd: number; nome: string; doc: string; pessoa: 'F' | 'J' }

// Busca por nome (LIKE em nm_rsocial) ou CPF/CNPJ (dígitos, LIKE em no_cpf_cnpj) — decide
// automaticamente pelo conteúdo digitado, mesmo padrão de app/api/mobiliario/empresa
// quando tipo="" (auto-detecção por regex de dígitos).
export async function buscarContribuintes(q: string, top = 15): Promise<ContribuinteMatch[]> {
  const qn = q.replace(/\D/g, '')
  const cond = qn.length >= 5
    ? `no_cpf_cnpj LIKE '%${esc(qn)}%'`
    : `nm_rsocial LIKE '%${esc(q.toUpperCase())}%'`
  const r = await agentQuery(`
    SELECT TOP ${top} cd_contr, nm_rsocial, no_cpf_cnpj, ic_pessoa
    FROM ${SCHEMA}.tb_dsod_contribuinte
    WHERE ${cond}
    ORDER BY nm_rsocial`, top)
  return r.rows.map(x => ({
    cd: num(x[0]), nome: String(x[1] ?? '').trim() || `Contribuinte ${num(x[0])}`,
    doc: String(x[2] ?? '').trim(), pessoa: String(x[3] ?? '').trim().toUpperCase() === 'F' ? 'F' as const : 'J' as const,
  }))
}

export interface TributoContribuinte { grupo: string; lancado: number; pago: number; saldo: number }
export interface ComposicaoContribuinte { original: number; correcao: number; juros: number; multa: number; honorarios: number; atualizado: number }
export interface EvolucaoAnoContribuinte { ano: number; lancado: number; pago: number; saldo: number }
export interface AdimplenciaContribuinte { totalParcelas: number; pagas: number; vencidas: number; aVencer: number; valorVencido: number; taxaAdimplencia: number }
export type BandaScore = 'A' | 'B' | 'C' | 'D' | 'E'
export interface DetalheContribuinte {
  cd: number; nome: string; doc: string; pessoa: 'F' | 'J'; situacao: string
  email: string; telefone: string; endereco: string; bairro: string; cep: string
  imoveis: number; estabelecimentos: number
  lancado: number; pago: number; isento: number; suspenso: number; saldo: number
  porTributo: TributoContribuinte[]
  composicao: ComposicaoContribuinte
  score: number; banda: BandaScore
  adimplencia: AdimplenciaContribuinte
  evolucaoPorAno: EvolucaoAnoContribuinte[]
}

function bandaDoScore(score: number): BandaScore {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'E'
}

/**
 * Perfil completo de um contribuinte — "o que ele tem" (imóveis, estabelecimentos/inscrição
 * mobiliária) e sua situação tributária (lançado/pago/em aberto por grupo de tributo, mais a
 * composição legal do saldo em aberto: valor original/correção/juros/multa/encargos, e o
 * histórico/evolução por ano). Lançado/pago/em aberto/adimplência vêm do modelo OFICIAL
 * (tb_dsod_parcela_movimento — REGRA 4/5 em lib/regras-negocio.ts); só o Score de Contribuinte
 * (CRC) continua no modelo de tb_dsod_parcela_posicao, pra ficar igual ao gauge agregado já
 * existente na tela.
 */
export async function detalheContribuinte(cd: number): Promise<DetalheContribuinte | null> {
  return cached(`contribuinteDetalhe:${cd}`, TTL_15MIN, () => detalheContribuinteRaw(cd))
}

async function detalheContribuinteRaw(cd: number): Promise<DetalheContribuinte | null> {
  const excl = CODIGOS_EXCLUIDOS.join(',')
  const [cadR, imovR, estabR, lancTribR, pagoTribR, parcelaR, scoreR, lancAnoR, pagoAnoR, isentoR, suspensoR] = await Promise.all([
    agentQuery(`
      SELECT TOP 1 c.cd_contr, c.nm_rsocial, c.no_cpf_cnpj, c.ic_pessoa, c.ds_sit_cadast, c.ds_endereco_email,
        ce.ds_endereco, e.no_logr, ce.nm_bairro, ce.no_cep, tc.telefone
      FROM ${SCHEMA}.tb_dsod_contribuinte c
      LEFT JOIN ${SCHEMA}.tb_dsod_contribuinte_endereco e ON e.cd_contr = c.cd_contr
      LEFT JOIN ${SCHEMA}.tb_dsod_cep ce ON ce.cd_cep = e.cd_cep
      LEFT JOIN (SELECT cd_contr, MIN(no_tel) telefone FROM ${SCHEMA}.tb_dsod_contribuinte_contato GROUP BY cd_contr) tc ON tc.cd_contr = c.cd_contr
      WHERE c.cd_contr = ${cd}`, 1),
    agentQuery(`SELECT COUNT(DISTINCT cd_imovel_urbano) FROM ${SCHEMA}.tb_dsod_imovel_urbano WHERE cd_contr_proprietario = ${cd}`, 1),
    agentQuery(`SELECT COUNT(*) FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario WHERE cd_contr = ${cd}`, 1),
    // LANÇADO por tributo (REGRA 4) — só tipos de movimento <=3 (o lançamento em si; exclui
    // cancelamento/estorno, que tem outro cd_tipo_movimento).
    agentQuery(`
      SELECT g.cd_tributo AS cd, SUM(pm.vl_movimento) AS v
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE} AND ${MOV_LANCADO}
      GROUP BY g.cd_tributo`, 300),
    // ARRECADADO por tributo (REGRA 4) — só baixas de recebimento de fato (exclui estorno de
    // baixa, que devolveria o valor pro "em aberto").
    agentQuery(`
      SELECT g.cd_tributo AS cd, SUM(pm.vl_movimento) AS v
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE}
        AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'
      GROUP BY g.cd_tributo`, 300),
    // Saldo oficial POR PARCELA (REGRA 4, líquido de lançamento/baixas/isenção/suspensão via
    // no_sinal) — SEMPRE agregado neste grão fino (nunca direto por tributo/ano/total): somar
    // vl_movimento*no_sinal de várias parcelas ANTES de isolar quem tem saldo>0 permite que
    // parcelas antigas com saldo NEGATIVO (pagamento a maior, correção, renegociação) cancelem
    // no papel parcelas realmente em aberto de outras datas — bug real encontrado (Robinson
    // Simões, cd_contr 19022: IPTU tinha R$1.536,12 em parcelas individualmente vencidas/a
    // vencer, mas a soma direta por tributo dava -R$3.113,89, que virava 0 ao clampar,
    // escondendo a dívida real). Por isso lançado/pago por tributo/ano continuam agregados
    // direto (tipos de movimento aditivos, sem esse risco de cancelamento) mas "em aberto"
    // (por tributo, por ano e o total) é sempre derivado DAQUI, somando só os bal>0 por
    // parcela — nunca com um SUM(vl_movimento*no_sinal) agrupado direto por outra coisa.
    agentQuery(`
      SELECT p.cd_parcelas AS cd, g.cd_tributo AS trib, g.no_exercicio_lancamento AS ano,
        MAX(p.dt_vencimento) AS venc, SUM(pm.vl_movimento * pm.no_sinal) AS bal
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE} AND ${MOV_ABERTO}
      GROUP BY p.cd_parcelas, g.cd_tributo, g.no_exercicio_lancamento`, 2000),
    // Score de Contribuinte (CRC) — mesma fórmula de lib/contribuinte-filtros.ts::scoreContribuinte
    // (cadastro completo 10 + vínculo CCM 45 + vínculo imóvel 45 − 1 por parcela vencida), aqui
    // pra UM cd_contr em vez de agregada. Continua no modelo de tb_dsod_parcela_posicao (não no
    // movimento) pra ficar igual ao gauge agregado "Score de Contribuinte (CRC)" já existente
    // na tela — só exclui CODIGOS_EXCLUIDOS (ver commit anterior) na contagem de vencidas.
    agentQuery(`
      SELECT
        (CASE WHEN c.no_cpf_cnpj IS NOT NULL AND c.no_cpf_cnpj <> '-1'
              AND c.ds_endereco_email IS NOT NULL AND c.ds_endereco_email <> ''
              AND tc.telefone IS NOT NULL AND ed.cd_contr IS NOT NULL
          THEN 10 ELSE 0 END)
        + (CASE WHEN cp.ic_pessoa_contribuinte_mobiliario = 1 THEN 45 ELSE 0 END)
        + (CASE WHEN cp.ic_pessoa_proprietario = 1 OR cp.ic_pessoa_compromissario = 1 OR cp.ic_pessoa_posseiro = 1 THEN 45 ELSE 0 END)
        - COALESCE(pv.n, 0) AS raw
      FROM ${SCHEMA}.tb_dsod_contribuinte c
      LEFT JOIN ${SCHEMA}.tb_dsod_contribuinte_pessoa cp ON cp.cd_contr = c.cd_contr
      LEFT JOIN (SELECT cd_contr, MIN(no_tel) telefone FROM ${SCHEMA}.tb_dsod_contribuinte_contato GROUP BY cd_contr) tc ON tc.cd_contr = c.cd_contr
      LEFT JOIN (SELECT DISTINCT cd_contr FROM ${SCHEMA}.tb_dsod_contribuinte_endereco) ed ON ed.cd_contr = c.cd_contr
      LEFT JOIN (
        SELECT g.cd_contr cd_contr, COUNT(*) n
        FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
        JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
        JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
        WHERE pp.vl_saldo > 0 AND p.dt_vencimento < getdate() AND g.cd_contr > 0 AND g.cd_tributo NOT IN (${excl})
        GROUP BY g.cd_contr
      ) pv ON pv.cd_contr = c.cd_contr
      WHERE c.cd_contr = ${cd}`, 1),
    // Histórico/evolução por exercício de lançamento — mesmos 3 filtros oficiais acima
    // (lançado/pago/em aberto), agrupados por ano em vez de por tributo.
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ano, SUM(pm.vl_movimento) AS v
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE} AND ${MOV_LANCADO}
      GROUP BY g.no_exercicio_lancamento`, 100),
    agentQuery(`
      SELECT g.no_exercicio_lancamento AS ano, SUM(pm.vl_movimento) AS v
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      JOIN ${SCHEMA}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE}
        AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'
      GROUP BY g.no_exercicio_lancamento`, 100),
    // ISENTO (REGRA 4) — baixa por isenção legal (não é "pago" nem "em aberto": o valor foi
    // dispensado). Só entra aqui quando a baixa tem setor de origem 'Isencao' — validado
    // contra a sanidade documentada em lib/regras-negocio.ts (IPTU 2026 ≈ R$0,5 mi).
    agentQuery(`
      SELECT SUM(pm.vl_movimento) AS v
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${SCHEMA}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE}
        AND pm.cd_tipo_movimento IN (12,5) AND pm.cd_tipo_lancamento IN (1) AND pb.ds_setor_origem_baixa IN ('Isencao')`, 1),
    // SUSPENSO (REGRA 4) — débito com exigibilidade suspensa (ex.: contestação/liminar), não
    // é "em aberto" cobrável nem "pago". Validado contra a sanidade documentada (IPTU 2026 ≈
    // R$1,3 mi).
    agentQuery(`
      SELECT SUM(pm.vl_movimento) AS v
      FROM ${SCHEMA}.tb_dsod_guias g
      JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${SCHEMA}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_contr = ${cd} AND g.cd_tributo NOT IN (${excl}) AND ${MOV_BASE}
        AND pm.cd_tipo_movimento IN (20)`, 1),
  ])

  const c = cadR.rows[0]
  if (!c) return null

  const rua = String(c[6] ?? '').trim()
  const numero = String(c[7] ?? '').trim()
  const bairro = String(c[8] ?? '').trim()
  const cep = String(c[9] ?? '').trim()

  const lancMap = new Map<number, number>()
  for (const row of lancTribR.rows) lancMap.set(num(row[0]), num(row[1]))
  const pagoMap = new Map<number, number>()
  for (const row of pagoTribR.rows) pagoMap.set(num(row[0]), num(row[1]))

  // Saldo por parcela (grão fino) — todo "em aberto" (por tributo, por ano e o total) vem
  // DAQUI, somando só bal>0.01 por parcela antes de agrupar por qualquer outra dimensão (ver
  // comentário na query: evita que parcelas antigas com saldo negativo cancelem parcelas
  // realmente em aberto de outro tributo/ano na mesma soma).
  const hoje = new Date()
  const parcelas = parcelaR.rows.map(row => ({
    cd: num(row[0]), trib: num(row[1]), ano: num(row[2]), venc: String(row[3] ?? ''), bal: num(row[4]),
  }))
  const totalParcelas = parcelas.length
  let pagasParcelas = 0, vencidasParcelas = 0, aVencerParcelas = 0, valorVencido = 0, saldoTotal = 0
  const abertas: number[] = []
  const abertoMap = new Map<number, number>()
  const anoAbertoMap = new Map<number, number>()
  for (const p of parcelas) {
    if (p.bal <= 0.01) { pagasParcelas++; continue }
    abertas.push(p.cd)
    saldoTotal += p.bal
    abertoMap.set(p.trib, (abertoMap.get(p.trib) ?? 0) + p.bal)
    anoAbertoMap.set(p.ano, (anoAbertoMap.get(p.ano) ?? 0) + p.bal)
    const venceu = p.venc && new Date(p.venc) < hoje
    if (venceu) { vencidasParcelas++; valorVencido += p.bal } else { aVencerParcelas++ }
  }

  const codigos = new Set([...lancMap.keys(), ...pagoMap.keys(), ...abertoMap.keys()])
  const grupoMap = new Map<string, { lancado: number; pago: number; saldo: number }>()
  let lancadoTotal = 0, pagoTotal = 0
  for (const codigo of codigos) {
    const grupo = COD_TO_GRUPO.get(codigo) ?? 'Outros'
    const lancado = lancMap.get(codigo) ?? 0, pago = pagoMap.get(codigo) ?? 0, saldo = abertoMap.get(codigo) ?? 0
    lancadoTotal += lancado; pagoTotal += pago
    const acc = grupoMap.get(grupo) ?? { lancado: 0, pago: 0, saldo: 0 }
    acc.lancado += lancado; acc.pago += pago; acc.saldo += saldo
    grupoMap.set(grupo, acc)
  }
  const porTributo: TributoContribuinte[] = ORDEM_GRUPOS
    .map(grupo => ({ grupo, ...(grupoMap.get(grupo) ?? { lancado: 0, pago: 0, saldo: 0 }) }))
    .filter(t => t.lancado > 0 || t.saldo > 0)

  let original = 0, correcao = 0, juros = 0, multa = 0, honorarios = 0
  if (abertas.length) {
    const balPorParcela = new Map(parcelas.map(p => [p.cd, p.bal]))
    const compR = await agentQuery(`
      SELECT cd_parcelas, vl_parcela, vl_correcao, vl_juros, vl_multa, vl_honorarios
      FROM (${ATUALIZADA_LOOKUP}) pa
      WHERE cd_parcelas IN (${abertas.join(',')})`, abertas.length)
    const cobertas = new Set<number>()
    for (const row of compR.rows) {
      const cdP = num(row[0])
      cobertas.add(cdP)
      correcao += num(row[2]); juros += num(row[3]); multa += num(row[4]); honorarios += num(row[5])
      original += num(row[1])
    }
    for (const cdP of abertas) if (!cobertas.has(cdP)) original += balPorParcela.get(cdP) ?? 0
  }

  const scoreRaw = num(scoreR.rows[0]?.[0])
  const score = Math.max(0, Math.min(100, scoreRaw))

  const anoLancMap = new Map<number, number>()
  for (const row of lancAnoR.rows) anoLancMap.set(num(row[0]), num(row[1]))
  const anoPagoMap = new Map<number, number>()
  for (const row of pagoAnoR.rows) anoPagoMap.set(num(row[0]), num(row[1]))
  const anos = new Set([...anoLancMap.keys(), ...anoPagoMap.keys(), ...anoAbertoMap.keys()])
  const evolucaoPorAno: EvolucaoAnoContribuinte[] = Array.from(anos)
    .filter(ano => ano >= 1990 && ano <= 2035)
    .sort((a, b) => a - b)
    .map(ano => ({ ano, lancado: anoLancMap.get(ano) ?? 0, pago: anoPagoMap.get(ano) ?? 0, saldo: anoAbertoMap.get(ano) ?? 0 }))

  return {
    cd, nome: String(c[1] ?? '').trim() || `Contribuinte ${cd}`, doc: String(c[2] ?? '').trim(),
    pessoa: String(c[3] ?? '').trim().toUpperCase() === 'F' ? 'F' : 'J',
    situacao: String(c[4] ?? '').trim(), email: String(c[5] ?? '').trim(), telefone: String(c[10] ?? '').trim(),
    endereco: `${rua}${numero ? ', ' + numero : ''}`, bairro, cep,
    imoveis: num(imovR.rows[0]?.[0]), estabelecimentos: num(estabR.rows[0]?.[0]),
    lancado: lancadoTotal, pago: pagoTotal, isento: num(isentoR.rows[0]?.[0]), suspenso: num(suspensoR.rows[0]?.[0]), saldo: saldoTotal,
    porTributo,
    composicao: { original, correcao, juros, multa, honorarios, atualizado: original + correcao + juros + multa + honorarios },
    score, banda: bandaDoScore(score),
    adimplencia: {
      totalParcelas, pagas: pagasParcelas, vencidas: vencidasParcelas, aVencer: aVencerParcelas, valorVencido,
      taxaAdimplencia: totalParcelas ? (pagasParcelas / totalParcelas) * 100 : 0,
    },
    evolucaoPorAno,
  }
}
