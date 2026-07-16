// Comparativo Detalhado (item 16) — categorias por exercício, comparando ano × ano-1.
// Regras APROXIMADAS (best-guess do schema) — o usuário ajusta as que estiverem erradas.
// Base por ano = imóveis com guia de IPTU no exercício (ponte cd_devedor→imóvel→cep),
// então varia por ano e é filtrável por bairro. Categorias 'pendente' ainda sem regra.
import { agentQuery } from '@/lib/agent'
import { cached, CACHE_TTL } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0

export interface LinhaComparativo { categoria: string; a: number; b: number; variacao: number; pct: number; pendente: boolean }

// Contagens de um exercício. Base: imóveis com IPTU no ano (ponte cd_devedor).
// Separado em queries simples (evita subquery dentro de CASE, que o IQ pode não aceitar).
async function contagensAno(ano: number, bairro: string | null): Promise<Record<string, number>> {
  const wb = bairro ? ` AND c.nm_bairro = '${bairro.replace(/'/g, "''")}'` : ''
  const from = `FROM ${S}.tb_dsod_guias g
    JOIN ${S}.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = g.cd_devedor
    JOIN ${S}.tb_dsod_cep c ON c.cd_cep = i.cd_cep`
  const where = `WHERE g.cd_tributo = 1 AND g.no_exercicio_lancamento = ${ano}${wb}`
  const itbiSub = `SELECT iiu.cd_imovel_urbano FROM ${S}.tb_dsod_itbi itb JOIN ${S}.tb_dsod_itbi_imovel_urbano iiu ON iiu.cd_itbi = itb.cd_itbi WHERE itb.dt_lancamento BETWEEN '${ano}-01-01' AND getdate()-1 AND itb.vl_total > 0`
  const [attrR, vincR, itbiR] = await Promise.all([
    // atributos do imóvel/proprietário (CASE simples, sem subquery)
    agentQuery(`SELECT
        COUNT(DISTINCT g.cd_devedor) total,
        COUNT(DISTINCT CASE WHEN i.vl_area_edificaca = 0 THEN g.cd_devedor END) baldios,
        COUNT(DISTINCT CASE WHEN i.ic_status_registro <> 'A' THEN g.cd_devedor END) inativos,
        COUNT(DISTINCT CASE WHEN (i.no_imovel = 0 OR i.no_imovel IS NULL) THEN g.cd_devedor END) semnum,
        COUNT(DISTINCT CASE WHEN cp.ic_pessoa = 'J' THEN g.cd_devedor END) cnpjs,
        COUNT(DISTINCT CASE WHEN cp.nm_rsocial LIKE '%ESP_LIO%' THEN g.cd_devedor END) espolios
      ${from} LEFT JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = i.cd_contr_proprietario ${where}`, 1),
    // vínculo mobiliário (empresa no endereço)
    agentQuery(`SELECT COUNT(DISTINCT g.cd_devedor) ${from} ${where} AND g.cd_devedor IN (SELECT mf.cd_imovel_urbano FROM ${S}.tb_dsod_contribuinte_mob_fisico mf)`, 1),
    // ITBI lançado no exercício
    agentQuery(`SELECT COUNT(DISTINCT g.cd_devedor) ${from} ${where} AND g.cd_devedor IN (${itbiSub})`, 1),
  ])
  const o: Record<string, number> = {}
  const cols = attrR.columns.map(c => String(c).trim().toLowerCase())
  const row = attrR.rows[0] ?? []
  cols.forEach((c, idx) => { o[c] = num(row[idx]) })
  o.vincmob = num(vincR.rows[0]?.[0])
  o.itbis = num(itbiR.rows[0]?.[0])
  return o
}

// Definição das linhas (ordem do print). key = coluna da query; pendente = ainda sem regra.
const LINHAS: { categoria: string; key: string | null }[] = [
  { categoria: 'Total de Imóveis', key: 'total' },
  { categoria: 'Baldios', key: 'baldios' },
  { categoria: 'Inativos', key: 'inativos' },
  { categoria: 'Vínculo Mobiliário', key: 'vincmob' },
  { categoria: 'CCMs como Responsáveis', key: null },
  { categoria: 'Imóveis sem nº oficial', key: 'semnum' },
  { categoria: 'CNPJs como Responsáveis', key: 'cnpjs' },
  { categoria: 'Imóveis em Litígio', key: null },
  { categoria: 'Espólios', key: 'espolios' },
  { categoria: 'Imóveis com +12 Parcelas', key: null },
  { categoria: 'Empreendimentos', key: null },
  { categoria: 'ITBIs', key: 'itbis' },
  { categoria: 'Protesto', key: null },
  { categoria: 'Contatos Cobrança', key: null },
]

export function comparativoIptu(ano: number, bairro: string | null) {
  const key = `iptuComparativo:${ano}:${bairro ?? ''}`
  return cached(key, CACHE_TTL, async () => {
    const [ca, cb] = await Promise.all([contagensAno(ano, bairro), contagensAno(ano - 1, bairro)])
    const linhas: LinhaComparativo[] = LINHAS.map(l => {
      const a = l.key ? (ca[l.key] ?? 0) : 0
      const b = l.key ? (cb[l.key] ?? 0) : 0
      const variacao = a - b
      const pct = b ? (variacao / b) * 100 : (a > 0 ? 100 : 0)
      return { categoria: l.categoria, a, b, variacao, pct, pendente: !l.key }
    })
    return { anoA: ano, anoB: ano - 1, linhas }
  })
}
