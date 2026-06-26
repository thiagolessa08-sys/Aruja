// Cache simples em memória (processo) para resultados de queries pesadas do motor.
// Railway roda um servidor Node persistente → o cache sobrevive entre requisições.
// Não usar para dados que precisam ser em tempo real; aqui são posições agregadas
// que mudam devagar (TTL de minutos é aceitável).

interface Entry { value: unknown; exp: number }
const store = new Map<string, Entry>()

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  const now = Date.now()
  if (hit && hit.exp > now) return hit.value as T
  const value = await fn()
  store.set(key, { value, exp: now + ttlMs })
  return value
}

export function invalidate(prefix?: string) {
  if (!prefix) { store.clear(); return }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
}

export const TTL_15MIN = 15 * 60 * 1000
