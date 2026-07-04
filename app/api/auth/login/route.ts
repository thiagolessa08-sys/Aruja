import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'
import { homeDoPerfil, type Perfil } from '@/lib/perfil'

// Usuários (credenciais via env, com defaults). Cada um tem um perfil de acesso.
const USUARIOS: { id: number; email: string; senha: string; role: Perfil; nome: string }[] = [
  { id: 1, email: process.env.ADMIN_EMAIL || 'admin@prefeitura.com', senha: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin', nome: 'Administrador' },
  { id: 2, email: process.env.ORCAMENTO_EMAIL || 'orcamento@prefeitura.com', senha: process.env.ORCAMENTO_PASSWORD || 'orcamento123', role: 'orcamentario', nome: 'Orçamentário' },
  { id: 3, email: process.env.TRIBUTARIO_EMAIL || 'tributario@prefeitura.com', senha: process.env.TRIBUTARIO_PASSWORD || 'tributario123', role: 'tributario', nome: 'Tributário' },
]

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = await req.json()
    if (!email || !senha) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })
    }

    const u = USUARIOS.find(x => x.email === email && x.senha === senha)
    if (!u) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const token = signToken({ userId: u.id, email: u.email, nome: u.nome, role: u.role })
    const home = homeDoPerfil(u.role)

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
