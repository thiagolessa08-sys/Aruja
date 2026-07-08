import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
type Metrica = 'lancado' | 'arrecadado' | 'emAberto' | 'inadimplencia'

// FROM + WHERE por métrica (o agente limita ~5000 linhas → usamos TOP no SQL).
function medidaSQL(chave: string, metrica: Metrica, base: string, extraWhere = '') {
  const w = `${base}${extraWhere}`
  if (metrica === 'lancado') return `SELECT ${chave} k, SUM(pm.vl_movimento) v FROM ${S}.tb_dsod_guias g
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
    JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
    WHERE ${w} AND pm.cd_tipo_movimento IN (1,2,3) GROUP BY ${chave}`
  if (metrica === 'arrecadado') return `SELECT ${chave} k, SUM(pm.vl_movimento) v FROM ${S}.tb_dsod_guias g
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
    JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela=p.cd_parcelas
    JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
    WHERE ${w} AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10) AND pb.cd_tipo_baixa NOT IN (28) GROUP BY ${chave}`
  const venc = metrica === 'inadimplencia' ? ' AND p.dt_vencimento < getdate()' : ''
  return `SELECT ${chave} k, SUM(pp.vl_saldo) v FROM ${S}.tb_dsod_guias g
    JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia=g.cd_guia
    JOIN ${S}.tb_dsod_parcela_posicao pp ON pp.cd_parcela=p.cd_parcelas
    WHERE ${w}${venc} GROUP BY ${chave}`
}

async function ranking(tipo: 'imovel' | 'proprietario', ano: number, metrica: Metrica) {
  return cached(`iptuRank:${tipo}:${ano}:${metrica}`, TTL_15MIN, async () => {
    const chave = tipo === 'imovel' ? 'g.cd_origem' : 'g.cd_contr'
    const base = `g.cd_tributo IN (1) AND g.no_exercicio_lancamento = ${ano} AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND p.no_parcela NOT IN (0)`

    // 1) Top 100 chaves pela métrica (TOP + ORDER BY no SQL)
    const topR = await agentQuery(`SELECT TOP 100 * FROM (${medidaSQL(chave, metrica, base)}) t ORDER BY v DESC`, 120)
    const keys = topR.rows.map(r => String(r[0])).filter(k => k && k !== '0')
    if (!keys.length) return []
    const inKeys = `${chave} IN (${keys.join(',')})`

    // 2) As 4 medidas só para essas chaves (rápido)
    const [lancR, arrecR, saldoR] = await Promise.all([
      agentQuery(medidaSQL(chave, 'lancado', base, ` AND ${inKeys}`), 200),
      agentQuery(medidaSQL(chave, 'arrecadado', base, ` AND ${inKeys}`), 200),
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

    // 3) Nome/endereço das 100 chaves
    const nomes = new Map<string, { nome: string; endereco: string; extra: string }>()
    if (tipo === 'imovel') {
      const e = await agentQuery(`SELECT i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, cp.nm_rsocial
        FROM ${S}.tb_dsod_imovel_urbano i
        LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep=c.cd_cep
        LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr=i.cd_contr_proprietario
        WHERE i.cd_imovel_urbano IN (${keys.join(',')})`, 200)
      for (const r of e.rows) {
        const k = String(r[0]); const rua = String(r[3] ?? '').trim(), no = String(r[2] ?? '').trim(), bairro = String(r[4] ?? '').trim()
        nomes.set(k, { nome: `Insc. ${String(r[1] ?? k).trim()}`, endereco: `${rua}${no ? ', ' + no : ''}${bairro ? ' — ' + bairro : ''}`, extra: String(r[5] ?? '').trim() })
      }
    } else {
      const e = await agentQuery(`SELECT cd_contr, nm_rsocial, no_cpf_cnpj FROM ${S}.tb_dsod_contribuinte WHERE cd_contr IN (${keys.join(',')})`, 200)
      for (const r of e.rows) nomes.set(String(r[0]), { nome: String(r[1] ?? '').trim() || `Contrib. ${r[0]}`, endereco: '', extra: String(r[2] ?? '').trim() })
    }

    return keys.map(k => ({ chave: k, ...g(k), ...(nomes.get(k) ?? { nome: `${tipo === 'imovel' ? 'Imóvel' : 'Contrib.'} ${k}`, endereco: '', extra: '' }) }))
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const tipo = sp.get('tipo') === 'proprietario' ? 'proprietario' : 'imovel'
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const metrica = (['lancado', 'arrecadado', 'emAberto', 'inadimplencia'] as const).find(m => m === sp.get('metrica')) ?? 'lancado'
    return NextResponse.json({ tipo, metrica, itens: await ranking(tipo, ano, metrica) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
