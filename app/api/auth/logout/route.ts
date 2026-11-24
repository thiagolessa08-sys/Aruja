import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { registrarEvento, ipDaRequisicao } from '@/lib/acesso-log'

export async function POST(req: NextRequest) {
  const s = getSession()
  if (s) {
    await registrarEvento({
      tipo: 'LOGOUT',
      usuario: { nome: s.nome, email: s.email, role: s.role },
      ip: ipDaRequisicao(req.headers),
    }).catch(() => {})
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('auth_token', '', { maxAge: 0, path: '/' })
  res.cookies.set('perfil', '', { maxAge: 0, path: '/' })
  return res
}
