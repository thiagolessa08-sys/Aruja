import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'

const SCHEMA = 'pref_aruja_sp'

// Colunas 0/1 de tb_dsod_contribuinte_pessoa por vínculo (mesma origem do gráfico
// "Vínculos do Contribuinte" em /api/contribuinte/graficos) — whitelist p/ evitar
// injeção, já que o nome da coluna vai direto no WHERE.
const CAMPOS_VALIDOS = new Set([
  'ic_pessoa_contribuinte_mobiliario',
  'ic_pessoa_proprietario',
  'ic_pessoa_itbi',
  'ic_pessoa_socio',
  'ic_tomador_servico',
  'ic_pessoa_responsavel_tributario',
  'ic_pessoa_compromissario',
  'ic_pessoa_posseiro',
])

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const campo = sp.get('campo') ?? ''
    if (!CAMPOS_VALIDOS.has(campo)) return NextResponse.json({ error: 'campo inválido' }, { status: 400 })
    const q = (sp.get('q') || '').trim().toUpperCase().replace(/'/g, "''")

    const filtroQ = q ? ` AND (c.nm_rsocial LIKE '%${q}%' OR c.no_cpf_cnpj LIKE '%${q}%')` : ''
    // Telefone: prioriza CELULAR (agrega c/ MIN pois raríssimos contribuintes têm >1 registro).
    // Endereço: junta tb_dsod_contribuinte_endereco (nº/complemento) com tb_dsod_cep (logradouro/
    // bairro/cidade), também agregado por MAX p/ garantir 1 linha por contribuinte.
    const r = await agentQuery(`
      SELECT TOP 200 c.cd_contr, c.nm_rsocial, c.no_cpf_cnpj, c.ds_endereco_email, tc.telefone,
        cep.ds_tipo_logr, cep.ds_endereco, e.no_logr, e.ds_complemento, cep.nm_bairro, cep.nm_mun, cep.cd_est, cep.no_cep
      FROM ${SCHEMA}.tb_dsod_contribuinte_pessoa cp
      JOIN ${SCHEMA}.tb_dsod_contribuinte c ON c.cd_contr = cp.cd_contr
      LEFT JOIN (
        SELECT cd_contr, MIN(no_tel) AS telefone FROM ${SCHEMA}.tb_dsod_contribuinte_contato
        WHERE ds_tipo_telefone = 'CELULAR' GROUP BY cd_contr
      ) tc ON tc.cd_contr = c.cd_contr
      LEFT JOIN (
        SELECT cd_contr, MAX(cd_cep) AS cd_cep, MAX(no_logr) AS no_logr, MAX(ds_complemento) AS ds_complemento
        FROM ${SCHEMA}.tb_dsod_contribuinte_endereco GROUP BY cd_contr
      ) e ON e.cd_contr = c.cd_contr
      LEFT JOIN ${SCHEMA}.tb_dsod_cep cep ON cep.cd_cep = e.cd_cep
      WHERE cp.${campo} = 1${filtroQ}
      ORDER BY c.nm_rsocial`, 200)

    const fmtCep = (v: string) => v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : v

    const itens = r.rows.map(row => {
      const [tipoLogr, rua, num, compl, bairro, mun, uf, cep] = [row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12]]
        .map(v => String(v ?? '').trim())
      const enderecoPartes = [
        [tipoLogr, rua].filter(Boolean).join(' '),
        num ? `nº ${num}` : '',
        compl,
        bairro,
        [mun, uf].filter(Boolean).join('/'),
        cep ? `CEP ${fmtCep(cep)}` : '',
      ].filter(Boolean)
      const doc = String(row[2] ?? '').trim()
      return {
        cd: Number(row[0]) || 0,
        nome: String(row[1] ?? '').trim(),
        doc: doc && doc !== '-1' ? doc : '',
        email: String(row[3] ?? '').trim(),
        telefone: String(row[4] ?? '').trim(),
        endereco: enderecoPartes.join(', '),
      }
    })
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
