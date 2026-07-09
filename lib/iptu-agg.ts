// Agregações pesadas do IPTU (bairros, ranking, resumo) compartilhadas entre os
// endpoints e o warmup — usam o MESMO cache (mesma key), então o pré-aquecimento
// do boot/agendamento serve as requisições dos usuários direto do cache.
import { agentQuery } from '@/lib/agent'
import { cached, CACHE_TTL } from '@/lib/cache'
import { formaPagamentoIptu } from '@/lib/tributo-engine'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

// ===================== BAIRROS (ou ruas no drill) =====================
export interface FiltrosBairro { ano: number; espolio: boolean; semNumero: boolean; bairro: string | null }

function baseBairro(f: FiltrosBairro, grupo: string) {
  const joinProp = f.espolio ? `JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario` : ''
  let w = `g.no_exercicio_lancamento = ${f.ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao')`
  if (f.espolio) w += ` AND cp.nm_rsocial LIKE '%ESP_LIO%'`
  if (f.semNumero) w += ` AND (i.no_imovel IS NULL OR i.no_imovel = '' OR i.no_imovel = '0')`
  if (f.bairro) w += ` AND c.nm_bairro = '${f.bairro.replace(/'/g, "''")}'`
  return {
    from: `FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_imovel_urbano i ON g.cd_origem = i.cd_imovel_urbano
      JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
      ${joinProp}
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia`,
    where: w, grupo,
  }
}

async function agregadoBairro(f: FiltrosBairro, grupo: string) {
  const b = baseBairro(f, grupo)
  const [lancR, arrecR, saldoR] = await Promise.all([
    agentQuery(`SELECT ${b.grupo} AS k, SUM(pm.vl_movimento) AS vl, COUNT(DISTINCT g.cd_origem) AS im
      ${b.from}
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE ${b.where} AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela NOT IN (0)
      GROUP BY ${b.grupo}`, 800),
    agentQuery(`SELECT ${b.grupo} AS k, SUM(pm.vl_movimento) AS vl
      ${b.from}
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      WHERE ${b.where} AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela NOT IN (0)
        AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28)
      GROUP BY ${b.grupo}`, 800),
    agentQuery(`SELECT ${b.grupo} AS k, YEAR(p.dt_vencimento) AS vy, MONTH(p.dt_vencimento) AS vm, SUM(pp.vl_saldo) AS saldo
      ${b.from}
      JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela = p.cd_parcelas
      WHERE ${b.where} AND p.no_parcela NOT IN (0)
      GROUP BY ${b.grupo}, YEAR(p.dt_vencimento), MONTH(p.dt_vencimento)`, 4000),
  ])
  const map = new Map<string, { lancado: number; arrecadado: number; inadimplencia: number; imoveis: number }>()
  const g = (k: string) => map.get(k) ?? { lancado: 0, arrecadado: 0, inadimplencia: 0, imoveis: 0 }
  for (const r of lancR.rows) { const k = String(r[0] ?? '').trim() || '—'; const x = g(k); x.lancado = num(r[1]); x.imoveis = num(r[2]); map.set(k, x) }
  for (const r of arrecR.rows) { const k = String(r[0] ?? '').trim() || '—'; const x = g(k); x.arrecadado = num(r[1]); map.set(k, x) }
  const now = new Date(); const cy = now.getFullYear(), cm = now.getMonth() + 1
  for (const r of saldoR.rows) {
    const k = String(r[0] ?? '').trim() || '—'; const vy = num(r[1]), vm = num(r[2]), saldo = num(r[3])
    if (saldo <= 0) continue
    if (vy < cy || (vy === cy && vm < cm)) { const x = g(k); x.inadimplencia += saldo; map.set(k, x) }
  }
  return [...map.entries()].map(([nome, m]) => ({ nome, ...m })).sort((a, b) => b.lancado - a.lancado)
}

export function bairrosIptu(f: FiltrosBairro) {
  const grupo = f.bairro ? 'c.ds_endereco' : 'c.nm_bairro'
  const key = `iptuBairros:${f.ano}:${f.espolio ? 1 : 0}:${f.semNumero ? 1 : 0}:${f.bairro ?? ''}`
  return cached(key, CACHE_TTL, () => agregadoBairro(f, grupo))
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
      const e = await agentQuery(`SELECT cd_contr, nm_rsocial, no_cpf_cnpj FROM ${S}.tb_dsod_contribuinte WHERE cd_contr IN (${keys.join(',')})`, 200)
      for (const r of e.rows) nomes.set(String(r[0]), { nome: String(r[1] ?? '').trim() || `Contrib. ${r[0]}`, endereco: '', extra: String(r[2] ?? '').trim() })
    }
    return keys.map(k => ({ chave: k, ...g(k), ...(nomes.get(k) ?? { nome: `${tipo === 'imovel' ? 'Imóvel' : 'Contrib.'} ${k}`, endereco: '', extra: '' }) }))
  })
}

// ===================== RESUMO =====================
export function resumoIptu(ano: number, bairro: string | null) {
  return cached(`iptuResumo:${ano}:${bairro ?? ''}`, CACHE_TTL, async () => {
    const jb = bairro ? `JOIN ${S}.tb_dsod_imovel_urbano iu ON g.cd_origem=iu.cd_imovel_urbano JOIN ${S}.tb_dsod_cep ce ON iu.cd_cep=ce.cd_cep AND ce.nm_bairro='${bairro.replace(/'/g, "''")}'` : ''
    const inBairro = bairro ? `AND cd_imovel_urbano IN (SELECT iu.cd_imovel_urbano FROM ${S}.tb_dsod_imovel_urbano iu JOIN ${S}.tb_dsod_cep ce ON iu.cd_cep=ce.cd_cep WHERE ce.nm_bairro='${bairro.replace(/'/g, "''")}')` : ''
    const [sitR, tcaR, itbiR, empR, semTcaR, semIptuR, forma] = await Promise.all([
      agentQuery(`SELECT g.ds_situacao, COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo IN (1,25) AND g.no_exercicio_lancamento=${ano} GROUP BY g.ds_situacao`, 20),
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo=67 AND g.no_exercicio_lancamento=${ano}`, 1),
      agentQuery(`SELECT COUNT(DISTINCT cd_imovel_urbano) FROM ${S}.tb_dsod_itbi_imovel_urbano WHERE 1=1 ${inBairro}`, 1),
      agentQuery(`SELECT COUNT(DISTINCT cd_imovel_urbano) FROM ${S}.tb_dsod_contribuinte_mob_fisico WHERE 1=1 ${inBairro}`, 1),
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo IN (1,25) AND g.no_exercicio_lancamento=${ano} AND g.cd_origem NOT IN (SELECT t.cd_origem FROM ${S}.tb_dsod_guias t WHERE t.cd_tributo=67 AND t.no_exercicio_lancamento=${ano})`, 1),
      agentQuery(`SELECT COUNT(DISTINCT g.cd_origem) FROM ${S}.tb_dsod_guias g ${jb} WHERE g.cd_tributo=67 AND g.no_exercicio_lancamento=${ano} AND g.cd_origem NOT IN (SELECT t.cd_origem FROM ${S}.tb_dsod_guias t WHERE t.cd_tributo IN (1,25) AND t.no_exercicio_lancamento=${ano})`, 1),
      formaPagamentoIptu(),
    ])
    const situacao = sitR.rows.map(r => ({ situacao: String(r[0] ?? '').trim() || '—', qt: num(r[1]) })).sort((a, b) => b.qt - a.qt)
    const comIptu = situacao.reduce((s, x) => s + x.qt, 0)
    const fp = forma.get(ano) ?? { cotaUnica: 0, parcelado: 0, pagoParcial: 0, emAberto: 0 }
    const pagamento = [
      { status: 'Cota única', qt: fp.cotaUnica, cor: '#1fa463' },
      { status: 'Parcelado', qt: fp.parcelado, cor: '#283e93' },
      { status: 'Pago parcial', qt: fp.pagoParcial, cor: '#e8962e' },
      { status: 'Em aberto', qt: fp.emAberto, cor: '#d64545' },
    ]
    return {
      resumo: {
        comIptu, comItbi: num(itbiR.rows[0]?.[0]), comTca: num(tcaR.rows[0]?.[0]), comEmpresa: num(empR.rows[0]?.[0]),
        iptuSemTca: num(semTcaR.rows[0]?.[0]), tcaSemIptu: num(semIptuR.rows[0]?.[0]),
      },
      situacao, pagamento,
    }
  })
}
