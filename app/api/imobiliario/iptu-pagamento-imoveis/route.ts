import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { imoveisPorPagamento, type CategoriaPagamento } from '@/lib/iptu-agg'

const CATEGORIAS: CategoriaPagamento[] = ['CotaUnica', 'Parcelado', 'PagoParcial', 'EmAberto']

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const categoria = sp.get('categoria') as CategoriaPagamento
    if (!CATEGORIAS.includes(categoria)) return NextResponse.json({ error: 'categoria inválida' }, { status: 400 })
    const bairro = sp.get('bairro') || null
    const itens = await imoveisPorPagamento({
      ano,
      bairro,
      rua: bairro ? (sp.get('rua') || null) : null,
      espolio: sp.get('espolio') === '1',
      semNumero: sp.get('semnumero') === '1',
    }, categoria, sp.get('q') || undefined)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
