import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'
import { classificarMunicipio, previsaoIssFora, crescimentoTotalPct, type Cenario } from '@/lib/iss-fora-previsao'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")
const MEI = 81000
const SIMPLES = 4800000

export interface EmpresaLimite { cnpj: string; nome: string; atual: number; projetado: number }
export interface CenarioLimite { cruzamMei: EmpresaLimite[]; cruzamSimples: EmpresaLimite[] }
export interface LimiteFaturamentoResp {
  anoBase: number
  anoPrevisao: number
  conservador: CenarioLimite
  provavel: CenarioLimite
  agressivo: CenarioLimite
}

function limparNome(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^[^A-Za-zÀ-ÿ0-9]+/, '') || 'Empresa não identificada'
}

// Grafias de nm_mun do exercício que normalizam para "local" (Arujá) — mesmo padrão em
// 2 passos usado em iss-fora-prestadores (nm_mun é texto livre, sem grafia única pra
// filtrar por igualdade).
async function variantesLocais(ano: number): Promise<string[]> {
  const r = await agentQuery(`
    SELECT nm_mun
    FROM ${S}.tb_dsod_nfse
    WHERE ic_situacao_nota_fiscal = '1' AND YEAR(dt_emissao) = ${ano}
    GROUP BY nm_mun`, 5000)
  return r.rows
    .map(row => String(row[0] ?? '').trim())
    .filter(nm => nm && classificarMunicipio(nm) === 'local')
}

// Empresas locais com receita anual (SUM vl_servicos) numa faixa — usa HAVING pra filtrar
// direto no banco em vez de trazer todas as ~5-6 mil empresas locais (estoura o teto de
// 5000 linhas do agente; a faixa de interesse sozinha fica bem menor).
async function empresasNaFaixa(inList: string, ano: number, min: number, max: number): Promise<{ cnpj: string; nome: string; receita: number }[]> {
  const r = await agentQuery(`
    SELECT no_cpf_cnpj cnpj, MAX(nm_rsocial) nome, SUM(vl_servicos) receita
    FROM ${S}.tb_dsod_nfse
    WHERE ic_situacao_nota_fiscal = '1' AND YEAR(dt_emissao) = ${ano} AND LTRIM(RTRIM(nm_mun)) IN (${inList})
    GROUP BY no_cpf_cnpj
    HAVING SUM(vl_servicos) BETWEEN ${min} AND ${max}`, 2000)
  return r.rows.map(row => ({ cnpj: String(row[0] ?? '').trim(), nome: limparNome(row[1]), receita: num(row[2]) }))
}

// Projeta, pra cada cenário da Simulação · Previsão (mesma % de crescimento — ver
// crescimentoTotalPct em lib/iss-fora-previsao), quantas empresas locais que hoje estão
// perto do teto do MEI ou do Simples Nacional passariam a ultrapassá-lo em 2027. Só
// considera empresas na faixa [metade do teto, teto] no exercício-base — quem já está
// acima já ultrapassou, quem está bem abaixo não cruza nem no cenário agressivo observado.
// Fonte: tb_dsod_nfse (mesma base de "ISS Prestador de Fora do Município"), receita de
// serviços (vl_servicos) das empresas classificadas como locais.
async function limiteFaturamentoProjecao(): Promise<LimiteFaturamentoResp> {
  return cached('iss:limiteFaturamentoProjecao', TTL_15MIN, async () => {
    const previsao = await previsaoIssFora()
    const ano = previsao.anoBase
    const vazio: CenarioLimite = { cruzamMei: [], cruzamSimples: [] }

    const variantes = await variantesLocais(ano)
    if (!variantes.length) {
      return { anoBase: ano, anoPrevisao: previsao.anoPrevisao, conservador: vazio, provavel: vazio, agressivo: vazio }
    }
    const inList = variantes.map(v => `'${esc(v)}'`).join(',')

    const [empMei, empSimples] = await Promise.all([
      empresasNaFaixa(inList, ano, MEI * 0.5, MEI),
      empresasNaFaixa(inList, ano, SIMPLES * 0.5, SIMPLES),
    ])

    const porCenario = (cenario: Cenario): CenarioLimite => {
      const pct = crescimentoTotalPct(previsao, cenario)
      const projetar = (lista: typeof empMei, teto: number): EmpresaLimite[] =>
        lista
          .map(e => ({ cnpj: e.cnpj, nome: e.nome, atual: e.receita, projetado: e.receita * (1 + pct) }))
          .filter(e => e.projetado > teto)
          .sort((a, b) => b.projetado - a.projetado)
      return { cruzamMei: projetar(empMei, MEI), cruzamSimples: projetar(empSimples, SIMPLES) }
    }

    return {
      anoBase: ano,
      anoPrevisao: previsao.anoPrevisao,
      conservador: porCenario('conservador'),
      provavel: porCenario('provavel'),
      agressivo: porCenario('agressivo'),
    }
  })
}

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    return NextResponse.json(await limiteFaturamentoProjecao())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
