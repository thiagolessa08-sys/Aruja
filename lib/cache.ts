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

// Dado da origem é carregado 1x/dia → cache vive o dia todo; o warmup invalida e
// reabastece nos horários agendados (8h e 12h). Ver lib/warmup.ts.
export const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h
export const TTL_15MIN = CACHE_TTL // alias retrocompatível (nome legado)

// Pra valores que precisam refletir a carga do dia mais perto do real (ex.: "dados
// atualizados em"), sem depender só da janela de warmup (8h/12h) — a carga de origem foi
// medida caindo às 21h, então de 21h até o warmup das 8h o rótulo ficaria "atrasado" um dia
// inteiro se usasse o TTL_15MIN de 24h. 30min limita essa janela sem virar consulta a cada
// requisição (MAX(dt_alter_ods) em tb_dsod_guias mede ~1,9s sobre 7,2M linhas).
export const TTL_30MIN = 30 * 60 * 1000
