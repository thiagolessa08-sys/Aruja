// Filtros da tela de Contribuinte (tabela flat tb_dsod_contribuinte)
// Restrição IQ: nada de literal de texto no WHERE → GROUP BY + filtro em JS.

import { agentQuery } from './agent'
import { cached, TTL_15MIN } from './cache'

const SCHEMA = 'pref_aruja_sp'

// Data de atualização dos dados = MAX(dt_alter_ods) da base de contribuintes.
export async function dataAtualizacaoContribuinte(): Promise<string | null> {
  return cached('dataAtualizContribuinte', TTL_15MIN, async () => {
    const r = await agentQuery(`SELECT MAX(dt_alter_ods) FROM ${SCHEMA}.tb_dsod_contribuinte`, 1)
    const v = r.rows[0]?.[0]
    if (!v) return null
    return String(v).slice(0, 10) // 'YYYY-MM-DD'
  })
}

export type Banda = 'A' | 'B' | 'C' | 'D' | 'E'
export interface ScoreBanda { banda: Banda; n: number; media: number }
export interface ScoreContribuinte { bandas: ScoreBanda[]; mediaGeral: number; total: number }

// Score de Contribuinte (CRC) — critérios definidos pela Fazenda:
//  · cadastro completo (CPF/CNPJ, e-mail, telefone, endereço todos preenchidos) = 10 pts
//  · vínculo CCM (ic_pessoa_contribuinte_mobiliario)                            = 45 pts
//  · vínculo com imóvel (proprietário, compromissário ou posseiro)             = 45 pts
//  · cada parcela vencida (tb_dsod_parcela_posicao.vl_saldo > 0 e vencida)      = -1 pt
// Total sempre entre 0 e 100. Faixas: A 80-100, B 60-80, C 40-60, D 20-40, E abaixo de 20.
// Respeita o filtro de Pessoa (F/J) quando informado — Ano/Mês NÃO se aplicam aqui: o
// score reflete o estado ATUAL do contribuinte (parcelas vencidas até hoje), não uma
// posição histórica num exercício passado. Cache de 24h (dado só muda na carga diária).
export async function scoreContribuinte(pessoa: '' | 'F' | 'J' = ''): Promise<ScoreContribuinte> {
  return cached(`scoreContribuinte:${pessoa || 'all'}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT banda, COUNT(*) n, AVG(score) media FROM (
        SELECT CASE WHEN score >= 80 THEN 'A' WHEN score >= 60 THEN 'B' WHEN score >= 40 THEN 'C' WHEN score >= 20 THEN 'D' ELSE 'E' END AS banda, score
        FROM (
          SELECT CASE WHEN raw < 0 THEN 0 WHEN raw > 100 THEN 100 ELSE raw END AS score
          FROM (
            SELECT
              (CASE WHEN c.no_cpf_cnpj IS NOT NULL AND c.no_cpf_cnpj <> '-1'
                    AND c.ds_endereco_email IS NOT NULL AND c.ds_endereco_email <> ''
                    AND tc.telefone IS NOT NULL AND ed.cd_contr IS NOT NULL
                THEN 10 ELSE 0 END)
              + (CASE WHEN cp.ic_pessoa_contribuinte_mobiliario = 1 THEN 45 ELSE 0 END)
              + (CASE WHEN cp.ic_pessoa_proprietario = 1 OR cp.ic_pessoa_compromissario = 1 OR cp.ic_pessoa_posseiro = 1 THEN 45 ELSE 0 END)
              - COALESCE(pv.n, 0) AS raw
            FROM ${SCHEMA}.tb_dsod_contribuinte c
            LEFT JOIN ${SCHEMA}.tb_dsod_contribuinte_pessoa cp ON cp.cd_contr = c.cd_contr
            LEFT JOIN (SELECT cd_contr, MIN(no_tel) telefone FROM ${SCHEMA}.tb_dsod_contribuinte_contato GROUP BY cd_contr) tc ON tc.cd_contr = c.cd_contr
            LEFT JOIN (SELECT DISTINCT cd_contr FROM ${SCHEMA}.tb_dsod_contribuinte_endereco) ed ON ed.cd_contr = c.cd_contr
            LEFT JOIN (
              SELECT g.cd_contr cd_contr, COUNT(*) n
              FROM ${SCHEMA}.tb_dsod_parcela_posicao pp
              JOIN ${SCHEMA}.tb_dsod_parcelas p ON p.cd_parcelas = pp.cd_parcela
              JOIN ${SCHEMA}.tb_dsod_guias g ON g.cd_guia = p.cd_guia
              WHERE pp.vl_saldo > 0 AND p.dt_vencimento < getdate() AND g.cd_contr > 0
              GROUP BY g.cd_contr
            ) pv ON pv.cd_contr = c.cd_contr
            ${pessoa ? `WHERE c.ic_pessoa = '${pessoa}'` : ''}
          ) s1
        ) s2
      ) s3
      GROUP BY banda`, 10)

    const ORDEM: Banda[] = ['A', 'B', 'C', 'D', 'E']
    const map = new Map(r.rows.map(row => [String(row[0]), { n: Number(row[1]) || 0, media: Number(row[2]) || 0 }]))
    const bandas = ORDEM.map(banda => ({ banda, n: map.get(banda)?.n ?? 0, media: map.get(banda)?.media ?? 0 }))
    const total = bandas.reduce((s, b) => s + b.n, 0)
    const mediaGeral = total ? bandas.reduce((s, b) => s + b.media * b.n, 0) / total : 0
    return { bandas, mediaGeral, total }
  })
}

export interface ContribuinteBase {
  totalAll: number; pfTot: number; pjTot: number
  ativosAll: number; ativosF: number; ativosJ: number
  novosPorAno: Map<number, { f: number; j: number; t: number }>
  cobranca: number
}

// Contagens-base da tela de Contribuinte (total/PF/PJ/ativos/novos por ano/em cobrança).
// Compartilhada por /api/contribuinte/kpis e /api/contribuinte/insights — antes cada rota
// rodava sua própria query e podia divergir (cache/timing diferentes entre as duas
// chamadas); com uma única função cacheada, os dois SEMPRE mostram o mesmo total.
export async function contribuinteBase(): Promise<ContribuinteBase> {
  return cached('contribuinteBase', TTL_15MIN, async () => {
    const [sitRows, anoRows, devRows] = await Promise.all([
      agentQuery(`
        SELECT ds_sit_cadast AS sit, ic_pessoa AS p, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY ds_sit_cadast, ic_pessoa`, 200),
      agentQuery(`
        SELECT YEAR(dt_inscr) AS ano, ic_pessoa AS p, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte
        GROUP BY YEAR(dt_inscr), ic_pessoa`, 400),
      agentQuery(`
        SELECT ds_setor_devedor AS setor, COUNT(DISTINCT cd_contr) AS n
        FROM ${SCHEMA}.tb_dsod_devedor_contribuinte
        GROUP BY ds_setor_devedor`, 100),
    ])

    // ic_pessoa fora de F/J (branco/nulo) é ruído de cadastro e fica de fora.
    let totalAll = 0, pfTot = 0, pjTot = 0
    let ativosAll = 0, ativosF = 0, ativosJ = 0
    for (const r of sitRows.rows) {
      const sit = String(r[0] ?? '').trim()
      const p = String(r[1] ?? '').trim()
      const n = Number(r[2]) || 0
      if (p !== 'F' && p !== 'J') continue
      totalAll += n
      if (p === 'F') pfTot += n
      if (p === 'J') pjTot += n
      if (sit === 'Ativo') {
        ativosAll += n
        if (p === 'F') ativosF += n
        if (p === 'J') ativosJ += n
      }
    }

    const novosPorAno = new Map<number, { f: number; j: number; t: number }>()
    for (const r of anoRows.rows) {
      const ano = Number(r[0])
      if (!(ano >= 2010 && ano <= 2030)) continue
      const p = String(r[1] ?? '').trim()
      const n = Number(r[2]) || 0
      const cur = novosPorAno.get(ano) ?? { f: 0, j: 0, t: 0 }
      if (p === 'F') cur.f += n
      if (p === 'J') cur.j += n
      cur.t += n
      novosPorAno.set(ano, cur)
    }

    let cobranca = 0
    for (const r of devRows.rows) {
      if (String(r[0] ?? '').trim() === 'CobrancaAcumulada') cobranca = Number(r[1]) || 0
    }

    return { totalAll, pfTot, pjTot, ativosAll, ativosF, ativosJ, novosPorAno, cobranca }
  })
}

export interface FiltrosContribuinte {
  ano: number | ''      // ano de inscrição (dt_inscr) em destaque / exercício de lançamento (guias)
  pessoa: '' | 'F' | 'J' // tipo de pessoa
  mes: number | ''       // mês (acumulado) — parcelas com vencimento até o mês informado
}

// Condição SQL (numérica, sem literal de texto) de "estoque acumulado até o corte":
// dt_inscr <= fim do ano/mês informado. Sem ano, não filtra (estoque atual = base toda).
// dt_inscr NULL (52,6% da base — ~98,8 mil contribuintes sem data de cadastro registrada)
// SEMPRE conta, em qualquer corte: não dá pra provar que foram cadastrados depois do corte
// só porque a data é desconhecida, e excluí-los faz o total "sumir" pela metade assim que
// qualquer Ano é selecionado (bug real, já aconteceu: 187.706 → 88.933).
function condEstoqueDtInscr(f: Pick<FiltrosContribuinte, 'ano' | 'mes'>, coluna = 'dt_inscr'): string {
  if (!f.ano) return ''
  if (f.mes) return ` AND (${coluna} IS NULL OR YEAR(${coluna}) < ${f.ano} OR (YEAR(${coluna}) = ${f.ano} AND MONTH(${coluna}) <= ${f.mes}))`
  return ` AND (${coluna} IS NULL OR YEAR(${coluna}) <= ${f.ano})`
}

export interface ContribuinteEstoque {
  totalAll: number; pfTot: number; pjTot: number
  porSituacao: Map<string, { f: number; j: number }>
}

// Estoque da base (total/PF/PJ/situação) num corte de tempo: contribuintes com dt_inscr
// até o ano/mês informado. Sem ano, é o estoque atual (equivalente a contribuinteBase(),
// só que também traz a quebra por situação × pessoa). Usada por KPIs e pelos gráficos
// "PF × PJ" e "Situação Cadastral" para que o filtro de Exercício/Mês realmente restrinja
// os números (antes esses três sempre mostravam a base inteira, ignorando o filtro).
export async function contribuinteEstoque(ano: number | '', mes: number | ''): Promise<ContribuinteEstoque> {
  const key = `contribuinteEstoque:${ano || 'all'}:${mes || ''}`
  return cached(key, TTL_15MIN, async () => {
    const where = condEstoqueDtInscr({ ano, mes })
    const r = await agentQuery(`
      SELECT ds_sit_cadast AS sit, ic_pessoa AS p, COUNT(*) AS n
      FROM ${SCHEMA}.tb_dsod_contribuinte
      WHERE 1=1${where}
      GROUP BY ds_sit_cadast, ic_pessoa`, 200)

    let totalAll = 0, pfTot = 0, pjTot = 0
    const porSituacao = new Map<string, { f: number; j: number }>()
    for (const row of r.rows) {
      const sit = String(row[0] ?? '').trim()
      const p = String(row[1] ?? '').trim()
      const n = Number(row[2]) || 0
      if (p !== 'F' && p !== 'J') continue
      totalAll += n
      if (p === 'F') pfTot += n
      if (p === 'J') pjTot += n
      const cur = porSituacao.get(sit) ?? { f: 0, j: 0 }
      if (p === 'F') cur.f += n
      if (p === 'J') cur.j += n
      porSituacao.set(sit, cur)
    }
    return { totalAll, pfTot, pjTot, porSituacao }
  })
}

export interface DevedorSetor { setor: string; n: number }

// Devedores por setor (distinct contribuintes), respeitando ano/mês/pessoa quando
// informados. Compartilhada entre o KPI "Em Cobrança" e o gráfico "Contribuintes com
// Pendência por Setor" — mesma lógica, uma só fonte.
export async function devedoresPorSetor(f: FiltrosContribuinte): Promise<DevedorSetor[]> {
  const key = `contribuinteDevedores:${f.ano || 'all'}:${f.mes || ''}:${f.pessoa || ''}`
  return cached(key, TTL_15MIN, async () => {
    if (!f.ano && !f.mes && !f.pessoa) {
      const r = await agentQuery(`
        SELECT ds_setor_devedor AS setor, COUNT(DISTINCT cd_contr) AS n
        FROM ${SCHEMA}.tb_dsod_devedor_contribuinte
        GROUP BY ds_setor_devedor`, 100)
      return r.rows.map(row => ({ setor: String(row[0] ?? '').trim(), n: Number(row[1]) || 0 }))
    }
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
    const r = await agentQuery(`
      SELECT dc.ds_setor_devedor AS setor, COUNT(DISTINCT dc.cd_contr) AS n
      FROM ${SCHEMA}.tb_dsod_devedor_contribuinte dc
      ${joins}
      WHERE ${cond.join(' AND ')}
      GROUP BY dc.ds_setor_devedor`, 100)
    return r.rows.map(row => ({ setor: String(row[0] ?? '').trim(), n: Number(row[1]) || 0 }))
  })
}

export interface VinculosContribuinte {
  mob: number; prop: number; itbi: number; socio: number; tomador: number; resp: number; comp: number; poss: number
}

// Vínculos/Qualificação do contribuinte (flags 0/1 em tb_dsod_contribuinte_pessoa),
// respeitando ano/mês (estoque até o corte, via dt_inscr) e pessoa quando informados.
export async function vinculosContribuinte(f: FiltrosContribuinte): Promise<VinculosContribuinte> {
  const key = `contribuinteVinculos:${f.ano || 'all'}:${f.mes || ''}:${f.pessoa || ''}`
  return cached(key, TTL_15MIN, async () => {
    const semFiltro = !f.ano && !f.mes && !f.pessoa
    if (semFiltro) {
      const r = await agentQuery(`
        SELECT SUM(ic_pessoa_contribuinte_mobiliario) AS mob, SUM(ic_pessoa_proprietario) AS prop,
          SUM(ic_pessoa_itbi) AS itbi, SUM(ic_pessoa_socio) AS socio,
          SUM(ic_tomador_servico) AS tomador, SUM(ic_pessoa_responsavel_tributario) AS resp,
          SUM(ic_pessoa_compromissario) AS comp, SUM(ic_pessoa_posseiro) AS poss
        FROM ${SCHEMA}.tb_dsod_contribuinte_pessoa`, 10)
      const v = r.rows[0] ?? []
      const num = (x: unknown) => Number(x) || 0
      return { mob: num(v[0]), prop: num(v[1]), itbi: num(v[2]), socio: num(v[3]), tomador: num(v[4]), resp: num(v[5]), comp: num(v[6]), poss: num(v[7]) }
    }
    // Com filtro: agrupa por pessoa (numérico, sem WHERE de texto) e soma em JS só a(s)
    // pessoa(s) pedida(s) — mesma convenção de contribuinteBase/contribuinteEstoque.
    const where = condEstoqueDtInscr({ ano: f.ano, mes: f.mes }, 'c.dt_inscr')
    const r = await agentQuery(`
      SELECT c.ic_pessoa AS p,
        SUM(cp.ic_pessoa_contribuinte_mobiliario) AS mob, SUM(cp.ic_pessoa_proprietario) AS prop,
        SUM(cp.ic_pessoa_itbi) AS itbi, SUM(cp.ic_pessoa_socio) AS socio,
        SUM(cp.ic_tomador_servico) AS tomador, SUM(cp.ic_pessoa_responsavel_tributario) AS resp,
        SUM(cp.ic_pessoa_compromissario) AS comp, SUM(cp.ic_pessoa_posseiro) AS poss
      FROM ${SCHEMA}.tb_dsod_contribuinte_pessoa cp
      JOIN ${SCHEMA}.tb_dsod_contribuinte c ON c.cd_contr = cp.cd_contr
      WHERE 1=1${where}
      GROUP BY c.ic_pessoa`, 10)
    const num = (x: unknown) => Number(x) || 0
    const acc = { mob: 0, prop: 0, itbi: 0, socio: 0, tomador: 0, resp: 0, comp: 0, poss: 0 }
    for (const row of r.rows) {
      const p = String(row[0] ?? '').trim()
      if (p !== 'F' && p !== 'J') continue
      if (f.pessoa && p !== f.pessoa) continue
      acc.mob += num(row[1]); acc.prop += num(row[2]); acc.itbi += num(row[3]); acc.socio += num(row[4])
      acc.tomador += num(row[5]); acc.resp += num(row[6]); acc.comp += num(row[7]); acc.poss += num(row[8])
    }
    return acc
  })
}

export interface PessoaOpt { id: 'F' | 'J'; label: string }

export const PESSOAS: PessoaOpt[] = [
  { id: 'F', label: 'Pessoa Física' },
  { id: 'J', label: 'Pessoa Jurídica' },
]

// Setores de cobrança (tb_dsod_devedor_contribuinte.ds_setor_devedor).
// "Contribuinte" = base inteira (não é pendência real) → excluído da análise.
export const SETOR_LABEL: Record<string, string> = {
  CobrancaAcumulada: 'Cobrança Acumulada',
  Mobiliario: 'Mobiliário (ISS)',
  Certidao: 'Certidões',
  Imobiliario: 'Imobiliário (IPTU)',
  Itbi: 'ITBI',
  TaxasDiversas: 'Taxas Diversas',
  Projetos: 'Projetos / Obras',
}
export const SETORES_OCULTOS = new Set(['Contribuinte'])

export function lerFiltros(sp: URLSearchParams): FiltrosContribuinte {
  const anoRaw = sp.get('ano')
  const ano = anoRaw && /^\d{4}$/.test(anoRaw) ? Number(anoRaw) : ''
  const p = sp.get('pessoa')
  const pessoa = p === 'F' || p === 'J' ? p : ''
  const mesRaw = Number(sp.get('mes'))
  const mes = mesRaw >= 1 && mesRaw <= 12 ? mesRaw : ''
  return { ano, pessoa, mes }
}
