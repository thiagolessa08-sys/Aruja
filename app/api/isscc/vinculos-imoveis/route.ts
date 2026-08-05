import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { imoveisPorVinculoIsscc, type CategoriaVinculoIsscc } from '@/lib/isscc-engine'

const CATEGORIAS: CategoriaVinculoIsscc[] = ['imoveis', 'comMobiliario', 'proprietarioPJ']

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const categoria = sp.get('categoria') as CategoriaVinculoIsscc
    if (!CATEGORIAS.includes(categoria)) return NextResponse.json({ error: 'categoria inválida' }, { status: 400 })
    const itens = await imoveisPorVinculoIsscc(ano, categoria, sp.get('q') || undefined)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
