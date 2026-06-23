import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listSchemaTables } from '@/lib/agent'
import { getCatalog } from '@/lib/catalog-cache'

export const dynamic = 'force-dynamic'

/**
 * Diagnóstico: compara as tabelas referenciadas no catálogo (lib/catalog.json)
 * com as tabelas que REALMENTE existem no schema pref_aruja_sp do Sybase IQ.
 * Roda no servidor (Railway), que tem acesso ao agent — útil para limpar do
 * catálogo qualquer tabela que não exista mais no banco.
 */
export async function GET() {
  const session = getSession()
  if (!session) return new NextResponse('Não autenticado', { status: 401 })

  const catalog = getCatalog()
  if (!catalog) {
    return NextResponse.json({ erro: 'Catálogo não carregado (lib/catalog.json ausente).' }, { status: 500 })
  }

  // 1) Tabelas reais no banco
  let tabelasBanco: string[]
  try {
    tabelasBanco = await listSchemaTables('pref_aruja_sp')
  } catch (e) {
    return NextResponse.json({ erro: `Falha ao listar tabelas do banco: ${String(e)}` }, { status: 502 })
  }
  const setBanco = new Set(tabelasBanco.map(t => t.trim().toUpperCase()))

  // 2) Todas as tabelas referenciadas no catálogo (entradas + mapa_conceitos)
  const referenciadas = new Set<string>()
  for (const entry of catalog.entradas) referenciadas.add(entry.tabela.trim())
  for (const tabelas of Object.values(catalog.mapa_conceitos)) {
    for (const t of tabelas as string[]) referenciadas.add(t.trim())
  }

  const todas = [...referenciadas].sort()
  const existem = todas.filter(t => setBanco.has(t.toUpperCase()))
  const naoExistem = todas.filter(t => !setBanco.has(t.toUpperCase()))

  return NextResponse.json({
    total_tabelas_no_banco: setBanco.size,
    total_referenciadas_no_catalogo: todas.length,
    existem,
    nao_existem: naoExistem,
  })
}
