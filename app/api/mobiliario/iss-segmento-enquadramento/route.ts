import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

export interface Contagem { nome: string; qt: number }
export interface EnquadramentoResp { total: number; porTipo: Contagem[]; porSituacao: Contagem[]; valorServicoAtivos: number; issEstimadoAtivos: number }

// Mesmo conjunto de situações "ativas" já usado no KPI "Empresas Ativas" da aba cadastral
// Mobiliário (ver lib/mobiliario-filtros.ts).
const SITUACOES_ATIVAS = ['Ativo', 'Ativo título precário', 'Abertura']
// Alíquota média de ISS assumida pro cálculo estimado (a pedido do usuário) — não é a
// alíquota real de nenhuma nota, é uma média fixa aplicada sobre o valor de serviço.
const ALIQUOTA_MEDIA_ISS = 0.035

// NULL e string vazia caem em grupos SQL separados, mas os dois viram o mesmo rótulo
// "Não informado" — soma antes de ordenar pra não duplicar a linha na lista.
function agregarPorNome(rows: unknown[][]): Contagem[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const nome = String(r[0] ?? '').trim() || 'Não informado'
    map.set(nome, (map.get(nome) ?? 0) + num(r[1]))
  }
  return [...map.entries()]
    .map(([nome, qt]) => ({ nome, qt }))
    .filter(x => x.qt > 0)
    .sort((a, b) => b.qt - a.qt)
}

// Mesmo filtro de segmento usado em /api/mobiliario/iss-prestadores — "Não classificado"
// cai pra ds_grupo em branco/nulo (mesmo rótulo do card ISS por Segmento).
function filtroSegmento(segmento: string): string {
  if (segmento === 'Não classificado') return `(ds_grupo IS NULL OR LTRIM(RTRIM(ds_grupo)) = '')`
  return `LTRIM(RTRIM(ds_grupo)) = '${esc(segmento)}'`
}

// Painel "Análise de Enquadramento" — companion do drill de segmento em ISS por Segmento
// (IssSegmentoPrestador): dado um segmento (ds_grupo), quebra as empresas cadastradas
// naquele segmento por tipo de empresa (ds_tipo_empresa: EMPRESA, MEI, AUTÔNOMO, ME, LTDA,
// EPP, EIRELI, SA, ENTIDADES...) e por situação cadastral (ds_situacao: Ativo, Cancelado,
// Suspenso...). É um retrato do CADASTRO atual (tb_dsod_contribuinte_mobiliario), não do
// financeiro — por isso não usa ano/mês (mesma convenção da aba cadastral "Mobiliário",
// que filtra por situação em vez de exercício).
//
// `tipo` (opcional, a pedido do usuário): ao selecionar uma barra de "Por tipo de empresa"
// na tela, a situação cadastral e o ISS Estimado devem refletir só aquele tipo — sem isso,
// ficavam estáticos (sempre o total do segmento) mesmo com uma barra selecionada. `porTipo`
// e `total` continuam sempre no total do segmento (são a lista de barras clicáveis).
async function enquadramentoDoSegmento(segmento: string, tipo: string | null): Promise<EnquadramentoResp> {
  return cached(`iss:segEnquadramento:${segmento}:${tipo ?? ''}`, TTL_15MIN, async () => {
    const cond = filtroSegmento(segmento)
    const condTipo = tipo ? `${cond} AND LTRIM(RTRIM(ds_tipo_empresa)) = '${esc(tipo)}'` : cond
    const condTipoMob = tipo ? `${cond.replace(/ds_grupo/g, 'mob.ds_grupo')} AND LTRIM(RTRIM(mob.ds_tipo_empresa)) = '${esc(tipo)}'` : cond.replace(/ds_grupo/g, 'mob.ds_grupo')
    const [rTipo, rSit, rValor] = await Promise.all([
      agentQuery(`SELECT ds_tipo_empresa, COUNT(*) n FROM ${S}.tb_dsod_contribuinte_mobiliario WHERE ${cond} GROUP BY ds_tipo_empresa`, 30),
      agentQuery(`SELECT ds_situacao, COUNT(*) n FROM ${S}.tb_dsod_contribuinte_mobiliario WHERE ${condTipo} GROUP BY ds_situacao`, 30),
      // Valor de Serviço (NFS-e válidas) das empresas Ativas do segmento (e do tipo, se
      // filtrado) — pré-agregado por no_cpf_cnpj ANTES de juntar com as notas
      // (tb_dsod_contribuinte não é único por no_cpf_cnpj; um JOIN direto multiplicaria
      // vl_servicos, mesmo cuidado já usado em iss-tomador-ccm-crc-detalhe). Só notas com
      // ic_situacao_nota_fiscal = '1' (Normal), mesma convenção de "volume real de ISS"
      // usada em iss-emitidas-tomadas.
      agentQuery(`
        SELECT SUM(n.vl_servicos) valorServico
        FROM (
          SELECT DISTINCT cp.no_cpf_cnpj
          FROM ${S}.tb_dsod_contribuinte_mobiliario mob
          JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = mob.cd_contr
          WHERE ${condTipoMob} AND mob.ds_situacao IN ('${SITUACOES_ATIVAS.join("','")}')
        ) ativos
        JOIN ${S}.tb_dsod_nfse n ON n.no_cpf_cnpj = ativos.no_cpf_cnpj
        WHERE n.ic_situacao_nota_fiscal = '1'`, 5),
    ])
    const porTipo = agregarPorNome(rTipo.rows)
    const porSituacao = agregarPorNome(rSit.rows)
    const total = porTipo.reduce((s, t) => s + t.qt, 0)
    const valorServicoAtivos = num(rValor.rows[0]?.[0])
    return { total, porTipo, porSituacao, valorServicoAtivos, issEstimadoAtivos: valorServicoAtivos * ALIQUOTA_MEDIA_ISS }
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const segmento = (req.nextUrl.searchParams.get('segmento') || '').trim()
    const tipo = (req.nextUrl.searchParams.get('tipo') || '').trim() || null
    if (!segmento) return NextResponse.json({ error: 'segmento obrigatório' }, { status: 400 })
    return NextResponse.json(await enquadramentoDoSegmento(segmento, tipo))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
