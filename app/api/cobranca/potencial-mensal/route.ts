import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { potencialMensalTributo, iptuOficialQuandoVenceAcumulado, iptuOficialInadimplenciaAno } from '@/lib/tributo-engine'

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
    const ehIptu = codigos.length === 1 && codigos[0] === 1 && !!ano
    const [itens, inadimplenciaTotal] = await Promise.all([
      ehIptu ? iptuOficialQuandoVenceAcumulado(ano!, mes) : potencialMensalTributo(codigos, ano, mes),
      // Total exato de Inadimplência (a pedido do usuário) — não dá pra derivar da série
      // mensal acima somando os meses marcados "vencido", porque essa marcação compara só
      // ANO/MÊS (não o dia exato de vencimento): o mês corrente pode estar PARCIALMENTE
      // vencido e ficaria de fora inteiro, subestimando o total. iptuOficialInadimplenciaAno
      // já filtra por dt_vencimento < hoje-1 no grão da parcela, então dá o valor certo.
      ehIptu ? iptuOficialInadimplenciaAno(ano!, mes) : Promise.resolve(null),
    ])
    return NextResponse.json({ itens, inadimplenciaTotal })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
