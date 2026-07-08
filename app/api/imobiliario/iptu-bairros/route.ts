import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

interface Filtros { ano: number; espolio: boolean; semNumero: boolean; bairro: string | null }

// JOINs e WHERE de imóvel conforme filtros. `grupo` = coluna de agrupamento (bairro ou rua).
function base(f: Filtros, grupo: string) {
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

async function agregado(f: Filtros, grupo: string) {
  const b = base(f, grupo)
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

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const f: Filtros = {
      ano: Number(sp.get('ano')) || new Date().getFullYear(),
      espolio: sp.get('espolio') === '1',
      semNumero: sp.get('semnumero') === '1',
      bairro: sp.get('bairro') || null,
    }
    const grupo = f.bairro ? 'c.ds_endereco' : 'c.nm_bairro' // drill por rua quando bairro selecionado
    const key = `iptuBairros:${f.ano}:${f.espolio ? 1 : 0}:${f.semNumero ? 1 : 0}:${f.bairro ?? ''}`
    const itens = await cached(key, TTL_15MIN, () => agregado(f, grupo))
    return NextResponse.json({ nivel: f.bairro ? 'rua' : 'bairro', bairro: f.bairro, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
