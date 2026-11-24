import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { registrarEvento, lerArquivos, ipDaRequisicao } from '@/lib/acesso-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST: o navegador avisa que abriu uma página (ACESSO), que continua com a aba aberta
// (HEARTBEAT, a cada 60s) ou que fechou a aba (SAIDA, via sendBeacon).
export async function POST(req: NextRequest) {
  const s = getSession()
  if (!s) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: { tipo?: string; aba?: string; pagina?: string } = {}
  try {
    body = JSON.parse(await req.text())
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  const tipo = body.tipo === 'ACESSO' || body.tipo === 'HEARTBEAT' || body.tipo === 'SAIDA' ? body.tipo : null
  if (!tipo) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  await registrarEvento({
    tipo,
    usuario: { nome: s.nome, email: s.email, role: s.role },
    aba: body.aba,
    pagina: body.pagina,
    ip: ipDaRequisicao(req.headers),
  })
  return NextResponse.json({ ok: true })
}

// GET (só admin): devolve os arquivos .txt.
//   /api/acesso                      → sessoes-ativas.txt
//   /api/acesso?arquivo=historico    → acessos.txt
//   &download=1                      → baixa como arquivo
export async function GET(req: NextRequest) {
  const s = getSession()
  if (!s) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { sessoes, historico } = await lerArquivos()
  const qs = req.nextUrl.searchParams
  const ehHistorico = qs.get('arquivo') === 'historico'
  const nome = ehHistorico ? 'acessos.txt' : 'sessoes-ativas.txt'
  const conteudo = ehHistorico ? historico || '(sem acessos registrados ainda)\n' : sessoes

  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  if (qs.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="${nome}"`
  return new NextResponse(conteudo, { headers })
}
