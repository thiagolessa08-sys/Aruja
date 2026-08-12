import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { lerFiltros, contribuinteBase, contribuinteEstoque, devedoresPorSetor } from '@/lib/contribuinte-filtros'

const fmtInt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const semP = !f.pessoa

    // Mesma fonte de dados do /api/contribuinte/kpis — garante que o total mostrado
    // aqui é sempre igual ao do KPI "Total Contribuintes", já respeitando Ano/Mês/Pessoa
    // (antes esta rota sempre somava a base inteira, ignorando os filtros da tela).
    const [base, estoque, setores] = await Promise.all([
      contribuinteBase(),
      contribuinteEstoque(f.ano, f.mes),
      devedoresPorSetor(f),
    ])
    const { novosPorAno } = base
    const total = semP ? estoque.totalAll : f.pessoa === 'F' ? estoque.pfTot : estoque.pjTot
    const { pfTot: pf, pjTot: pj } = estoque
    const cobranca = setores.find(s => s.setor === 'CobrancaAcumulada')?.n ?? 0

    const anoMax = Math.max(...Array.from(novosPorAno.keys()), 0)
    const anoRef = f.ano || anoMax
    const novA = novosPorAno.get(anoRef) ?? { f: 0, j: 0, t: 0 }
    const novP = novosPorAno.get(anoRef - 1) ?? { f: 0, j: 0, t: 0 }
    const novosRef = f.pessoa === 'F' ? novA.f : f.pessoa === 'J' ? novA.j : novA.t
    const novosPrev = f.pessoa === 'F' ? novP.f : f.pessoa === 'J' ? novP.j : novP.t
    const varNovos = novosPrev ? ((novosRef - novosPrev) / novosPrev) * 100 : 0

    const insights = [
      semP
        ? `A base reúne ${fmtInt(total)} contribuintes — ${fmtInt(pf)} PF (${fmtPct(total ? pf / total * 100 : 0)}) e ${fmtInt(pj)} PJ (${fmtPct(total ? pj / total * 100 : 0)}).`
        : `A base filtrada reúne ${fmtInt(total)} contribuintes ${f.pessoa === 'F' ? 'Pessoa Física' : 'Pessoa Jurídica'}.`,
      novosPrev
        ? `${fmtInt(novosRef)} novos cadastros em ${anoRef} (${varNovos >= 0 ? '+' : ''}${fmtPct(varNovos)} vs ${anoRef - 1}).`
        : `${fmtInt(novosRef)} novos cadastros em ${anoRef}.`,
      `${fmtInt(cobranca)} contribuintes (${fmtPct(total ? cobranca / total * 100 : 0)} da base) constam em cobrança acumulada.`,
    ]

    return NextResponse.json({ insights })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
