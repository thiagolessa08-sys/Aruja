// Log de acesso em arquivo texto (só roda no servidor Node — usa fs).
//
// Dois arquivos em ACCESS_LOG_DIR (padrão ./logs):
//  - acessos.txt        → histórico, uma linha por evento (LOGIN, LOGIN_FALHA, LOGOUT, ACESSO, SAIDA)
//  - sessoes-ativas.txt → retrato atual, reescrito a cada evento/heartbeat: quantas abas estão
//                         abertas no painel agora, quem são e qual foi o último acesso.
//
// "Sessão" = uma aba do navegador com o painel aberto (id gerado no cliente, sessionStorage).
// Ela conta como ativa enquanto mandar heartbeat (a cada 60s); some após JANELA_ATIVA_MS sem sinal.
//
// Atenção: no Railway o disco do container é apagado a cada deploy. Para o histórico sobreviver,
// anexe um Volume ao serviço — os arquivos passam a ir para <volume>/logs sem configurar nada.

import { promises as fs } from 'fs'
import path from 'path'

export const JANELA_ATIVA_MS = 3 * 60 * 1000

export type TipoEvento = 'LOGIN' | 'LOGIN_FALHA' | 'LOGOUT' | 'ACESSO' | 'SAIDA' | 'HEARTBEAT'

export interface InfoUsuario {
  nome: string
  email: string
  role: string
}

interface SessaoAtiva extends InfoUsuario {
  aba: string
  pagina: string
  ip: string
  inicio: number
  ultimoSinal: number
}

interface Estado {
  sessoes: Map<string, SessaoAtiva>
  ultimoAcesso: { quando: number; nome: string; pagina: string } | null
  carregouUltimo: boolean
  fila: Promise<void>
}

// Sobrevive ao hot-reload do dev e é compartilhado entre rotas no mesmo processo.
const g = globalThis as unknown as { __acessoLog?: Estado }
const estado: Estado = (g.__acessoLog ??= {
  sessoes: new Map(),
  ultimoAcesso: null,
  carregouUltimo: false,
  fila: Promise.resolve(),
})

// Ordem: ACCESS_LOG_DIR explícito → Volume do Railway (RAILWAY_VOLUME_MOUNT_PATH, definido
// automaticamente quando há um Volume anexado ao serviço) → ./logs (efêmero no Railway).
export function dirLogs(): string {
  if (process.env.ACCESS_LOG_DIR) return process.env.ACCESS_LOG_DIR
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'logs')
  return path.join(process.cwd(), 'logs')
}
export const arquivoHistorico = () => path.join(dirLogs(), 'acessos.txt')
export const arquivoSessoes = () => path.join(dirLogs(), 'sessoes-ativas.txt')

// Data/hora de Brasília: "2026-11-24 16:51:02"
export function fmtData(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

const limpa = (s: string) => String(s ?? '').replace(/[\r\n|]+/g, ' ').trim().slice(0, 300)

// Serializa as escritas para não intercalar linhas nem corromper o retrato.
function enfileirar(tarefa: () => Promise<void>): Promise<void> {
  estado.fila = estado.fila.then(tarefa).catch(e => console.error('[acesso-log]', e))
  return estado.fila
}

// Após um restart a memória volta vazia: recupera o "último acesso" da última linha do histórico.
async function carregarUltimoAcesso() {
  if (estado.carregouUltimo) return
  estado.carregouUltimo = true
  try {
    const txt = await fs.readFile(arquivoHistorico(), 'utf8')
    const linhas = txt.trimEnd().split('\n')
    for (let i = linhas.length - 1; i >= 0; i--) {
      const c = linhas[i].split(' | ')
      if (c.length >= 4 && c[1] !== 'LOGIN_FALHA' && c[1] !== 'SAIDA') {
        const quando = Date.parse(c[0].replace(' ', 'T') + '-03:00')
        if (!Number.isNaN(quando)) {
          estado.ultimoAcesso = { quando, nome: c[2], pagina: c[4] || '' }
        }
        break
      }
    }
  } catch {
    /* arquivo ainda não existe */
  }
}

function expirar(agora: number) {
  for (const [k, s] of estado.sessoes) {
    if (agora - s.ultimoSinal > JANELA_ATIVA_MS) estado.sessoes.delete(k)
  }
}

export function sessoesAtivas(): SessaoAtiva[] {
  expirar(Date.now())
  return [...estado.sessoes.values()].sort((a, b) => b.ultimoSinal - a.ultimoSinal)
}

function montarRetrato(agora: number): string {
  const ativas = sessoesAtivas()
  const usuarios = new Set(ativas.map(s => s.email))
  const u = estado.ultimoAcesso
  const linhas = [
    'PAINEL PREFEITURA ARUJÁ — SESSÕES ATIVAS',
    `Atualizado em:      ${fmtData(agora)}`,
    `Sessões abertas:    ${ativas.length} (abas com o painel aberto nos últimos ${JANELA_ATIVA_MS / 60000} min)`,
    `Usuários distintos: ${usuarios.size}`,
    `Último acesso:      ${u ? `${fmtData(u.quando)} — ${u.nome} — ${u.pagina}` : 'nenhum registrado'}`,
    `Gravando em:        ${dirLogs()} (${process.env.ACCESS_LOG_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'persistente' : 'TEMPORÁRIO — apagado a cada deploy'})`,
    '',
  ]
  if (ativas.length) {
    linhas.push('Início da sessão    | Último sinal        | Usuário | Perfil | Página atual | IP | Aba')
    for (const s of ativas) {
      linhas.push([fmtData(s.inicio), fmtData(s.ultimoSinal), `${s.nome} (${s.email})`, s.role, s.pagina, s.ip, s.aba].join(' | '))
    }
  }
  return linhas.join('\n') + '\n'
}

export interface Evento {
  tipo: TipoEvento
  usuario: InfoUsuario | null
  aba?: string
  pagina?: string
  ip?: string
}

export async function registrarEvento(ev: Evento): Promise<void> {
  await carregarUltimoAcesso()
  const agora = Date.now()
  const aba = limpa(ev.aba || '').slice(0, 40)
  const pagina = limpa(ev.pagina || '')
  const ip = limpa(ev.ip || '')
  const u = ev.usuario

  // Atualiza o estado em memória
  if (u && aba) {
    const chave = `${u.email}#${aba}`
    if (ev.tipo === 'SAIDA' || ev.tipo === 'LOGOUT') {
      estado.sessoes.delete(chave)
    } else if (ev.tipo === 'ACESSO' || ev.tipo === 'HEARTBEAT' || ev.tipo === 'LOGIN') {
      const atual = estado.sessoes.get(chave)
      estado.sessoes.set(chave, {
        nome: u.nome, email: u.email, role: u.role, aba, ip,
        pagina: pagina || atual?.pagina || '',
        inicio: atual?.inicio ?? agora,
        ultimoSinal: agora,
      })
    }
  }
  if (u && !aba && ev.tipo === 'LOGOUT') {
    // logout sem id de aba: encerra todas as sessões do usuário
    for (const [k, s] of estado.sessoes) if (s.email === u.email) estado.sessoes.delete(k)
  }
  if (u && (ev.tipo === 'ACESSO' || ev.tipo === 'LOGIN' || ev.tipo === 'HEARTBEAT')) {
    estado.ultimoAcesso = { quando: agora, nome: u.nome, pagina: pagina || estado.ultimoAcesso?.pagina || '' }
  }

  const linhaHistorico = ev.tipo === 'HEARTBEAT'
    ? null // heartbeat só mantém a sessão viva; não polui o histórico
    : [
        fmtData(agora),
        ev.tipo,
        u ? limpa(`${u.nome} (${u.email})`) : '-',
        u ? limpa(u.role) : '-',
        pagina || '-',
        `ip=${ip || '-'}`,
        `aba=${aba || '-'}`,
      ].join(' | ') + '\n'

  await enfileirar(async () => {
    await fs.mkdir(dirLogs(), { recursive: true })
    if (linhaHistorico) await fs.appendFile(arquivoHistorico(), linhaHistorico, 'utf8')
    await fs.writeFile(arquivoSessoes(), montarRetrato(agora), 'utf8')
  })
}

export async function lerArquivos(): Promise<{ sessoes: string; historico: string }> {
  await carregarUltimoAcesso()
  // reescreve o retrato para refletir expirações desde o último sinal
  await enfileirar(async () => {
    await fs.mkdir(dirLogs(), { recursive: true })
    await fs.writeFile(arquivoSessoes(), montarRetrato(Date.now()), 'utf8')
  })
  const ler = (f: string) => fs.readFile(f, 'utf8').catch(() => '')
  return { sessoes: await ler(arquivoSessoes()), historico: await ler(arquivoHistorico()) }
}

export function ipDaRequisicao(headers: Headers): string {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || headers.get('x-real-ip') || ''
}
