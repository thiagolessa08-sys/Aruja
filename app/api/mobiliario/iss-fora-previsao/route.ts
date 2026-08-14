import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const JANELA = 5 // nº de exercícios completos usados na regressão

// Mesma normalização/classificação de município do prestador usada em iss-fora-municipio
// (nm_mun é texto livre — ver comentário lá para detalhe das variações).
function normalizarMunicipio(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}
function classificar(raw: unknown): 'local' | 'fora' | null {
  const norm = normalizarMunicipio(raw)
  if (!norm) return null
  if (norm.includes('GUARUJA')) return 'fora'
  return norm.includes('ARUJA') ? 'local' : 'fora'
}

export interface CenariosValor { conservador: number; provavel: number; agressivo: number }
export interface PrevisaoForaResp {
  anoBase: number       // último exercício completo usado como âncora
  anoPrevisao: number   // exercício projetado (anoBase + 2, ex.: 2025 → 2027)
  historico: { ano: number; local: number; fora: number }[]
  local: CenariosValor
  fora: CenariosValor
}

// Regressão linear simples (mínimos quadrados) — mesma técnica de previsaoMensalIptu
// (lib/tributo-engine.ts), aplicada aqui ao total anual em vez de mês a mês.
function regressaoLinear(pontos: { x: number; y: number }[]): (x: number) => number {
  const n = pontos.length
  const sx = pontos.reduce((s, p) => s + p.x, 0)
  const sy = pontos.reduce((s, p) => s + p.y, 0)
  const sxx = pontos.reduce((s, p) => s + p.x * p.x, 0)
  const sxy = pontos.reduce((s, p) => s + p.x * p.y, 0)
  const den = n * sxx - sx * sx
  if (!den) return () => sy / n
  const b = (n * sxy - sx * sy) / den
  const a0 = (sy - b * sx) / n
  return (x: number) => a0 + b * x
}

// Um ano por consulta (não por causa de custo, mas porque o agente trunca em 5000 linhas —
// agrupado por (ano, nm_mun) em vários anos facilmente passa disso; por ano isolado fica
// bem abaixo, ~2000-3000 municípios distintos).
async function issPorAno(ano: number): Promise<{ local: number; fora: number }> {
  const r = await agentQuery(`
    SELECT nm_mun, SUM(vl_imposto) iss
    FROM ${S}.tb_dsod_nfse
    WHERE ic_situacao_nota_fiscal = '1' AND YEAR(dt_emissao) = ${ano}
    GROUP BY nm_mun`, 5000)
  let local = 0, fora = 0
  for (const row of r.rows) {
    const cls = classificar(row[0])
    if (cls === null) continue
    const iss = num(row[1])
    if (cls === 'local') local += iss; else fora += iss
  }
  return { local, fora }
}

// Previsão do ISS "de fora do município" (e, para contexto, "local") indicado nas NFS-e.
// Âncora no último exercício COMPLETO (ano corrente é parcial — NFS-e acumula mês a mês,
// ao contrário do IPTU) e projeta 2 exercícios à frente (ex.: base 2025 → previsão 2027).
// 3 cenários aplicados sobre o crescimento projetado pela regressão dos últimos 5
// exercícios completos: conservador = metade do crescimento, provável = regressão cheia,
// agressivo = 1,5× o crescimento — todos ancorados no valor real do último exercício.
async function previsao(): Promise<PrevisaoForaResp> {
  return cached('iss:foraPrevisao', TTL_15MIN, async () => {
    const anoAtual = new Date().getFullYear()
    const anoBase = anoAtual - 1 // último exercício completo
    const anoPrevisao = anoBase + 2
    const anos = Array.from({ length: JANELA }, (_, i) => anoBase - JANELA + 1 + i)

    const serie = await Promise.all(anos.map(async ano => ({ ano, ...(await issPorAno(ano)) })))

    const projetar = (sel: (v: { local: number; fora: number }) => number): CenariosValor => {
      const pontos = serie.map(s => ({ x: s.ano, y: sel(s) }))
      const reg = regressaoLinear(pontos)
      const provavel = Math.max(0, reg(anoPrevisao))
      const base = sel(serie[serie.length - 1])
      const crescimento = provavel - base
      return {
        conservador: Math.max(0, base + crescimento * 0.5),
        provavel,
        agressivo: Math.max(0, base + crescimento * 1.5),
      }
    }

    return {
      anoBase,
      anoPrevisao,
      historico: serie.map(s => ({ ano: s.ano, local: s.local, fora: s.fora })),
      local: projetar(v => v.local),
      fora: projetar(v => v.fora),
    }
  })
}

export async function GET(_req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    return NextResponse.json(await previsao())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
