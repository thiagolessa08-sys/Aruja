import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Busca de imóveis (mesma base do IPTU): inscrição / código / nome do proprietário.
async function buscar(q: string, tipo: string) {
  const qn = q.replace(/\D/g, '')
  const escQ = esc(q.toUpperCase())
  let cond: string
  if (tipo === 'inscricao') cond = `i.no_inscricao_imovel LIKE '%${escQ}%'`
  else if (tipo === 'codigo') cond = `i.cd_imovel_urbano = ${qn || 0}`
  else if (tipo === 'nome') cond = `cp.nm_rsocial LIKE '%${escQ}%'`
  else cond = /^\d+$/.test(q)
    ? `(i.cd_imovel_urbano = ${qn || 0} OR i.no_inscricao_imovel LIKE '%${escQ}%')`
    : `(cp.nm_rsocial LIKE '%${escQ}%' OR i.no_inscricao_imovel LIKE '%${escQ}%')`
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

// Detalhe do imóvel: identidade + histórico de ITBIs (lançamentos, valor venal, imposto).
// Itens 2 (histórico de lançamentos) e 3 (histórico de valor venal).
async function detalhe(id: number) {
  const [infoR, itbisR, impR] = await Promise.all([
    agentQuery(`SELECT i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, c.no_cep, cp.nm_rsocial, cp.no_cpf_cnpj
      FROM ${S}.tb_dsod_imovel_urbano i
      LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
      LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
      WHERE i.cd_imovel_urbano = ${id}`, 1),
    // Cada ITBI do imóvel: data, natureza, valor venal, transmitente e adquirente, situação.
    agentQuery(`SELECT it.cd_itbi, DATEFORMAT(it.dt_transacao,'yyyy-mm-dd') dt, it.ds_natureza_transacao nat,
        it.vl_venal, it.pc_aliquota, it.ds_situacao,
        COALESCE(NULLIF(it.nm_transmitente,''), tr.nm_rsocial) transmitente, adq.nm_rsocial adquirente
      FROM ${S}.tb_dsod_itbi it
      JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = it.cd_itbi
      LEFT JOIN ${S}.tb_dsod_contribuinte tr ON tr.cd_contr = it.cd_contr_transmitente
      LEFT JOIN ${S}.tb_dsod_contribuinte adq ON adq.cd_contr = it.cd_contr_adquirente
      WHERE iiu.cd_imovel_urbano = ${id} AND it.vl_total > 0`, 300),
    // Imposto (lançado) por ITBI do imóvel — mov 1,2,3.
    agentQuery(`SELECT g.cd_origem cd_itbi, SUM(pm.vl_movimento) imposto
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = g.cd_origem
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      WHERE g.cd_tributo = 10 AND iiu.cd_imovel_urbano = ${id}
        AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      GROUP BY g.cd_origem`, 300),
  ])

  const info = infoR.rows[0] ?? []
  const numero = String(info[2] ?? '').trim()
  const impMap = new Map<number, number>()
  for (const r of impR.rows) impMap.set(num(r[0]), num(r[1]))

  const transmissoes = itbisR.rows.map(r => ({
    cdItbi: num(r[0]),
    data: String(r[1] ?? '').slice(0, 10),
    natureza: String(r[2] ?? '').trim(),
    valorVenal: num(r[3]),
    aliquota: num(r[4]),
    situacao: String(r[5] ?? '').trim(),
    transmitente: String(r[6] ?? '').trim(),
    adquirente: String(r[7] ?? '').trim(),
    imposto: impMap.get(num(r[0])) ?? 0,
  })).sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : 0)) // mais recente primeiro

  // Indicadores (item 2/3): nº de transmissões, valorização do valor venal, intervalo médio, imposto total.
  const comVenal = transmissoes.filter(t => t.valorVenal > 0)
  const cronol = [...comVenal].sort((a, b) => (a.data > b.data ? 1 : -1)) // antigo→recente
  const primeiro = cronol[0], ultimo = cronol[cronol.length - 1]
  const valorizacao = primeiro && ultimo && primeiro.valorVenal > 0 && ultimo !== primeiro
    ? ((ultimo.valorVenal - primeiro.valorVenal) / primeiro.valorVenal) * 100 : 0
  // intervalo médio (anos) entre transmissões consecutivas com data
  const datas = cronol.map(t => t.data).filter(Boolean)
  let intervaloMedioAnos = 0
  if (datas.length >= 2) {
    const primeiroMs = new Date(datas[0]).getTime(), ultimoMs = new Date(datas[datas.length - 1]).getTime()
    intervaloMedioAnos = (ultimoMs - primeiroMs) / (datas.length - 1) / (365.25 * 24 * 3600 * 1000)
  }

  return {
    cd: num(info[0]), inscricao: String(info[1] ?? '').trim(), numero,
    endereco: `${String(info[3] ?? '').trim()}${numero ? ', ' + numero : ''}${String(info[4] ?? '').trim() ? ' — ' + String(info[4]).trim() : ''}`,
    cep: String(info[5] ?? '').trim(), proprietario: String(info[6] ?? '').trim(), cpfCnpj: String(info[7] ?? '').trim(),
    indicadores: {
      qtTransmissoes: transmissoes.length,
      valorizacao,
      intervaloMedioAnos,
      impostoTotal: transmissoes.reduce((s, t) => s + t.imposto, 0),
      venalUltimo: ultimo?.valorVenal ?? 0,
      venalPrimeiro: primeiro?.valorVenal ?? 0,
    },
    transmissoes,
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
    const tipo = (sp.get('tipo') || '').trim()
    if (q.length < 2) return NextResponse.json({ matches: [] })
    return NextResponse.json({ matches: await buscar(q, tipo) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
