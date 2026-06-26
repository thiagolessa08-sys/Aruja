import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, SETOR_LABEL, SETORES_OCULTOS } from '@/lib/contribuinte-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [anoRows, sitRows, devRows, vincRows] = await Promise.all([
      agentQuery(`
        SELECT YEAR(dt_inscr) AS ano, ic_pessoa AS p, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY YEAR(dt_inscr), ic_pessoa`, 400),
      agentQuery(`
        SELECT ds_sit_cadast AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY ds_sit_cadast`, 100),
      agentQuery(`
        SELECT ds_setor_devedor AS setor, COUNT(DISTINCT cd_contr) AS n
        FROM ${SCHEMA}.tb_dsod_devedor_contribuinte
        GROUP BY ds_setor_devedor`, 100),
      // Vínculos: flags 0/1 em tb_dsod_contribuinte_pessoa (SUM = nº de contribuintes).
      agentQuery(`
        SELECT SUM(ic_pessoa_contribuinte_mobiliario) AS mob, SUM(ic_pessoa_proprietario) AS prop,
          SUM(ic_pessoa_itbi) AS itbi, SUM(ic_pessoa_socio) AS socio,
          SUM(ic_tomador_servico) AS tomador, SUM(ic_pessoa_responsavel_tributario) AS resp
        FROM ${SCHEMA}.tb_dsod_contribuinte_pessoa`, 10),
    ])

    // Novos por ano (PF × PJ) — últimos anos
    const porAno = new Map<number, { pf: number; pj: number }>()
    let pfTotal = 0, pjTotal = 0
    for (const r of anoRows.rows) {
      const ano = Number(r[0])
      const p = String(r[1] ?? '').trim()
      const n = Number(r[2]) || 0
      if (p === 'F') pfTotal += n
      if (p === 'J') pjTotal += n
      if (!(ano >= 2010 && ano <= 2030)) continue
      const cur = porAno.get(ano) ?? { pf: 0, pj: 0 }
      if (p === 'F') cur.pf += n
      if (p === 'J') cur.pj += n
      porAno.set(ano, cur)
    }
    const anosOrd = Array.from(porAno.keys()).sort((a, b) => a - b).slice(-9)
    const novosPorAno = anosOrd.map(ano => {
      const v = porAno.get(ano)!
      return { ano, pf: v.pf, pj: v.pj }
    })
    const evolucao = anosOrd.slice().reverse().map(ano => {
      const v = porAno.get(ano)!
      const tot = v.pf + v.pj
      return { ano, novos: tot, pf: v.pf, pj: v.pj, pctPj: tot ? (v.pj / tot) * 100 : 0 }
    })

    // Situação cadastral (consolidada)
    let ativo = 0, cadastro = 0, semInfo = 0, outros = 0
    for (const r of sitRows.rows) {
      const sit = String(r[0] ?? '').trim()
      const n = Number(r[1]) || 0
      if (sit === 'Ativo') ativo += n
      else if (sit === 'Cadastro') cadastro += n
      else if (sit === '') semInfo += n
      else outros += n
    }
    const totSit = ativo + cadastro + semInfo + outros || 1
    const situacao = [
      { label: 'Ativo', n: ativo, pct: (ativo / totSit) * 100 },
      { label: 'Em cadastramento', n: cadastro, pct: (cadastro / totSit) * 100 },
      { label: 'Sem informação', n: semInfo + outros, pct: ((semInfo + outros) / totSit) * 100 },
    ]

    // Devedores por setor (distinct), excluindo setores ocultos
    const devedores = devRows.rows
      .map(r => ({ setor: String(r[0] ?? '').trim(), n: Number(r[1]) || 0 }))
      .filter(d => d.setor && !SETORES_OCULTOS.has(d.setor))
      .map(d => ({ setor: d.setor, label: SETOR_LABEL[d.setor] ?? d.setor, n: d.n }))
      .sort((a, b) => b.n - a.n)

    // Vínculos do contribuinte (flags 0/1)
    const v = vincRows.rows[0] ?? []
    const num = (x: unknown) => Number(x) || 0
    const vinculos = [
      { label: 'Mobiliário (empresa)', n: num(v[0]) },
      { label: 'Proprietário de imóvel', n: num(v[1]) },
      { label: 'Transmissão (ITBI)', n: num(v[2]) },
      { label: 'Sócio', n: num(v[3]) },
      { label: 'Tomador de serviço', n: num(v[4]) },
      { label: 'Responsável tributário', n: num(v[5]) },
    ].filter(x => x.n > 0).sort((a, b) => b.n - a.n)

    // Score de adimplência: em cobrança acumulada × adimplente
    const totalBase = pfTotal + pjTotal
    const emCobranca = devRows.rows
      .filter(r => String(r[0] ?? '').trim() === 'CobrancaAcumulada')
      .reduce((a, r) => a + (Number(r[1]) || 0), 0)
    const score = {
      adimplente: Math.max(0, totalBase - emCobranca),
      emCobranca,
      total: totalBase,
      pctAdimplente: totalBase ? ((totalBase - emCobranca) / totalBase) * 100 : 0,
    }

    return NextResponse.json({
      novosPorAno,
      pfpj: { f: pfTotal, j: pjTotal },
      situacao,
      devedores,
      vinculos,
      score,
      evolucao,
      pessoaFiltro: f.pessoa || null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
