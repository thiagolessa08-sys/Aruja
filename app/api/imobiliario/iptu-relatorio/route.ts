import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { relatorioIptu } from '@/lib/iptu-relatorio'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = req.nextUrl.searchParams
    const ano = Number(sp.get('ano')) || new Date().getFullYear()
    const mes = Number(sp.get('mes')) || null
    const bairro = sp.get('bairro') || null
    const rua = bairro ? (sp.get('rua') || null) : null
    const espolio = sp.get('espolio') === '1'
    const semNumero = sp.get('semnumero') === '1'
    const itens = await relatorioIptu({ ano, mes, bairro, rua, espolio, semNumero })
    return NextResponse.json({ nivel: bairro ? 'contribuinte' : 'bairro', bairro, rua, itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
