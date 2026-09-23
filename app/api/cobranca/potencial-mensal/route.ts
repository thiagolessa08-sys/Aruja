import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { potencialMensalTributo, iptuOficialQuandoVenceAcumulado } from '@/lib/tributo-engine'

// Drill "quando vence" do ranking de Potencial de Arrecadação (Cobrança): saldo por mês de
// vencimento de um ou mais códigos de tributo.
export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const codigos = (req.nextUrl.searchParams.get('codigos') ?? '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v))
  if (!codigos.length) return NextResponse.json({ error: 'codigos inválido' }, { status: 400 })
  const anoRaw = req.nextUrl.searchParams.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : undefined
  const mes = Number(req.nextUrl.searchParams.get('mes')) || undefined

  try {
    // IPTU sozinho (cd_tributo=1) usa o modelo OFICIAL de Imobiliário (a pedido do usuário),
    // com cada mês ACUMULANDO desde o início do exercício (a pedido do usuário — bate com o
    // KPI "Em Aberto" quando se filtra por Mês na tela de IPTU, não o valor isolado do mês).
    // "IPTU Diferença de Área" (cd=25) e combinações com outros tributos ("Demais tributos")
    // continuam no modelo antigo de posição.
    const itens = (codigos.length === 1 && codigos[0] === 1 && ano)
      ? await iptuOficialQuandoVenceAcumulado(ano, mes)
      : await potencialMensalTributo(codigos, ano, mes)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
