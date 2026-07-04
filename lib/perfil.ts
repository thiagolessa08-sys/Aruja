// Perfis de acesso e regras de rota.
// SEM dependências de Node — pode ser importado no middleware (Edge) e no cliente.

export type Perfil = 'admin' | 'orcamentario' | 'tributario'

// Mundo "orçamentário" (páginas + APIs)
const ROTAS_ORCAMENTO = ['/dashboard', '/api/orcamento', '/api/despesa']

// Infra/compartilhado liberado para todos os perfis
const ROTAS_COMUM = [
  '/chat', '/api/chat', '/catalogo', '/api/catalog', '/api/catalogo',
  '/api/schema', '/api/auth', '/api/health', '/api/db', '/login',
]

const bate = (lista: string[], p: string) => lista.some(r => p === r || p.startsWith(r + '/'))

export function ehRotaOrcamento(pathname: string): boolean {
  return bate(ROTAS_ORCAMENTO, pathname)
}
export function ehRotaComum(pathname: string): boolean {
  return bate(ROTAS_COMUM, pathname)
}

// Regra central de acesso por perfil
export function acessoPermitido(perfil: Perfil, pathname: string): boolean {
  if (perfil === 'admin') return true
  if (perfil === 'tributario') return !ehRotaOrcamento(pathname)               // tudo, menos orçamento
  if (perfil === 'orcamentario') return ehRotaOrcamento(pathname) || ehRotaComum(pathname) // só orçamento + comum
  return false
}

// Página inicial de cada perfil
export function homeDoPerfil(perfil: Perfil): string {
  return perfil === 'tributario' ? '/contribuinte' : '/dashboard'
}

// Visibilidade das abas do topo
export function abaVisivel(perfil: Perfil, id: string): boolean {
  if (perfil === 'admin') return true
  if (id === 'chat') return true
  if (perfil === 'orcamentario') return id === 'orcamento'
  return id !== 'orcamento' // tributario
}

// Lê o perfil do cookie legível (uso no cliente)
export function lerPerfilCookie(): Perfil {
  if (typeof document === 'undefined') return 'admin'
  const m = document.cookie.match(/(?:^|;\s*)perfil=([^;]+)/)
  const v = m ? decodeURIComponent(m[1]) : ''
  return v === 'orcamentario' || v === 'tributario' || v === 'admin' ? v : 'admin'
}
