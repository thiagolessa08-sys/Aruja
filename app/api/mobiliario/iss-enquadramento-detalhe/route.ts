import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const esc = (s: string) => s.replace(/'/g, "''")

export interface EmpresaDetalhe { nome: string; cpfCnpj: string; ccm: string }

// Mesmo filtro de segmento usado em iss-segmento-enquadramento/iss-prestadores.
function filtroSegmento(segmento: string): string {
  if (segmento === 'Não classificado') return `(mob.ds_grupo IS NULL OR LTRIM(RTRIM(mob.ds_grupo)) = '')`
  return `LTRIM(RTRIM(mob.ds_grupo)) = '${esc(segmento)}'`
}

// Drill do card "Análise de Enquadramento" (a pedido do usuário) — lista as empresas por
// trás de uma barra (tipo de empresa) ou tile (situação cadastral) clicado, dado o segmento
// já selecionado. Mesmo join cd_contr → tb_dsod_contribuinte já usado em
// iss-segmento-enquadramento pro cálculo de ISS Estimado, mas aqui sem tocar em NFS-e — é
// só o cadastro (nome, CPF/CNPJ, CCM), aplicável a qualquer situação/tipo, não só Ativo.
function filtroDimensao(dimensao: 'tipo' | 'situacao', valor: string): string {
  const coluna = dimensao === 'tipo' ? 'mob.ds_tipo_empresa' : 'mob.ds_situacao'
  if (valor === 'Não informado') return `(${coluna} IS NULL OR LTRIM(RTRIM(${coluna})) = '')`
  return `LTRIM(RTRIM(${coluna})) = '${esc(valor)}'`
}

// Sem TOP: é uma listagem completa dos cadastros do grupo, ordenada por nome (não é um
// ranking por valor) — truncar alfabeticamente esconderia o final da lista de forma
// enganosa. Buckets reais chegam a ~15 mil linhas (ex.: "Ativo" em segmentos grandes,
// validado ao vivo); o teto de 20 mil é só uma proteção contra caso patológico, não um
// limite esperado de atingir na prática.
const TETO_SEGURANCA = 20000

async function detalhe(segmento: string, dimensao: 'tipo' | 'situacao', valor: string): Promise<EmpresaDetalhe[]> {
  return cached(`iss:enqDetalhe:${segmento}:${dimensao}:${valor}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT cp.nm_rsocial nome, cp.no_cpf_cnpj cpfCnpj, mob.cd_contr_mob ccm
      FROM ${S}.tb_dsod_contribuinte_mobiliario mob
      JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = mob.cd_contr
      WHERE ${filtroSegmento(segmento)} AND ${filtroDimensao(dimensao, valor)}
      ORDER BY cp.nm_rsocial`, TETO_SEGURANCA)
    return r.rows.map(row => ({
      nome: String(row[0] ?? '').trim() || 'Não identificado',
      cpfCnpj: String(row[1] ?? '').trim(),
      ccm: String(row[2] ?? '').trim(),
    }))
  })
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const segmento = (req.nextUrl.searchParams.get('segmento') || '').trim()
    const dimensao = req.nextUrl.searchParams.get('dimensao')
    const valor = (req.nextUrl.searchParams.get('valor') || '').trim()
    if (!segmento || (dimensao !== 'tipo' && dimensao !== 'situacao') || !valor) {
      return NextResponse.json({ error: 'Parâmetros segmento, dimensao (tipo|situacao) e valor são obrigatórios' }, { status: 400 })
    }
    const itens = await detalhe(segmento, dimensao, valor)
    return NextResponse.json({ itens })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
