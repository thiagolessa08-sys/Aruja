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
// Não depende dos filtros da tela (base inteira) — cache de 24h (dado só muda na carga diária).
export async function scoreContribuinte(): Promise<ScoreContribuinte> {
  return cached('scoreContribuinte', TTL_15MIN, async () => {
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
