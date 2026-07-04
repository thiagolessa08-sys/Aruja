import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { homeDoPerfil } from '@/lib/perfil'

export default function Home() {
  const session = getSession()
  if (!session) redirect('/login')
  redirect(homeDoPerfil(session.role))
}
