import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { potencialMensalTributo, tributoOficialQuandoVenceAcumulado, tributoOficialInadimplenciaAno, TRIBUTOS_MODELO_OFICIAL_ABERTO } from '@/lib/tributo-engine'

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
    // Tributos com modelo OFICIAL conhecido (IPTU/ITBI — TRIBUTOS_MODELO_OFICIAL_ABERTO),
    // sozinhos (não combinados com outro código), usam tb_dsod_parcela_movimento (a pedido do
    // usuário), com cada mês ACUMULANDO desde o início do exercício (bate com o KPI "Em
    // Aberto" quando se filtra por Mês em Imobiliário, não o valor isolado do mês). "IPTU
    // Diferença de Área" (cd=25) e combinações com outros tributos ("Demais tributos")
    // continuam no modelo antigo de posição.
    const ehOficial = codigos.length === 1 && TRIBUTOS_MODELO_OFICIAL_ABERTO.includes(codigos[0]) && !!ano
    const [itens, inadimplenciaTotal] = await Promise.all([
      ehOficial ? tributoOficialQuandoVenceAcumulado(codigos[0], ano!, mes) : potencialMensalTributo(codigos, ano, mes),
      // Total exato de Inadimplência (a pedido do usuário) — não dá pra derivar da série
      // mensal acima somando os meses marcados "vencido", porque essa marcação compara só
      // ANO/MÊS (não o dia exato de vencimento): o mês corrente pode estar PARCIALMENTE
      // vencido e ficaria de fora inteiro, subestimando o total (foi o caso do ITBI: setembro
      // concentra quase todo o saldo do ano e ficava inteiro do lado "a vencer").
      // tributoOficialInadimplenciaAno já filtra por dt_vencimento < hoje-1 no grão da
      // parcela, então dá o valor certo.
      ehOficial ? tributoOficialInadimplenciaAno(codigos[0], ano!, mes) : Promise.resolve(null),
    ])
    return NextResponse.json({ itens, inadimplenciaTotal })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
