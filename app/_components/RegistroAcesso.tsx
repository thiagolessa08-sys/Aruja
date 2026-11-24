'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Avisa o servidor que esta aba está com o painel aberto, para o log de acesso (logs/*.txt).
// - ACESSO a cada troca de página
// - HEARTBEAT a cada 60s enquanto a aba estiver aberta
// - SAIDA quando a aba é fechada
const INTERVALO_MS = 60 * 1000

function idDaAba(): string {
  try {
    let id = sessionStorage.getItem('aba_id')
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      sessionStorage.setItem('aba_id', id)
    }
    return id
  } catch {
    return 'sem-id'
  }
}

function enviar(tipo: 'ACESSO' | 'HEARTBEAT' | 'SAIDA', pagina: string) {
  const corpo = JSON.stringify({ tipo, aba: idDaAba(), pagina })
  if (tipo === 'SAIDA' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/acesso', corpo)
    return
  }
  fetch('/api/acesso', { method: 'POST', body: corpo, keepalive: true }).catch(() => {
    /* log de acesso nunca pode atrapalhar o painel */
  })
}

export default function RegistroAcesso() {
  const pathname = usePathname()
  const paginaRef = useRef(pathname)
  const ativo = !!pathname && pathname !== '/login'

  useEffect(() => {
    paginaRef.current = pathname
    if (ativo) enviar('ACESSO', pathname)
  }, [pathname, ativo])

  useEffect(() => {
    if (!ativo) return
    const t = setInterval(() => enviar('HEARTBEAT', paginaRef.current), INTERVALO_MS)
    const sair = () => enviar('SAIDA', paginaRef.current)
    window.addEventListener('pagehide', sair)
    return () => {
      clearInterval(t)
      window.removeEventListener('pagehide', sair)
    }
  }, [ativo])

  return null
}
