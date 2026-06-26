// Hook de instrumentação do Next: roda uma vez quando o servidor sobe.
// Usado para pré-aquecer o cache das consultas pesadas do motor, para que as
// telas (TFE, ISSCC, Outros, Dívida, Cobrança...) já abram instantâneas.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { warmup } = await import('@/lib/warmup')
  warmup()
}
