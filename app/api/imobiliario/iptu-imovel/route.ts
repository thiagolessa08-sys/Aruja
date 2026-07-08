import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Busca de imóveis por inscrição/código (numérico) ou proprietário (texto).
async function buscar(q: string) {
  const qn = q.replace(/\D/g, '')
  const cond = /^\d+$/.test(q)
    ? `(i.cd_imovel_urbano = ${qn || 0} OR i.no_inscricao_imovel LIKE '${qn}%')`
    : `cp.nm_rsocial LIKE '%${esc(q.toUpperCase())}%'`
  const r = await agentQuery(`SELECT TOP 20 i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, cp.nm_rsocial
    FROM ${S}.tb_dsod_imovel_urbano i
    LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
    LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
    WHERE ${cond}`, 20)
  return r.rows.map(x => ({
    cd: num(x[0]), inscricao: String(x[1] ?? '').trim(), numero: String(x[2] ?? '').trim(),
    endereco: `${String(x[3] ?? '').trim()}${String(x[4] ?? '').trim() ? ' — ' + String(x[4]).trim() : ''}`,
    proprietario: String(x[5] ?? '').trim(),
  }))
}

// Detalhe completo do imóvel + 5 anos + flags.
async function detalhe(id: number) {
  const [infoR, itbiR, isscR, tcaR, lancR, arrecR, saldoR, parcR] = await Promise.all([
    agentQuery(`SELECT i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, c.no_cep, cp.nm_rsocial, cp.no_cpf_cnpj
      FROM ${S}.tb_dsod_imovel_urbano i
      LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
      LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
      WHERE i.cd_imovel_urbano = ${id}`, 1),
    agentQuery(`SELECT COUNT(*) FROM ${S}.tb_dsod_itbi_imovel_urbano WHERE cd_imovel_urbano = ${id}`, 1),
    agentQuery(`SELECT COUNT(*) FROM ${S}.tb_dsod_guias WHERE cd_origem = ${id} AND cd_tributo IN (40,17,18)`, 1),
    agentQuery(`SELECT COUNT(*) FROM ${S}.tb_dsod_guias WHERE cd_origem = ${id} AND cd_tributo = 67`, 1),
    agentQuery(`SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
      WHERE g.cd_origem=${id} AND g.cd_tributo IN (1,25) AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela NOT IN (0) AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY g.no_exercicio_lancamento`, 60),
    agentQuery(`SELECT g.no_exercicio_lancamento ex, SUM(pm.vl_movimento) vl FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
      WHERE g.cd_origem=${id} AND g.cd_tributo IN (1,25) AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28) AND p.no_parcela NOT IN (0) AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY g.no_exercicio_lancamento`, 60),
    agentQuery(`SELECT g.no_exercicio_lancamento ex, SUM(pp.vl_saldo) aberto, SUM(CASE WHEN p.dt_vencimento < getdate() THEN pp.vl_saldo ELSE 0 END) vencido
      FROM ${S}.tb_dsod_guias g JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela=p.cd_parcelas
      WHERE g.cd_origem=${id} AND g.cd_tributo IN (1,25) AND p.no_parcela NOT IN (0) AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY g.no_exercicio_lancamento`, 60),
    // Parcelas do exercício mais recente do imóvel (item 15: por parcela)
    agentQuery(`SELECT g.no_exercicio_lancamento ex, p.no_parcela, DATEFORMAT(p.dt_vencimento,'yyyy-mm-dd') venc, pp.vl_lancto, pp.vl_pagto, pp.vl_saldo
      FROM ${S}.tb_dsod_guias g JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela=p.cd_parcelas
      WHERE g.cd_origem=${id} AND g.cd_tributo IN (1,25) AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND g.no_exercicio_lancamento = (SELECT MAX(no_exercicio_lancamento) FROM ${S}.tb_dsod_guias WHERE cd_origem=${id} AND cd_tributo IN (1,25))
      ORDER BY p.no_parcela`, 60),
  ])
  const info = infoR.rows[0] ?? []
  const numero = String(info[2] ?? '').trim()
  const nome = String(info[6] ?? '').trim()
  const anoMax = new Date().getFullYear()
  const map = new Map<number, { lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }>()
  const g = (a: number) => map.get(a) ?? { lancado: 0, arrecadado: 0, emAberto: 0, inadimplencia: 0 }
  for (const r of lancR.rows) { const a = num(r[0]); const x = g(a); x.lancado = num(r[1]); map.set(a, x) }
  for (const r of arrecR.rows) { const a = num(r[0]); const x = g(a); x.arrecadado = num(r[1]); map.set(a, x) }
  for (const r of saldoR.rows) { const a = num(r[0]); const x = g(a); x.emAberto = Math.max(0, num(r[1])); x.inadimplencia = Math.max(0, num(r[2])); map.set(a, x) }
  const anos = []
  for (let a = anoMax - 4; a <= anoMax; a++) anos.push({ ano: a, ...g(a) })

  const anoParcela = num(parcR.rows[0]?.[0])
  const parcelas = parcR.rows.map(r => ({
    parcela: num(r[1]), vencimento: String(r[2] ?? '').slice(0, 10),
    lancado: num(r[3]), pago: num(r[4]), saldo: num(r[5]),
  })).sort((a, b) => a.parcela - b.parcela)

  return {
    cd: num(info[0]), inscricao: String(info[1] ?? '').trim(), numero,
    endereco: `${String(info[3] ?? '').trim()}${numero ? ', ' + numero : ''}${String(info[4] ?? '').trim() ? ' — ' + String(info[4]).trim() : ''}`,
    cep: String(info[5] ?? '').trim(), proprietario: nome, cpfCnpj: String(info[7] ?? '').trim(),
    flags: {
      itbi: num(itbiR.rows[0]?.[0]) > 0,
      isscc: num(isscR.rows[0]?.[0]) > 0,
      tca: num(tcaR.rows[0]?.[0]) > 0,
      espolio: /ESP[ÓO]LIO/i.test(nome),
      semNumero: !numero || numero === '0',
    },
    anos, anoParcela, parcelas,
  }
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const id = Number(sp.get('id'))
    if (id) return NextResponse.json({ detalhe: await detalhe(id) })
    const q = (sp.get('q') || '').trim()
    if (q.length < 2) return NextResponse.json({ matches: [] })
    return NextResponse.json({ matches: await buscar(q) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
