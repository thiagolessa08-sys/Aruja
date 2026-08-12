import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  lerFiltros, SETOR_LABEL, SETORES_OCULTOS, dataAtualizacaoContribuinte, scoreContribuinte,
  contribuinteBase, contribuinteEstoque, devedoresPorSetor, vinculosContribuinte,
} from '@/lib/contribuinte-filtros'

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)

    const [base, estoque, setores, vinc, dataAtualizacao, score] = await Promise.all([
      contribuinteBase(),
      contribuinteEstoque(f.ano, f.mes),
      devedoresPorSetor(f),
      vinculosContribuinte(f),
      dataAtualizacaoContribuinte(),
      scoreContribuinte(f.pessoa),
    ])

    // Novos por ano (PF × PJ) — sempre multi-ano (é a própria natureza do gráfico), mas
    // respeita o filtro de Pessoa zerando o lado não selecionado.
    const { novosPorAno: porAnoMap } = base
    const anosOrd = Array.from(porAnoMap.keys()).sort((a, b) => a - b).slice(-9)
    const zeraNaoSelecionado = (pf: number, pj: number) => ({
      pf: f.pessoa === 'J' ? 0 : pf,
      pj: f.pessoa === 'F' ? 0 : pj,
    })
    const novosPorAno = anosOrd.map(ano => {
      const v = porAnoMap.get(ano)!
      return { ano, ...zeraNaoSelecionado(v.f, v.j) }
    })
    const evolucao = anosOrd.slice().reverse().map(ano => {
      const v = porAnoMap.get(ano)!
      const { pf, pj } = zeraNaoSelecionado(v.f, v.j)
      const tot = pf + pj
      return { ano, novos: tot, pf, pj, pctPj: tot ? (pj / tot) * 100 : 0 }
    })

    // PF × PJ (donut) — estoque acumulado até Ano/Mês (ou base toda, sem filtro), com o
    // lado não selecionado de Pessoa zerado.
    const { pf: pfTotal, pj: pjTotal } = zeraNaoSelecionado(estoque.pfTot, estoque.pjTot)

    // Situação cadastral (consolidada) — mesmo estoque acima, quebrado por situação.
    const situacaoPessoa = (sit: string) => {
      const row = estoque.porSituacao.get(sit) ?? { f: 0, j: 0 }
      return f.pessoa === 'F' ? row.f : f.pessoa === 'J' ? row.j : row.f + row.j
    }
    const ativo = situacaoPessoa('Ativo')
    const cadastro = situacaoPessoa('Cadastro')
    const semInfoDireto = situacaoPessoa('')
    const outrosSit = Array.from(estoque.porSituacao.keys()).filter(s => s !== 'Ativo' && s !== 'Cadastro' && s !== '')
    const outros = outrosSit.reduce((s, sit) => s + situacaoPessoa(sit), 0)
    const totSit = ativo + cadastro + semInfoDireto + outros || 1
    const situacao = [
      { label: 'Ativo', n: ativo, pct: (ativo / totSit) * 100 },
      { label: 'Em cadastramento', n: cadastro, pct: (cadastro / totSit) * 100 },
      { label: 'Sem informação', n: semInfoDireto + outros, pct: ((semInfoDireto + outros) / totSit) * 100 },
    ]

    // Devedores por setor (distinct), excluindo setores ocultos. Já respeita
    // ano/mês/pessoa via devedoresPorSetor (mesma fonte do KPI "Em Cobrança").
    const devedores = setores
      .filter(d => d.setor && !SETORES_OCULTOS.has(d.setor))
      .map(d => ({ setor: d.setor, label: SETOR_LABEL[d.setor] ?? d.setor, n: d.n }))
      .sort((a, b) => b.n - a.n)

    // Vínculos do contribuinte (flags 0/1) — já respeita ano/mês/pessoa.
    const vinculos = [
      { campo: 'ic_pessoa_contribuinte_mobiliario', label: 'Mobiliário (empresa)', n: vinc.mob },
      { campo: 'ic_pessoa_proprietario', label: 'Proprietário de imóvel', n: vinc.prop },
      { campo: 'ic_pessoa_itbi', label: 'Transmissão (ITBI)', n: vinc.itbi },
      { campo: 'ic_pessoa_socio', label: 'Sócio', n: vinc.socio },
      { campo: 'ic_tomador_servico', label: 'Tomador de serviço', n: vinc.tomador },
      { campo: 'ic_pessoa_responsavel_tributario', label: 'Responsável tributário', n: vinc.resp },
    ].filter(x => x.n > 0).sort((a, b) => b.n - a.n)

    // Qualificação do Contribuinte frente ao imóvel/tributo (mesma origem dos vínculos).
    const qualificacoes = [
      { campo: 'ic_pessoa_proprietario', label: 'Proprietários dos Imóveis', n: vinc.prop },
      { campo: 'ic_pessoa_compromissario', label: 'Compromissários', n: vinc.comp },
      { campo: 'ic_pessoa_posseiro', label: 'Posseiros', n: vinc.poss },
      { campo: 'ic_pessoa_responsavel_tributario', label: 'Responsáveis Tributários', n: vinc.resp },
      { campo: 'ic_pessoa_contribuinte_mobiliario', label: 'Empresários', n: vinc.mob },
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
