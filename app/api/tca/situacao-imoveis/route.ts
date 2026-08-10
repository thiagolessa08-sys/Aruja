import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { imoveisPorSituacaoTca } from '@/lib/tca-engine'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const situacao = sp.get('situacao') || ''
    if (!situacao) return NextResponse.json({ error: 'situação inválida' }, { status: 400 })
    const bairro = sp.get('bairro') || null
    const rua = bairro ? (sp.get('rua') || null) : null
    const imovelParam = Number(sp.get('imovel'))
    const imovel = imovelParam > 0 ? imovelParam : null
    const itens = await imoveisPorSituacaoTca(ano, situacao, { bairro, rua, imovel })
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
