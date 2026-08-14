import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const ANO_MIN = 2018

export interface GrupoMun { qt: number; base: number; iss: number }
export interface MunItem { nome: string; qt: number; iss: number }
export interface ForaMunicipioResp { local: GrupoMun; fora: GrupoMun; naoInformado: GrupoMun; topFora: MunItem[] }

// nm_mun em tb_dsod_nfse é texto livre (digitado por quem emite a nota) — sem tratamento,
// "Arujá" aparece em dezenas de grafias (" ARUJÁ", "-ARUJA", "'ARUJA", "00ARUJA", "AARUJA",
// além de encoding corrompido e erros de digitação). Normaliza maiúsculas + remove acentos/
// pontuação e testa substring "ARUJA", excluindo explicitamente "GUARUJA" (cidade vizinha
// diferente que também contém esse substring). Cobre a grande maioria das variações reais
// encontradas na base; typos que alteram letras (ex.: "ADRUJÁ") ficam como residual em
// "fora" — por isso o card avisa que a classificação é aproximada.
function normalizarMunicipio(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // remove acentos (após NFD)
    .toUpperCase()
    .replace(/[^A-Z]/g, '') // só letras
}
function classificar(raw: unknown): 'local' | 'fora' | null {
  const norm = normalizarMunicipio(raw)
  if (!norm) return null
  if (norm.includes('GUARUJA')) return 'fora'
  return norm.includes('ARUJA') ? 'local' : 'fora'
}

// ISS "declarado" nas NFS-e (vl_imposto/vl_servicos), agrupado por município do prestador
// — fonte independente do motor de lançado/arrecadado (tb_dsod_guias) usado no resto da
// aba ISS; não somar com "ISS lançado" do topo da tela. Mesma tabela/convenção usada em
// /api/reforma/base (Base de Serviços). ic_situacao_nota_fiscal = '1' (ativa, não cancelada
// — comparação como string: coluna não é numérica no schema do agente).
async function issForaMunicipio(ano?: number, mes?: number): Promise<ForaMunicipioResp> {
  return cached(`iss:foraMunicipio:${ano ?? ''}:${mes ?? ''}`, TTL_15MIN, async () => {
    const anoAtual = new Date().getFullYear()
    const filtroData = ano
      ? ` AND YEAR(dt_emissao) = ${ano}${mes ? ` AND MONTH(dt_emissao) <= ${mes}` : ''}`
      : ` AND YEAR(dt_emissao) BETWEEN ${ANO_MIN} AND ${anoAtual}`
    const r = await agentQuery(`
      SELECT nm_mun, COUNT(*) qt, SUM(vl_servicos) base, SUM(vl_imposto) iss
      FROM ${S}.tb_dsod_nfse
      WHERE ic_situacao_nota_fiscal = '1'${filtroData}
      GROUP BY nm_mun`, 20000)

    const zero = (): GrupoMun => ({ qt: 0, base: 0, iss: 0 })
    const local = zero(), fora = zero(), naoInformado = zero()
    const foraPorMun = new Map<string, MunItem>()

    for (const row of r.rows) {
      const nome = row[0]
      const item: GrupoMun = { qt: num(row[1]), base: num(row[2]), iss: num(row[3]) }
      const cls = classificar(nome)
      if (cls === null) { naoInformado.qt += item.qt; naoInformado.base += item.base; naoInformado.iss += item.iss; continue }
      if (cls === 'local') { local.qt += item.qt; local.base += item.base; local.iss += item.iss; continue }
      fora.qt += item.qt; fora.base += item.base; fora.iss += item.iss
      const chave = String(nome ?? '').trim() || 'Não informado'
      const cur = foraPorMun.get(chave) ?? { nome: chave, qt: 0, iss: 0 }
      cur.qt += item.qt; cur.iss += item.iss
      foraPorMun.set(chave, cur)
    }

    const topFora = [...foraPorMun.values()].sort((a, b) => b.iss - a.iss).slice(0, 8)
    return { local, fora, naoInformado, topFora }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || undefined
    const mes = Number(sp.get('mes')) || undefined
    return NextResponse.json(await issForaMunicipio(ano, mes))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
