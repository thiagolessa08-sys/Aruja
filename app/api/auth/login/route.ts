import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'
import { homeDoPerfil, type Perfil } from '@/lib/perfil'
import { registrarEvento, ipDaRequisicao } from '@/lib/acesso-log'

// Usuários (credenciais via env, com defaults). Cada um tem um perfil de acesso.
const USUARIOS: { id: number; email: string; senha: string; role: Perfil; nome: string }[] = [
  { id: 1, email: process.env.ADMIN_EMAIL || 'admin@prefeitura.com', senha: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin', nome: 'Administrador' },
  { id: 2, email: process.env.ORCAMENTO_EMAIL || 'orcamento@prefeitura.com', senha: process.env.ORCAMENTO_PASSWORD || 'orcamento123', role: 'orcamentario', nome: 'Orçamentário' },
  { id: 3, email: process.env.TRIBUTARIO_EMAIL || 'tributario@prefeitura.com', senha: process.env.TRIBUTARIO_PASSWORD || 'tributario123', role: 'tributario', nome: 'Tributário' },
  { id: 4, email: process.env.ROBERTA_EMAIL || 'roberta@prefeitura.com', senha: process.env.ROBERTA_PASSWORD || 'roberta123', role: 'tributario', nome: 'Roberta' },
  { id: 5, email: process.env.FRANCINE_EMAIL || 'francine@prefeitura.com', senha: process.env.FRANCINE_PASSWORD || 'francine123', role: 'tributario', nome: 'Francine' },
  { id: 6, email: process.env.MARCIO_EMAIL || 'marcio@prefeitura.com', senha: process.env.MARCIO_PASSWORD || 'marcio123', role: 'admin', nome: 'Márcio' },
  { id: 7, email: process.env.ROGERIO_EMAIL || 'rogerio@prefeitura.com', senha: process.env.ROGERIO_PASSWORD || 'rogerio123', role: 'admin', nome: 'Rogério' },
]

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = await req.json()
    if (!email || !senha) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
    }

    const u = USUARIOS.find(x => x.email === email && x.senha === senha)
    if (!u) {
      await registrarEvento({
        tipo: 'LOGIN_FALHA',
        usuario: { nome: '-', email: String(email), role: '-' },
        pagina: '/login',
        ip: ipDaRequisicao(req.headers),
      }).catch(() => {})
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const token = signToken({ userId: u.id, email: u.email, nome: u.nome, role: u.role })
    const home = homeDoPerfil(u.role)
    await registrarEvento({
      tipo: 'LOGIN',
      usuario: { nome: u.nome, email: u.email, role: u.role },
      pagina: '/login',
      ip: ipDaRequisicao(req.headers),
    }).catch(() => {})

    const res = NextResponse.json({ ok: true, nome: u.nome, role: u.role, home })
    res.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    // Cookie legível (não sensível) só para a UI decidir o que exibir
    res.cookies.set('perfil', u.role, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[login]', msg)
    return NextResponse.json({ error: 'Erro interno', detail: msg }, { status: 500 })
  }
}
