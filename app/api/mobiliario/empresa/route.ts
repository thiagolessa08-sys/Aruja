import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Busca de empresas do cadastro mobiliário por nome/fantasia ou CNPJ/CPF.
async function buscar(q: string, tipo: string) {
  const qn = q.replace(/\D/g, '')
  const escQ = esc(q.toUpperCase())
  let cond: string
  if (tipo === 'cnpj') cond = `cp.no_cpf_cnpj LIKE '%${esc(qn)}%'`
  else if (tipo === 'nome') cond = `(cp.nm_rsocial LIKE '%${escQ}%' OR cp.nm_fantasia LIKE '%${escQ}%')`
  else cond = /^\d+$/.test(q)
    ? `cp.no_cpf_cnpj LIKE '%${esc(qn)}%'`
    : `(cp.nm_rsocial LIKE '%${escQ}%' OR cp.nm_fantasia LIKE '%${escQ}%')`
  const r = await agentQuery(`SELECT TOP 20 m.cd_contr_mob, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, m.ds_situacao, m.ds_grupo
    FROM ${S}.tb_dsod_contribuinte_mobiliario m
    JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
    WHERE ${cond}`, 20)
  return r.rows.map(x => ({
    cd: num(x[0]), nome: String(x[1] ?? '').trim(), fantasia: String(x[2] ?? '').trim(),
    cnpjCpf: String(x[3] ?? '').trim(), situacao: String(x[4] ?? '').trim(),
    atividade: String(x[5] ?? '').trim() || 'Não informada',
  }))
}

// Detalhe da empresa: identidade + atividade principal (ds_grupo — melhor cobertura do
// que ds_atividade_livre, que é texto livre e fica nulo/vazio na maior parte da base).
async function detalhe(id: number) {
  const r = await agentQuery(`SELECT m.cd_contr_mob, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, cp.ic_pessoa,
      m.ds_situacao, m.ds_grupo, m.ds_atividade_livre, m.ds_porte_empresa, m.ds_nat_juridica, m.ic_micro_empresa,
      m.ds_inscricao_municipal, m.vl_capital_social, m.qt_funcionarios,
      DATEFORMAT(m.dt_inicio_atividade,'yyyy-mm-dd') dt_ini, DATEFORMAT(m.dt_enc_atividade,'yyyy-mm-dd') dt_enc,
      c.ds_endereco, c.nm_bairro, c.no_cep, m.no_logr, m.ds_complemento
    FROM ${S}.tb_dsod_contribuinte_mobiliario m
    JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
    LEFT JOIN ${S}.tb_dsod_cep c ON c.cd_cep = m.cd_cep
    WHERE m.cd_contr_mob = ${id}`, 1)
  const x = r.rows[0] ?? []
  const numero = String(x[19] ?? '').trim()
  const complemento = String(x[20] ?? '').trim()
  return {
    cd: num(x[0]), nome: String(x[1] ?? '').trim(), fantasia: String(x[2] ?? '').trim(),
    cnpjCpf: String(x[3] ?? '').trim(), pessoaFisica: String(x[4] ?? '').trim().toUpperCase() === 'F',
    situacao: String(x[5] ?? '').trim(),
    atividadePrincipal: String(x[6] ?? '').trim() || 'Não informada',
    atividadeLivre: String(x[7] ?? '').trim(),
    porte: String(x[8] ?? '').trim(), naturezaJuridica: String(x[9] ?? '').trim(),
    microEmpresa: String(x[10] ?? '').trim().toUpperCase() === 'S',
    inscricaoMunicipal: String(x[11] ?? '').trim(), capitalSocial: num(x[12]), qtdFuncionarios: num(x[13]),
    dataInicioAtividade: String(x[14] ?? '').slice(0, 10), dataEncAtividade: String(x[15] ?? '').slice(0, 10),
    endereco: `${String(x[16] ?? '').trim()}${numero ? ', ' + numero : ''}${complemento ? ' — ' + complemento : ''}`,
    bairro: String(x[17] ?? '').trim(), cep: String(x[18] ?? '').trim(),
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
