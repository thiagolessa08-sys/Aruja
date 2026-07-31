// Agregações pesadas do IPTU (bairros, ranking, resumo) compartilhadas entre os
// endpoints e o warmup — usam o MESMO cache (mesma key), então o pré-aquecimento
// do boot/agendamento serve as requisições dos usuários direto do cache.
import { agentQuery } from '@/lib/agent'
import { cached, CACHE_TTL } from '@/lib/cache'
import { formaPagamentoIptu } from '@/lib/tributo-engine'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// ===================== BAIRROS (ou ruas no drill) =====================
// Reescrito conforme as queries de referência (15/07): ponte imóvel = g.cd_devedor
// (NÃO cd_origem), e cada métrica tem sua fórmula exata + qtd de imóveis própria.
export type MetricaBairro = 'lancado' | 'arrecadado' | 'inadimplencia' | 'emAberto' | 'isento' | 'suspenso'
export interface FiltrosBairro { ano: number; espolio: boolean; semNumero: boolean; bairro: string | null; rua?: string | null; metrica?: MetricaBairro }

// FROM + WHERE base (ponte cd_devedor→imóvel→cep); junta contribuinte só p/ filtro de espólio.
function baseBairro(f: FiltrosBairro) {
  const joinProp = f.espolio ? `JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario` : ''
  let w = `g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${f.ano} AND p.no_parcela <> 0`
  if (f.espolio) w += ` AND cp.nm_rsocial LIKE '%ESP_LIO%'`
  if (f.semNumero) w += ` AND (i.no_imovel IS NULL OR i.no_imovel = 0)`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  if (f.rua) w += ` AND c.ds_endereco = '${f.rua.replace(/'/g, "''")}'`
  const from = `FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = g.cd_devedor
      JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep
      ${joinProp}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas`
  return { from, where: w }
}

// Monta a query da métrica (retorna: grupo, qtd de imóveis, valor).
function queryMetricaBairro(f: FiltrosBairro, grupo: string): string {
  const b = baseBairro(f)
  const semRV = ` AND g.ds_situacao NOT IN ('Recalculo','Validacao')`
  switch (f.metrica) {
    case 'arrecadado': // item 11
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_devedor) im, SUM(pm.vl_movimento) vl
        ${b.from}
        JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        JOIN ${S}.tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
        WHERE ${b.where}${semRV} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
          AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'
        GROUP BY ${grupo}`
    case 'isento': // item 8
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_devedor) im, SUM(pm.vl_movimento) vl
        ${b.from}
        WHERE ${b.where}${semRV} AND pm.cd_tipo_movimento <= 3
          AND g.cd_devedor IN (SELECT e.cd_origem FROM ${S}.tb_extr_isencoes e
            WHERE datepart(year, e.dt_fim) >= ${f.ano}
              AND (e.ds_isencao NOT IN ('TCA','Não Incidência de ITBI','TCA - Imóvel Locado a Órgão Público') OR e.ds_isencao IS NULL))
        GROUP BY ${grupo}`
    case 'suspenso': // item 9 — só grupos de imóvel com net<0 (mov 20)
      return `SELECT k, COUNT(DISTINCT cd_devedor) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, g.cd_devedor cd_devedor, SUM(pm.vl_movimento) valor
        ${b.from}
        WHERE ${b.where} AND pm.cd_tipo_movimento IN (20)
        GROUP BY ${grupo}, g.cd_devedor HAVING SUM(pm.vl_movimento * pm.no_sinal) < 0
      ) t GROUP BY k`
    case 'emAberto': // item 7 — saldo líquido em aberto (net>0) por parcela vencendo/a vencer
      return `SELECT k, COUNT(DISTINCT cd_devedor) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, g.cd_devedor cd_devedor, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
        ${b.from}
        WHERE ${b.where} AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
        GROUP BY ${grupo}, g.cd_devedor, p.dt_vencimento HAVING SUM(pm.vl_movimento * pm.no_sinal) > 0
      ) t GROUP BY k`
    case 'inadimplencia': // item 12 — saldo líquido VENCIDO (net>1)
      return `SELECT k, COUNT(DISTINCT cd_devedor) im, SUM(valor) vl FROM (
        SELECT ${grupo} k, g.cd_devedor cd_devedor, p.dt_vencimento venc, SUM(pm.vl_movimento * pm.no_sinal) valor
        ${b.from}
        WHERE ${b.where} AND p.dt_vencimento < getdate()-1
          AND pm.cd_tipo_movimento IN (0,1,2,3,12,11,14,20) AND pm.cd_tipo_lancamento IN (4,7,0,10,1)
        GROUP BY ${grupo}, g.cd_devedor, p.dt_vencimento HAVING SUM(pm.vl_movimento * pm.no_sinal) > 1
      ) t GROUP BY k`
    default: // 'lancado' (item 10)
      return `SELECT ${grupo} k, COUNT(DISTINCT g.cd_devedor) im, SUM(pm.vl_movimento) vl
        ${b.from}
        WHERE ${b.where}${semRV} AND pm.cd_tipo_movimento <= 3
        GROUP BY ${grupo}`
  }
}

async function agregadoBairro(f: FiltrosBairro, grupo: string) {
  const r = await agentQuery(queryMetricaBairro(f, grupo), 4000)
  return r.rows
    .map(x => ({ chave: String(x[0] ?? '').trim(), imoveis: num(x[1]), valor: num(x[2]) }))
    .filter(b => b.valor !== 0 || b.imoveis > 0)
    .sort((a, b) => b.valor - a.valor)
}

// Nível imóvel do drill (bairro → rua → imóveis): busca inscrição/número/proprietário
// de cada cd_imovel_urbano agregado, para exibir a lista já identificada. Exportada porque
// o mesmo enriquecimento é reaproveitado pelo drill "ITBI por Bairro" (lib/itbi-agg.ts).
export async function detalhesImoveis(cds: string[]) {
  const map = new Map<string, { inscricao: string; numero: string; proprietario: string }>()
  if (!cds.length) return map
  const e = await agentQuery(`SELECT i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, cp.nm_rsocial
    FROM ${S}.tb_dsod_imovel_urbano i
    LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
    WHERE i.cd_imovel_urbano IN (${cds.join(',')})`, 400)
  for (const row of e.rows) {
    map.set(String(row[0]), { inscricao: String(row[1] ?? '').trim(), numero: String(row[2] ?? '').trim(), proprietario: String(row[3] ?? '').trim() })
  }
  return map
}

export interface ItemBairro { nome: string; imoveis: number; valor: number; cd?: number; inscricao?: string; numero?: string }

export function bairrosIptu(f: FiltrosBairro): Promise<ItemBairro[]> {
  const grupo = f.rua ? 'g.cd_devedor' : f.bairro ? 'c.ds_endereco' : 'c.nm_bairro'
  const met = f.metrica ?? 'lancado'
  const key = `iptuBairros:${f.ano}:${met}:${f.espolio ? 1 : 0}:${f.semNumero ? 1 : 0}:${f.bairro ?? ''}:${f.rua ?? ''}`
  return cached(key, CACHE_TTL, async () => {
    const base = await agregadoBairro({ ...f, metrica: met }, grupo)
    if (!f.rua) return base.map(b => ({ nome: b.chave || '—', imoveis: b.imoveis, valor: b.valor }))
    const det = await detalhesImoveis(base.map(b => b.chave).filter(c => c && c !== '0'))
    return base.map(b => {
      const d = det.get(b.chave)
      return {
        nome: d?.proprietario || `Imóvel ${b.chave}`,
        imoveis: b.imoveis,
        valor: b.valor,
        cd: Number(b.chave) || undefined,
        inscricao: d?.inscricao || '',
        numero: d?.numero || '',
      }
    })
  })
}

// ===================== RANKING (100 maiores) =====================
export type MetricaRank = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia'

function medidaSQL(chave: string, metrica: MetricaRank, base: string, jb: string, extraWhere = '') {
  const w = `${base}${extraWhere}`
  if (metrica === 'lancado') return `SELECT ${chave} k, SUM(pm.vl_movimento) v FROM ${S}.tb_dsod_guias g ${jb}
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
    JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
    WHERE ${w} AND pm.cd_tipo_movimento IN (1,2,3) GROUP BY ${chave}`
  if (metrica === 'arrecadado') return `SELECT ${chave} k, SUM(pm.vl_movimento) v FROM ${S}.tb_dsod_guias g ${jb}
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
    JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
    JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
    WHERE ${w} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28) GROUP BY ${chave}`
  const venc = metrica === 'inadimplencia' ? ' AND p.dt_vencimento < getdate()' : ''
  return `SELECT ${chave} k, SUM(pp.vl_saldo) v FROM ${S}.tb_dsod_guias g ${jb}
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
    JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela=p.cd_parcelas
    WHERE ${w}${venc} GROUP BY ${chave}`
}

export function rankingIptu(tipo: 'imovel' | 'proprietario', ano: number, metrica: MetricaRank, bairro: string | null) {
  return cached(`iptuRank:${tipo}:${ano}:${metrica}:${bairro ?? ''}`, CACHE_TTL, async () => {
    const chave = tipo === 'imovel' ? 'g.cd_origem' : 'g.cd_contr'
    const jb = bairro ? `JOIN ${S}.tb_dsod_imovel_urbano iu ON g.cd_origem=iu.cd_imovel_urbano JOIN ${S}.tb_dsod_cep ce ON iu.cd_cep=ce.cd_cep AND ce.nm_bairro='${bairro.replace(/'/g, "''")}'` : ''
    const base = `g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND p.no_parcela NOT IN (0)`
    const topR = await agentQuery(`SELECT TOP 100 * FROM (${medidaSQL(chave, metrica, base, jb)}) t ORDER BY v DESC`, 120)
    const keys = topR.rows.map(r => String(r[0])).filter(k => k && k !== '0')
    if (!keys.length) return []
    const inKeys = `${chave} IN (${keys.join(',')})`
    const [lancR, arrecR, saldoR] = await Promise.all([
      agentQuery(medidaSQL(chave, 'lancado', base, '', ` AND ${inKeys}`), 200),
      agentQuery(medidaSQL(chave, 'arrecadado', base, '', ` AND ${inKeys}`), 200),
      agentQuery(`SELECT ${chave} k, SUM(pp.vl_saldo) aberto, SUM(CASE WHEN p.dt_vencimento < getdate() THEN pp.vl_saldo ELSE 0 END) vencido
        FROM ${S}.tb_dsod_guias g JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
        JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela=p.cd_parcelas
        WHERE ${base} AND ${inKeys} GROUP BY ${chave}`, 200),
    ])
    const map = new Map<string, { lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }>()
    const g = (k: string) => map.get(k) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplencia: 0 }
    for (const r of lancR.rows) { const k = String(r[0]); const x = g(k); x.lancado = num(r[1]); map.set(k, x) }
    for (const r of arrecR.rows) { const k = String(r[0]); const x = g(k); x.arrecadado = num(r[1]); map.set(k, x) }
    for (const r of saldoR.rows) { const k = String(r[0]); const x = g(k); x.emAberto = Math.max(0, num(r[1])); x.inadimplencia = Math.max(0, num(r[2])); map.set(k, x) }
    const nomes = new Map<string, { nome: string; endereco: string; extra: string }>()
    if (tipo === 'imovel') {
      const e = await agentQuery(`SELECT i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, cp.nm_rsocial
        FROM ${S}.tb_dsod_imovel_urbano i
        LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep=c.cd_cep
        LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr=i.cd_contr_proprietario
        WHERE i.cd_imovel_urbano IN (${keys.join(',')})`, 200)
      for (const r of e.rows) {
        const k = String(r[0]); const rua = String(r[3] ?? '').trim(), no = String(r[2] ?? '').trim(), bairro2 = String(r[4] ?? '').trim()
        nomes.set(k, { nome: `Insc. ${String(r[1] ?? k).trim()}`, endereco: `${rua}${no ? ', ' + no : ''}${bairro2 ? ' — ' + bairro2 : ''}`, extra: String(r[5] ?? '').trim() })
      }
    } else {
      const [e, qi] = await Promise.all([
        agentQuery(`SELECT cd_contr, nm_rsocial, no_cpf_cnpj FROM ${S}.tb_dsod_contribuinte WHERE cd_contr IN (${keys.join(',')})`, 200),
        // Qtd total de imóveis de cada proprietário (item 13/07: mostrar nome + qtd imóveis)
        agentQuery(`SELECT cd_contr_proprietario, COUNT(DISTINCT cd_imovel_urbano) FROM ${S}.tb_dsod_imovel_urbano WHERE cd_contr_proprietario IN (${keys.join(',')}) GROUP BY cd_contr_proprietario`, 200),
      ])
      const qtImap = new Map<string, number>()
      for (const r of qi.rows) qtImap.set(String(r[0]), num(r[1]))
      for (const r of e.rows) nomes.set(String(r[0]), { nome: String(r[1] ?? '').trim() || `Contrib. ${r[0]}`, endereco: `${qtImap.get(String(r[0])) ?? 0} imóveis`, extra: String(r[2] ?? '').trim() })
    }
    return keys.map(k => ({ chave: k, ...g(k), ...(nomes.get(k) ?? { nome: `${tipo === 'imovel' ? 'Imóvel' : 'Contrib.'} ${k}`, endereco: '', extra: '' }) }))
  })
}

// ===================== RESUMO =====================
export interface FiltrosResumo { ano: number; bairro: string | null; rua?: string | null; espolio?: boolean; semNumero?: boolean; mes?: number | null }

// Filtro geográfico/perfil (bairro, rua, espólio, sem número) aplicado direto no cadastro
// de imóveis (sem passar pela guia) — usado no "Total de imóveis" e nas subconsultas IN(...).
function filtroImovelDireto(f: FiltrosResumo, aliasI = 'i', aliasC = 'c', aliasCp = 'cp') {
  let from = `${S}.tb_dsod_imovel_urbano ${aliasI}`
  let where = ''
  if (f.bairro || f.rua) {
    from += ` JOIN ${S}.tb_dsod_cep ${aliasC} ON ${aliasI}.cd_cep=${aliasC}.cd_cep`
    if (f.bairro) where += ` AND ${aliasC}.nm_bairro='${f.bairro.replace(/'/g, "''")}'`
    if (f.rua) where += ` AND ${aliasC}.ds_endereco='${f.rua.replace(/'/g, "''")}'`
  }
  if (f.semNumero) where += ` AND (${aliasI}.no_imovel IS NULL OR ${aliasI}.no_imovel = 0)`
  if (f.espolio) {
    from += ` JOIN ${S}.tb_dsod_contribuinte ${aliasCp} ON ${aliasCp}.cd_contr = ${aliasI}.cd_contr_proprietario`
    where += ` AND ${aliasCp}.nm_rsocial LIKE '%ESP_LIO%'`
  }
  return { from, where }
}

// Mesmo filtro, mas partindo da guia (g.cd_origem → imóvel) — usado nas contagens por guia.
function joinFiltroResumo(f: FiltrosResumo) {
  if (!(f.bairro || f.rua || f.espolio || f.semNumero)) return { join: '', where: '' }
  const { where } = filtroImovelDireto(f, 'iu', 'ce', 'cp')
  let join = `JOIN ${S}.tb_dsod_imovel_urbano iu ON g.cd_origem=iu.cd_imovel_urbano`
  if (f.bairro || f.rua) join += ` JOIN ${S}.tb_dsod_cep ce ON iu.cd_cep=ce.cd_cep`
  if (f.espolio) join += ` JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = iu.cd_contr_proprietario`
  return { join, where }
}

export function resumoIptu(f: FiltrosResumo) {
  const { ano, bairro, rua = null, espolio = false, semNumero = false, mes = null } = f
  return cached(`iptuResumo:${ano}:${bairro ?? ''}:${rua ?? ''}:${espolio ? 1 : 0}:${semNumero ? 1 : 0}:${mes ?? ''}`, CACHE_TTL, async () => {
    const temFiltro = !!(bairro || rua || espolio || semNumero)
    const { join: jb, where: jbw } = joinFiltroResumo(f)
    const ti = filtroImovelDireto(f)
    // Imóveis do filtro (para restringir as contagens que passam por baseIptu)
    const tiSub = filtroImovelDireto(f, 'i2', 'c2', 'cp2')
    const inFiltroSub = temFiltro ? ` AND g2.cd_origem IN (SELECT i2.cd_imovel_urbano FROM ${tiSub.from} WHERE 1=1${tiSub.where})` : ''
    // Base MANDATÓRIA da análise: imóveis com IPTU (cd_tributo=1) do exercício — os que
    // compõem o valor total lançado. Todas as demais contagens são INTERSEÇÃO com essa base.
    // (com filtro, a base já fica restrita → ITBI/empresa deixam de ficar congelados)
    const baseIptu = `SELECT DISTINCT g2.cd_origem FROM ${S}.tb_dsod_guias g2 WHERE g2.cd_tributo=1 AND g2.no_exercicio_lancamento=${ano} AND g2.ds_situacao NOT IN ('Recalculo','Validacao')${inFiltroSub}`
    const tiItbi = filtroImovelDireto(f, 'i3', 'c3', 'cp3')
    // Fim do mês de referência (visão acumulada), quando selecionado — usado nos indicadores
    // que são FLUXO ao longo do ano (ITBI lançado, empresa que passou a existir no endereço).
    // "Com IPTU"/"Com TCA"/situação/total NÃO usam mês: são lançamento único em lote (a
    // maioria em dezembro, conforme geração do exercício), não uma série mensal.
    const fimMes = mes ? `'${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}'` : null
    const fimItbi = fimMes ?? 'getdate()-1'
    const [comIptuR, totalImR, sitR, tcaR, itbiR, empR, semTcaR, forma, formaFiltroR] = await Promise.all([
      // Com IPTU = qtd de imóveis que compõem o lançado do exercício
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo=1 AND g.no_exercicio_lancamento=${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')${jbw}`, 1),
      // Total de imóveis do cadastro (item 10) — respeita bairro/rua/espólio/sem número
      agentQuery(`SELECT COUNT(*) FROM ${ti.from} WHERE 1=1${ti.where}`, 1),
      agentQuery(`SELECT g.ds_situacao, COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo=1 AND g.no_exercicio_lancamento=${ano}${jbw} GROUP BY g.ds_situacao`, 20),
      // Dos imóveis COM IPTU, quantos também têm TCA (cd_tributo=67) no exercício
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo=67 AND g.no_exercicio_lancamento=${ano} AND g.cd_origem IN (${baseIptu})${jbw}`, 1),
      // …quantos imóveis com ITBI lançado no exercício (item 19 — query oficial do Wallace:
      // dt_lancamento no ano até ontem, vl_total>0; NÃO intersecta com a base IPTU) — restrita
      // ao bairro/rua/espólio/sem número quando algum estiver selecionado, e ao mês de
      // referência quando a visão acumulada estiver ativa.
      agentQuery(`SELECT COUNT(DISTINCT iiu.cd_imovel_urbano) FROM ${S}.tb_dsod_itbi itb
        JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = itb.cd_itbi
        ${temFiltro ? `JOIN (SELECT i3.cd_imovel_urbano FROM ${tiItbi.from} WHERE 1=1${tiItbi.where}) fi ON fi.cd_imovel_urbano = iiu.cd_imovel_urbano` : ''}
        WHERE itb.dt_lancamento BETWEEN '${ano}-01-01' AND ${fimItbi} AND itb.vl_total > 0`, 1),
      // …quantos têm empresa no mesmo endereço — dt_inicial é distribuída ao longo do ano
      // (diferente de dt_geracao das guias), então respeita o mês de referência quando ativo.
      agentQuery(`SELECT COUNT(DISTINCT mf.cd_imovel_urbano) FROM ${S}.tb_dsod_contribuinte_mob_fisico mf WHERE mf.cd_imovel_urbano IN (${baseIptu})${fimMes ? ` AND mf.dt_inicial <= ${fimMes}` : ''}`, 1),
      // …quantos têm IPTU e NÃO tiveram lançamento de TCA no exercício
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo=1 AND g.no_exercicio_lancamento=${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')${jbw} AND g.cd_origem NOT IN (SELECT t.cd_origem FROM ${S}.tb_dsod_guias t WHERE t.cd_tributo=67 AND t.no_exercicio_lancamento=${ano})`, 1),
      formaPagamentoIptu(),
      // Forma de pagamento RESTRITA ao filtro (item 13: quadro deixa de ficar congelado no total)
      temFiltro ? agentQuery(`
        SELECT categoria, COUNT(*) qt FROM (
          SELECT g.cd_guia,
            CASE
              WHEN SUM(CASE WHEN p.no_parcela = 0 THEN pp.vl_pagto ELSE 0 END) > 0 THEN 'CotaUnica'
              WHEN SUM(pp.vl_pagto) = 0 THEN 'EmAberto'
              WHEN SUM(CASE WHEN p.no_parcela <> 0 THEN pp.vl_saldo ELSE 0 END) <= 0 THEN 'Parcelado'
              ELSE 'PagoParcial'
            END AS categoria
          FROM ${S}.tb_dsod_guias g
          ${jb}
          JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
          JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
          WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')${jbw}
          GROUP BY g.cd_guia
        ) t GROUP BY categoria`, 50) : Promise.resolve(null),
    ])
    const comIptu = num(comIptuR.rows[0]?.[0])
    const totalImoveis = num(totalImR.rows[0]?.[0])
    const situacao = sitR.rows.map(r => ({ situacao: String(r[0] ?? '').trim() || '—', qt: num(r[1]) })).sort((a, b) => b.qt - a.qt)
    let fp = forma.get(ano) ?? { cotaUnica: 0, parcelado: 0, pagoParcial: 0, emAberto: 0 }
    if (temFiltro && formaFiltroR) { // usa a forma de pagamento restrita ao filtro
      const b = { cotaUnica: 0, parcelado: 0, pagoParcial: 0, emAberto: 0 }
      for (const r of formaFiltroR.rows) {
        const cat = String(r[0] ?? '').trim(), qt = num(r[1])
        if (cat === 'CotaUnica') b.cotaUnica = qt
        else if (cat === 'Parcelado') b.parcelado = qt
        else if (cat === 'PagoParcial') b.pagoParcial = qt
        else if (cat === 'EmAberto') b.emAberto = qt
      }
      fp = b
    }
    // Item 14: rótulos — "Parcelado" = pagou todas as parcelas; "Pago parcial" = pagou parte
    const pagamento = [
      { status: 'Cota única', qt: fp.cotaUnica, cor: '#1fa463' },
      { status: 'Pago todas as parcelas', qt: fp.parcelado, cor: '#283e93' },
      { status: 'Pago parcelado', qt: fp.pagoParcial, cor: '#e8962e' },
      { status: 'Em aberto', qt: fp.emAberto, cor: '#d64545' },
    ]
    return {
      resumo: {
        comIptu, totalImoveis, comItbi: num(itbiR.rows[0]?.[0]), comTca: num(tcaR.rows[0]?.[0]), comEmpresa: num(empR.rows[0]?.[0]),
        iptuSemTca: num(semTcaR.rows[0]?.[0]),
      },
      situacao, pagamento,
    }
  })
}

// Drill do quadro "Imóveis por status de pagamento": lista os imóveis de uma categoria
// (mesma classificação por guia do resumoIptu acima), respeitando bairro/rua/espólio/sem
// número. Categoria é a chave interna (CotaUnica/Parcelado/PagoParcial/EmAberto), não o
// rótulo exibido na tela.
export type CategoriaPagamento = 'CotaUnica' | 'Parcelado' | 'PagoParcial' | 'EmAberto'
export interface ImovelPagamento { cd: number; inscricao: string; numero: string; proprietario: string }

export async function imoveisPorPagamento(f: FiltrosResumo, categoria: CategoriaPagamento, q?: string): Promise<ImovelPagamento[]> {
  const { ano } = f
  const { join: jb, where: jbw } = joinFiltroResumo(f)
  const r = await agentQuery(`
    SELECT TOP 300 cd_origem FROM (
      SELECT g.cd_guia, g.cd_origem,
        CASE
          WHEN SUM(CASE WHEN p.no_parcela = 0 THEN pp.vl_pagto ELSE 0 END) > 0 THEN 'CotaUnica'
          WHEN SUM(pp.vl_pagto) = 0 THEN 'EmAberto'
          WHEN SUM(CASE WHEN p.no_parcela <> 0 THEN pp.vl_saldo ELSE 0 END) <= 0 THEN 'Parcelado'
          ELSE 'PagoParcial'
        END AS categoria
      FROM ${S}.tb_dsod_guias g
      ${jb}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')${jbw}
      GROUP BY g.cd_guia, g.cd_origem
    ) t WHERE categoria = '${categoria}'`, 300)

  const cds = r.rows.map(row => String(row[0])).filter(c => c && c !== '0')
  const det = await detalhesImoveis(cds)
  let itens = cds.map(cd => {
    const d = det.get(cd)
    return { cd: Number(cd), inscricao: d?.inscricao ?? '', numero: d?.numero ?? '', proprietario: d?.proprietario ?? '' }
  })
  const qt = q?.trim().toLowerCase()
  if (qt) itens = itens.filter(it => it.inscricao.toLowerCase().includes(qt) || it.proprietario.toLowerCase().includes(qt))
  return itens.sort((a, b) => a.proprietario.localeCompare(b.proprietario))
}
