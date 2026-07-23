import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Busca de imóveis (mesma base do IPTU): inscrição / código / nome do proprietário.
// Marca (noPeriodo) e prioriza os imóveis com transmissão de ITBI no ano/mês filtrado
// na tela — o detalhe (ao abrir) continua trazendo o histórico completo do imóvel.
async function buscar(q: string, tipo: string, ano: number | null, mes: number | null) {
  const qn = q.replace(/\D/g, '')
  const escQ = esc(q.toUpperCase())
  let cond: string
  if (tipo === 'inscricao') cond = `i.no_inscricao_imovel LIKE '%${escQ}%'`
  else if (tipo === 'codigo') cond = `i.cd_imovel_urbano = ${qn || 0}`
  else if (tipo === 'nome') cond = `cp.nm_rsocial LIKE '%${escQ}%'`
  else cond = /^\d+$/.test(q)
    ? `(i.cd_imovel_urbano = ${qn || 0} OR i.no_inscricao_imovel LIKE '%${escQ}%')`
    : `(cp.nm_rsocial LIKE '%${escQ}%' OR i.no_inscricao_imovel LIKE '%${escQ}%')`
  const filtroData = ano ? ` AND YEAR(it2.dt_lancamento) = ${ano}${mes ? ` AND MONTH(it2.dt_lancamento) <= ${mes}` : ''}` : ''
  const noPeriodoSel = ano
    ? `CASE WHEN EXISTS (
        SELECT 1 FROM ${S}.tb_dsod_itbi_imovel_urbano iiu2
        JOIN ${S}.tb_dsod_itbi it2 ON it2.cd_itbi = iiu2.cd_itbi
        WHERE iiu2.cd_imovel_urbano = i.cd_imovel_urbano AND it2.vl_total > 0${filtroData}
      ) THEN 1 ELSE 0 END`
    : '0'
  const r = await agentQuery(`SELECT TOP 20 i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, cp.nm_rsocial, ${noPeriodoSel} noPeriodo
    FROM ${S}.tb_dsod_imovel_urbano i
    LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
    LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
    WHERE ${cond}
    ORDER BY noPeriodo DESC`, 20)
  return r.rows.map(x => ({
    cd: num(x[0]), inscricao: String(x[1] ?? '').trim(), numero: String(x[2] ?? '').trim(),
    endereco: `${String(x[3] ?? '').trim()}${String(x[4] ?? '').trim() ? ' — ' + String(x[4]).trim() : ''}`,
    proprietario: String(x[5] ?? '').trim(),
    noPeriodo: num(x[6]) === 1,
  }))
}

// Detalhe do imóvel: identidade + histórico de ITBIs (lançamentos, valor venal, imposto).
// Itens 2 (histórico de lançamentos) e 3 (histórico de valor venal).
async function detalhe(id: number) {
  const [infoR, itbisR, impR, mobR] = await Promise.all([
    agentQuery(`SELECT i.cd_imovel_urbano, i.no_inscricao_imovel, i.no_imovel, c.ds_endereco, c.nm_bairro, c.no_cep, cp.nm_rsocial, cp.no_cpf_cnpj, i.cd_contr_proprietario, cp.ic_pessoa
      FROM ${S}.tb_dsod_imovel_urbano i
      LEFT JOIN ${S}.tb_dsod_cep c ON i.cd_cep = c.cd_cep
      LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario
      WHERE i.cd_imovel_urbano = ${id}`, 1),
    // Cada ITBI do imóvel: data, natureza, valor venal, partes (transmitente/adquirente) + PJ. Itens 4 e 5.
    agentQuery(`SELECT it.cd_itbi, DATEFORMAT(it.dt_transacao,'yyyy-mm-dd') dt, it.ds_natureza_transacao nat,
        it.vl_venal, it.pc_aliquota, it.ds_situacao,
        COALESCE(NULLIF(it.nm_transmitente,''), tr.nm_rsocial) transmitente, adq.nm_rsocial adquirente,
        it.cd_contr_transmitente, it.cd_contr_adquirente, tr.ic_pessoa transm_pes, adq.ic_pessoa adq_pes
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
    // Item 5 — vínculo mobiliário: empresas (mobiliário) registradas no endereço do imóvel.
    agentQuery(`SELECT DISTINCT mf.cd_contr_mob FROM ${S}.tb_dsod_contribuinte_mob_fisico mf
      WHERE mf.cd_imovel_urbano = ${id}`, 100).catch(() => null),
  ])

  const info = infoR.rows[0] ?? []
  const numero = String(info[2] ?? '').trim()
  const propCd = num(info[8])
  const propPJ = String(info[9] ?? '').trim().toUpperCase() === 'J'
  const impMap = new Map<number, number>()
  for (const r of impR.rows) impMap.set(num(r[0]), num(r[1]))
  const mobSet = new Set<number>()
  if (mobR) for (const r of mobR.rows) mobSet.add(num(r[0]))
  const temVinculoMob = mobSet.size > 0
  // empresa (mobiliário do endereço) é o proprietário atual?
  const empresaEhProprietario = temVinculoMob && propCd > 0 && mobSet.has(propCd)

  const transmissoes = itbisR.rows.map(r => {
    const cdTransm = num(r[8]), cdAdq = num(r[9])
    return {
      cdItbi: num(r[0]),
      data: String(r[1] ?? '').slice(0, 10),
      natureza: String(r[2] ?? '').trim(),
      valorVenal: num(r[3]),
      aliquota: num(r[4]),
      situacao: String(r[5] ?? '').trim(),
      transmitente: String(r[6] ?? '').trim(),
      adquirente: String(r[7] ?? '').trim(),
      imposto: impMap.get(num(r[0])) ?? 0,
      // item 4 — comparação com o proprietário atual do cadastro
      transmitenteEhProprietario: cdTransm > 0 && cdTransm === propCd,
      adquirenteEhProprietario: cdAdq > 0 && cdAdq === propCd,
      // item 5 — PJ nas partes / empresa mobiliária
      transmitentePJ: String(r[10] ?? '').trim().toUpperCase() === 'J',
      adquirentePJ: String(r[11] ?? '').trim().toUpperCase() === 'J',
      transmitenteMobiliario: cdTransm > 0 && mobSet.has(cdTransm),
      adquirenteMobiliario: cdAdq > 0 && mobSet.has(cdAdq),
    }
  }).sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : 0)) // mais recente primeiro

  // Cobertura dos dados de partes (item 4 depende disso — reporta honestamente)
  const comTransm = transmissoes.filter(t => t.transmitente).length
  const comAdq = transmissoes.filter(t => t.adquirente).length
  const ultima = transmissoes[0]

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
    proprietarioPJ: propPJ,
    indicadores: {
      qtTransmissoes: transmissoes.length,
      valorizacao,
      intervaloMedioAnos,
      impostoTotal: transmissoes.reduce((s, t) => s + t.imposto, 0),
      venalUltimo: ultimo?.valorVenal ?? 0,
      venalPrimeiro: primeiro?.valorVenal ?? 0,
    },
    // item 4 — transmitente × proprietário
    comparativo: {
      coberturaTransmitente: comTransm,
      coberturaAdquirente: comAdq,
      // a última transmissão fechou o ciclo (adquirente virou proprietário no cadastro)?
      ultimaAdquirenteEhProprietario: ultima?.adquirenteEhProprietario ?? false,
      ultimaTransmitenteEhProprietario: ultima?.transmitenteEhProprietario ?? false,
    },
    // item 5 — vínculo mobiliário
    mobiliario: {
      temVinculo: temVinculoMob,
      qtdEmpresas: mobSet.size,
      empresaEhProprietario,
      transmissoesComPJ: transmissoes.filter(t => t.transmitentePJ || t.adquirentePJ).length,
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
    const ano = Number(sp.get('ano')) || null
    const mes = Number(sp.get('mes')) || null
    return NextResponse.json({ matches: await buscar(q, tipo, ano, mes) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
