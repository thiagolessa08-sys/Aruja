'use client'

import { useState, useEffect } from 'react'

// Nome exibido na saudação ("Olá, <nome>!"), conforme o perfil do usuário logado.
// Lê o cookie não-sensível `perfil` (definido no login). Orçamentário → "Prefeito";
// demais perfis → "Roberta". Default 'Roberta' para o render inicial/SSR.
export function useSaudacaoNome(): string {
  const [nome, setNome] = useState('Roberta')
  useEffect(() => {
    const perfil = document.cookie.split('; ').find(c => c.startsWith('perfil='))?.split('=')[1]
    setNome(perfil === 'orcamentario' ? 'Prefeito' : 'Roberta')
  }, [])
  return nome
}
