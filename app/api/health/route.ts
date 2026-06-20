import { NextResponse } from 'next/server'
import { agentHealth } from '@/lib/agent'

// O healthcheck deve confirmar apenas que o app Next subiu.
// O status do agente externo e informativo e nao bloqueia o deploy.
export async function GET() {
  let agent: unknown = 'offline'
  try {
    agent = await agentHealth()
  } catch (e) {
    agent = { status: 'offline', error: String(e) }
  }
  return NextResponse.json({ status: 'ok', agent })
}
