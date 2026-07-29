'use client'

import { useState, useEffect } from 'react'

// Nome exibido na saudação ("Olá, <nome>!") — o do usuário efetivamente logado
// (JWT via /api/auth/me), não um valor fixo. Default vazio para o render inicial/SSR.
export function useSaudacaoNome(): string {
  const [nome, setNome] = useState('')
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.nome) setNome(d.nome) }).catch(() => {})
  }, [])
  return nome
}
