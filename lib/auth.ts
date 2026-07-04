import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import type { Perfil } from '@/lib/perfil'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me'

export interface JWTPayload {
  userId: number
  email: string
  nome: string
  role: Perfil
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export function getSession(): JWTPayload | null {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('auth_token')?.value
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}
