import { serieTributo, rankingTributos, bucketsIptu, qtdImoveisIptu, formaPagamentoIptu, dataAtualizacaoIptu, serieMensalIptu } from '@/lib/tributo-engine'
import { resumoDivida } from '@/lib/divida-engine'
import { resumoCobranca } from '@/lib/cobranca-engine'
import { invalidate } from '@/lib/cache'
import type { GrupoTributo } from '@/lib/tributos'

const GRUPOS: GrupoTributo[] = ['iptu', 'itbi', 'isscc', 'iss', 'tfe', 'tfhs', 'outros']

// Roda as consultas pesadas SEQUENCIALMENTE para não sobrecarregar o túnel/agente.
// Cada falha é engolida — warmup é best-effort. IPTU primeiro (tela mais pesada/acessada).
async function runAll() {
  const anoAtual = new Date().getFullYear()
  // --- IPTU (Visão Geral) primeiro ---
  try { await bucketsIptu() } catch { /* ignora */ }
  try { await dataAtualizacaoIptu() } catch { /* ignora */ }
  try { await serieMensalIptu(anoAtual) } catch { /* ignora */ }
  try { await serieMensalIptu(anoAtual - 1) } catch { /* ignora */ }
  try { await qtdImoveisIptu() } catch { /* ignora */ }
  try { await formaPagamentoIptu() } catch { /* ignora */ }
  // --- Demais tributos e telas ---
  for (const g of GRUPOS) {
    try { await serieTributo(g) } catch { /* ignora */ }
  }
  try { await rankingTributos(false, 2025) } catch { /* ignora */ }
  try { await resumoDivida() } catch { /* ignora */ }
  try { await resumoCobranca(2025) } catch { /* ignora */ }
}

let iniciado = false

export function warmup() {
  if (iniciado) return
  iniciado = true

  // Primeira carga ~3s após o boot (deixa o servidor subir antes).
  setTimeout(() => { void runAll() }, 3000)

  // Re-aquecimento periódico (antes do TTL de 1h expirar): invalida e reabastece.
  setInterval(() => { invalidate(); void runAll() }, 50 * 60 * 1000)
}
