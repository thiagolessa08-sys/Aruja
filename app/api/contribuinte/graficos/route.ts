import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, SETOR_LABEL, SETORES_OCULTOS, dataAtualizacaoContribuinte, scoreContribuinte, contribuinteBase } from '@/lib/contribuinte-filtros'

const SCHEMA = 'pref_aruja_sp'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [base, sitRows, devRows, vincRows, dataAtualizacao, score] = await Promise.all([
      contribuinteBase(),
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
          SUM(ic_tomador_servico) AS tomador, SUM(ic_pessoa_responsavel_tributario) AS resp,
          SUM(ic_pessoa_compromissario) AS comp, SUM(ic_pessoa_posseiro) AS poss
        FROM ${SCHEMA}.tb_dsod_contribuinte_pessoa`, 10),
      dataAtualizacaoContribuinte(),
      scoreContribuinte(),
    ])

    // Novos por ano (PF × PJ) — últimos anos. pfTotal/pjTotal vêm da mesma fonte
    // compartilhada dos KPIs/Insights, para o total da base bater em toda a tela.
    const { pfTot: pfTotal, pjTot: pjTotal, novosPorAno: porAnoMap } = base
    const anosOrd = Array.from(porAnoMap.keys()).sort((a, b) => a - b).slice(-9)
    const novosPorAno = anosOrd.map(ano => {
      const v = porAnoMap.get(ano)!
      return { ano, pf: v.f, pj: v.j }
    })
    const evolucao = anosOrd.slice().reverse().map(ano => {
      const v = porAnoMap.get(ano)!
      const tot = v.f + v.j
      return { ano, novos: tot, pf: v.f, pj: v.j, pctPj: tot ? (v.j / tot) * 100 : 0 }
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

    // Devedores por setor (distinct), excluindo setores ocultos. Se ano/mes/pessoa
    // estiverem selecionados, refaz a contagem restringindo aos devedores com guia no
    // exercício/mês informado (ponte g.cd_devedor = dc.cd_devedor) e/ou ao tipo de pessoa
    // (join tb_dsod_contribuinte). Sem filtro, mantém a consulta original (join com guias
    // reduziria a contagem de alguns setores mesmo sem filtro real — checado via agente).
    let devFiltradoRows = devRows
    if (f.ano || f.mes || f.pessoa) {
      const cond: string[] = []
      let joins = ''
      if (f.pessoa) {
        joins += ` JOIN ${SCHEMA}.tb_dsod_contribuinte c ON c.cd_contr = dc.cd_contr`
        cond.push(`c.ic_pessoa = '${f.pessoa}'`)
      }
      if (f.ano || f.mes) {
        joins += ` JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_devedor = dc.cd_devedor`
        if (f.ano) cond.push(`g.no_exercicio_lancamento = ${f.ano}`)
        if (f.mes) {
          joins += ` JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia`
          cond.push(`MONTH(p.dt_vencimento) <= ${f.mes}`)
        }
      }
      devFiltradoRows = await agentQuery(`
        SELECT dc.ds_setor_devedor AS setor, COUNT(DISTINCT dc.cd_contr) AS n
        FROM ${SCHEMA}.tb_dsod_devedor_contribuinte dc
        ${joins}
        WHERE ${cond.join(' AND ')}
        GROUP BY dc.ds_setor_devedor`, 100)
    }
    const devedores = devFiltradoRows.rows
      .map(r => ({ setor: String(r[0] ?? '').trim(), n: Number(r[1]) || 0 }))
      .filter(d => d.setor && !SETORES_OCULTOS.has(d.setor))
      .map(d => ({ setor: d.setor, label: SETOR_LABEL[d.setor] ?? d.setor, n: d.n }))
      .sort((a, b) => b.n - a.n)

    // Vínculos do contribuinte (flags 0/1)
    const v = vincRows.rows[0] ?? []
    const num = (x: unknown) => Number(x) || 0
    const vinculos = [
      { campo: 'ic_pessoa_contribuinte_mobiliario', label: 'Mobiliário (empresa)', n: num(v[0]) },
      { campo: 'ic_pessoa_proprietario', label: 'Proprietário de imóvel', n: num(v[1]) },
      { campo: 'ic_pessoa_itbi', label: 'Transmissão (ITBI)', n: num(v[2]) },
      { campo: 'ic_pessoa_socio', label: 'Sócio', n: num(v[3]) },
      { campo: 'ic_tomador_servico', label: 'Tomador de serviço', n: num(v[4]) },
      { campo: 'ic_pessoa_responsavel_tributario', label: 'Responsável tributário', n: num(v[5]) },
    ].filter(x => x.n > 0).sort((a, b) => b.n - a.n)

    // Qualificação do Contribuinte frente ao imóvel/tributo (mesma origem dos vínculos).
    const qualificacoes = [
      { campo: 'ic_pessoa_proprietario', label: 'Proprietários dos Imóveis', n: num(v[1]) },
      { campo: 'ic_pessoa_compromissario', label: 'Compromissários', n: num(v[6]) },
      { campo: 'ic_pessoa_posseiro', label: 'Posseiros', n: num(v[7]) },
      { campo: 'ic_pessoa_responsavel_tributario', label: 'Responsáveis Tributários', n: num(v[5]) },
      { campo: 'ic_pessoa_contribuinte_mobiliario', label: 'Empresários', n: num(v[0]) },
    ].filter(x => x.n > 0).sort((a, b) => b.n - a.n)

    return NextResponse.json({
      novosPorAno,
      pfpj: { f: pfTotal, j: pjTotal },
      situacao,
      devedores,
      vinculos,
      qualificacoes,
      score,
      evolucao,
      pessoaFiltro: f.pessoa || null,
      dataAtualizacao,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
