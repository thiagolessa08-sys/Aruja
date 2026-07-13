import { serieTributo, rankingTributos, bucketsIptu, bucketsIptuMes, qtdImoveisIptu, formaPagamentoIptu, dataAtualizacaoIptu, serieMensalIptu } from '@/lib/tributo-engine'
import { bairrosIptu, rankingIptu, resumoIptu } from '@/lib/iptu-agg'
import { resumoDivida } from '@/lib/divida-engine'
import { resumoCobranca } from '@/lib/cobranca-engine'
import { invalidate } from '@/lib/cache'
import type { GrupoTributo } from '@/lib/tributos'

const GRUPOS: GrupoTributo[] = ['iptu', 'itbi', 'isscc', 'iss', 'tfe', 'tfhs', 'outros']

// Roda as consultas pesadas SEQUENCIALMENTE para não sobrecarregar o túnel/agente.
// Cada falha é engolida — warmup é best-effort. IPTU primeiro (tela mais pesada/acessada).
async function runAll() {
  const anoAtual = new Date().getFullYear()

  // --- IPTU: Visão Geral ---
  try { await bucketsIptu() } catch { /* ignora */ }
  try { await bucketsIptuMes(new Date().getMonth() + 1) } catch { /* ignora */ } // YTD dos cards/evolução
  try { await dataAtualizacaoIptu() } catch { /* ignora */ }
  try { await serieMensalIptu(anoAtual) } catch { /* ignora */ }
  try { await serieMensalIptu(anoAtual - 1) } catch { /* ignora */ }
  try { await qtdImoveisIptu() } catch { /* ignora */ }
  try { await formaPagamentoIptu() } catch { /* ignora */ }

  // --- IPTU: seções pesadas do ano atual (Resumo, Bairros, Rankings) ---
  try { await resumoIptu(anoAtual, null) } catch { /* ignora */ }
  try { await bairrosIptu({ ano: anoAtual, espolio: false, semNumero: false, bairro: null }) } catch { /* ignora */ }
  for (const tipo of ['imovel', 'proprietario'] as const) {
    for (const met of ['lancado', 'arrecadado', 'emAberto', 'inadimplencia'] as const) {
      try { await rankingIptu(tipo, anoAtual, met, null) } catch { /* ignora */ }
    }
  }

  // --- Demais tributos e telas ---
  for (const g of GRUPOS) {
    try { await serieTributo(g) } catch { /* ignora */ }
  }
  try { await rankingTributos(false, 2025) } catch { /* ignora */ }
  try { await resumoDivida() } catch { /* ignora */ }
  try { await resumoCobranca(2025) } catch { /* ignora */ }
}

// Hora atual no fuso de Arujá (America/Sao_Paulo), independente do fuso do servidor.
function horaAruja(): { h: number; ymd: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => f.find(p => p.type === t)?.value ?? ''
  let h = Number(get('hour')); if (h === 24) h = 0
  return { h, ymd: `${get('year')}-${get('month')}-${get('day')}` }
}

// Horários de re-aquecimento (carga diária cai de madrugada; garantimos 8h e 12h).
const HORAS_REAQUECER = [8, 12]

let iniciado = false

export function warmup() {
  if (iniciado) return
  iniciado = true

  // Primeira carga ~3s após o boot (deixa o servidor subir antes).
  setTimeout(() => { void runAll() }, 3000)

  // Sentinela: a cada minuto verifica se bateu 8h ou 12h (Arujá). Ao bater, invalida
  // o cache e reabastece — pega a carga diária nova. Trava por hora para não repetir.
  let ultima = ''
  setInterval(() => {
    const { h, ymd } = horaAruja()
    if (!HORAS_REAQUECER.includes(h)) return
    const marca = `${ymd}-${h}`
    if (marca === ultima) return
    ultima = marca
    invalidate()
    void runAll()
  }, 60 * 1000)
}
