import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { detalhe, type DetalheEmpresa } from '@/lib/mobiliario-empresa'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Drill de "dados cadastrais" no card ISS Prestador de Fora do Município: dado o CNPJ/CPF
// de um prestador (vindo de tb_dsod_nfse via iss-fora-prestadores), acha o vínculo com o
// cadastro mobiliário de Arujá e retorna o mesmo detalhe rico de /api/mobiliario/empresa.
//
// Achado importante na validação: tb_dsod_nfse.cd_contr_mob_prestador NÃO é confiável — o
// mesmo CNPJ aparece com vários cd_contr_mob_prestador diferentes entre notas, e o valor
// aponta pra uma empresa TOTALMENTE diferente (testado com casos reais). Por isso a
// ligação correta é por CNPJ normalizado: tb_dsod_contribuinte.no_cpf_cnpj guarda o
// documento formatado ("14.795.677/0001-78"), enquanto o CNPJ vindo da NFS-e às vezes
// chega sem formatação — remove pontuação dos dois lados (REPLACE em cascata) antes de
// comparar. Empresas de fora do município às vezes TÊM cadastro (ex.: prestadoras com
// infraestrutura física em Arujá, como operadoras de torre de telefonia) — "sem vínculo"
// é uma resposta válida e esperada pra boa parte dos prestadores de fora, não um erro.
async function cadastroPorCnpj(cnpjRaw: string): Promise<{ encontrado: boolean; detalhe: DetalheEmpresa | null }> {
  const cnpjDigitos = cnpjRaw.replace(/\D/g, '')
  if (!cnpjDigitos) return { encontrado: false, detalhe: null }
  return cached(`iss:foraCadastro:${cnpjDigitos}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT m.cd_contr_mob, m.ds_situacao
      FROM ${S}.tb_dsod_contribuinte cp
      JOIN ${S}.tb_dsod_contribuinte_mobiliario m ON m.cd_contr = cp.cd_contr
      WHERE REPLACE(REPLACE(REPLACE(cp.no_cpf_cnpj,'.',''),'/',''),'-','') = '${esc(cnpjDigitos)}'`, 20)
    if (!r.rows.length) return { encontrado: false, detalhe: null }
    // Se a pessoa tem mais de um cadastro (ex.: histórico de MEI reaberto), prioriza o Ativo.
    const ativo = r.rows.find(row => String(row[1] ?? '').trim() === 'Ativo')
    const id = num((ativo ?? r.rows[0])[0])
    if (!id) return { encontrado: false, detalhe: null }
    return { encontrado: true, detalhe: await detalhe(id) }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const cnpj = req.nextUrl.searchParams.get('cnpj')
    if (!cnpj) return NextResponse.json({ error: 'cnpj obrigatório' }, { status: 400 })
    return NextResponse.json(await cadastroPorCnpj(cnpj))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
