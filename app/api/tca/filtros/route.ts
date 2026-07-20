import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'

// Exercícios disponíveis de TCA (cd_tributo = 67), para o seletor da toolbar.
export async function GET() {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const anos = await cached('tcaAnos', TTL_15MIN, async () => {
      const r = await agentQuery(`SELECT DISTINCT no_exercicio_lancamento FROM ${S}.tb_dsod_guias WHERE cd_tributo = 67`, 100)
      return r.rows.map(x => Number(x[0])).filter(a => a >= 2015 && a <= 2035).sort((a, b) => b - a)
    })
    return NextResponse.json({ anos })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
