import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { lerFiltros, SITUACOES_ATIVAS, dataAtualizacaoMobiliario } from '@/lib/mobiliario-filtros'

const SCHEMA = 'pref_aruja_sp'
const RE_ISS = /IMPOSTOS SOBRE SERVI/i

// Rótulos de porte na ordem desejada; null vira "Não informado".
const PORTE_ORDEM = ['ME', 'EPP', 'DEMAIS']
const PORTE_LABEL: Record<string, string> = { ME: 'Microempresa (ME)', EPP: 'Pequeno Porte (EPP)', DEMAIS: 'Demais portes' }

// Motivos de indeferimento no processo de licenciamento/alvará (integração municipal com a
// RFB) — só populado quando ic_indeferido = 'S'.
const MOTIVO_LABEL: Record<string, string> = {
  NaoCadastrado: 'Não cadastrado no município',
  TemDebito: 'Débito em aberto',
  'CadastroNaoAtivo TemDebito': 'Cadastro inativo + débito',
  CadastroNaoAtivo: 'Cadastro inativo',
  SemLicenca: 'Sem licença/alvará',
  LicencaVencida: 'Licença vencida',
}

function normGrupo(v: string): string {
  const t = v.trim()
  if (!t || /^não informado$/i.test(t)) return ''
  return t
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const f = lerFiltros(req.nextUrl.searchParams)
    const semSit = !f.situacao
    const matchSit = (sit: string) => semSit || sit === f.situacao
    // Mês (acumulado): restringe aberturas/encerramentos às datas com mês <= selecionado,
    // em todos os anos (mesma convenção do Outros Tributos). ISS Arrecadado vem do BIORC
    // (posição anual/snapshot) e não é acumulável por mês.
    const filtroMesIni = f.mes ? ` AND MONTH(dt_inicio_atividade) <= ${f.mes}` : ''
    const filtroMesEnc = f.mes ? ` AND MONTH(dt_enc_atividade) <= ${f.mes}` : ''

    const [porteRows, grupoRows, abRows, encRows, receita, rfbRows, dataAtualizacao] = await Promise.all([
      agentQuery(`
        SELECT ds_situacao AS sit, ds_porte_empresa AS porte, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY ds_situacao, ds_porte_empresa`, 200),
      agentQuery(`
        SELECT ds_situacao AS sit, ds_grupo AS grupo, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        GROUP BY ds_situacao, ds_grupo`, 400),
      agentQuery(`
        SELECT YEAR(dt_inicio_atividade) AS ano, ds_situacao AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        WHERE dt_inicio_atividade IS NOT NULL${filtroMesIni}
        GROUP BY YEAR(dt_inicio_atividade), ds_situacao`, 800),
      agentQuery(`
        SELECT YEAR(dt_enc_atividade) AS ano, ds_situacao AS sit, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mobiliario
        WHERE dt_enc_atividade IS NOT NULL${filtroMesEnc}
        GROUP BY YEAR(dt_enc_atividade), ds_situacao`, 800),
      agentQuery(`
        SELECT d.NO_ANO AS ano, nr.DS_ALINEA_RECEITA AS alinea, SUM(r.VL_ARRECADACAO_RECEITA) AS arrec
        FROM ${SCHEMA}.FATO_BIORC_EXECUCAO_RECEITA r
        JOIN ${SCHEMA}.DIM_BIORC_NATUREZA_RECEITA nr ON r.SK_NATUREZA_RECEITA = nr.SK_NATUREZA_RECEITA
        JOIN ${SCHEMA}.DIM_BIORC_DATA_CALENDARIO d ON r.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
        WHERE d.NO_ANO BETWEEN 2018 AND 2030
        GROUP BY d.NO_ANO, nr.DS_ALINEA_RECEITA`, 2000),
      // Situação na Receita Federal (RFB): resultado do indeferimento no processo de
      // licenciamento/alvará (integração municipal, ver tb_dsod_contribuinte_mob_receita_
      // federal). Base completa — cd_contr_mob pode ser -1 (CNPJ nunca cadastrado
      // localmente, motivo "NaoCadastrado"), então não dá pra restringir por situação/
      // segmento do cadastro mobiliário sem perder esses casos.
      agentQuery(`
        SELECT ic_indeferido AS ind, ds_tipo_indeferimento AS motivo, COUNT(*) AS n
        FROM ${SCHEMA}.tb_dsod_contribuinte_mob_receita_federal
        GROUP BY ic_indeferido, ds_tipo_indeferimento`, 30),
      dataAtualizacaoMobiliario(),
    ])

    // ---- Composição Ativas × Inativas (base completa, ignora filtro de situação) ----
    let totalGeral = 0, ativasGeral = 0
    for (const r of porteRows.rows) {
      const sit = String(r[0] ?? '').trim(), n = Number(r[2]) || 0
      totalGeral += n
      if (SITUACOES_ATIVAS.has(sit)) ativasGeral += n
    }
    const ativInat = { ativas: ativasGeral, inativas: totalGeral - ativasGeral }

    // ---- Donut: empresas por porte (entre classificadas; restrito pela situação) ----
    const porteCount = new Map<string, number>()
    for (const r of porteRows.rows) {
      const sit = String(r[0] ?? '').trim()
      if (!matchSit(sit)) continue
      const porte = String(r[1] ?? '').trim()
      if (!porte) continue // null = porte não informado -> fora do donut
      porteCount.set(porte, (porteCount.get(porte) ?? 0) + (Number(r[2]) || 0))
    }
    const portes = PORTE_ORDEM
      .filter(p => porteCount.has(p))
      .map(p => ({ label: PORTE_LABEL[p] ?? p, qt: porteCount.get(p) ?? 0 }))

    // ---- Tabela: empresas por segmento (ds_grupo; restrito pela situação) ----
    const grupoCount = new Map<string, number>()
    let grupoClass = 0
    for (const r of grupoRows.rows) {
      const sit = String(r[0] ?? '').trim()
      if (!matchSit(sit)) continue
      const g = normGrupo(String(r[1] ?? ''))
      if (!g) continue
      const n = Number(r[2]) || 0
      grupoCount.set(g, (grupoCount.get(g) ?? 0) + n)
      grupoClass += n
    }
    const segmentos = Array.from(grupoCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, qt]) => ({ nome, qt, pct: grupoClass ? (qt / grupoClass) * 100 : 0 }))

    // ---- Aberturas / Encerramentos por ano (restritos pela situação) ----
    const ab = new Map<number, number>()
    for (const r of abRows.rows) {
      const ano = Number(r[0]); if (ano < 2000 || ano > 2030) continue
      if (!matchSit(String(r[1] ?? '').trim())) continue
      ab.set(ano, (ab.get(ano) ?? 0) + (Number(r[2]) || 0))
    }
    const enc = new Map<number, number>()
    for (const r of encRows.rows) {
      const ano = Number(r[0]); if (ano < 2000 || ano > 2030) continue
      if (!matchSit(String(r[1] ?? '').trim())) continue
      enc.set(ano, (enc.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    // ---- ISS arrecadado por ano (receita) ----
    const iss = new Map<number, number>()
    for (const r of receita.rows) {
      if (!RE_ISS.test(String(r[1] ?? ''))) continue
      const ano = Number(r[0])
      iss.set(ano, (iss.get(ano) ?? 0) + (Number(r[2]) || 0))
    }

    const anoMax = Math.max(...Array.from(ab.keys()), ...Array.from(iss.keys()), 0)
    const anoAtual = f.ano || anoMax

    // Linha: ISS arrecadado (últimos 6 exercícios com dado, até o ano corrente)
    const porAno = Array.from(iss.keys())
      .filter(a => a <= anoAtual && (iss.get(a) ?? 0) > 0)
      .sort((a, b) => a - b)
      .slice(-6)
      .map(ano => ({ ano, iss: iss.get(ano) ?? 0 }))

    // Barras: aberturas × encerramentos (últimos 8 exercícios até o corrente)
    const anosFluxo = Array.from(new Set([...ab.keys(), ...enc.keys()]))
      .filter(a => a >= 2010 && a <= anoAtual)
      .sort((a, b) => a - b)
      .slice(-8)
    const abVsEnc = anosFluxo.map(ano => ({ ano, aberturas: ab.get(ano) ?? 0, encerramentos: enc.get(ano) ?? 0 }))

    // ---- Situação na Receita Federal (RFB) ----
    let totalRfb = 0, indeferidasRfb = 0, naoIndeferidasRfb = 0, semVerificacaoRfb = 0
    const motivoCount = new Map<string, number>()
    for (const r of rfbRows.rows) {
      const indRaw = r[0]
      const motivo = String(r[1] ?? '').trim()
      const n = Number(r[2]) || 0
      totalRfb += n
      if (indRaw == null) { semVerificacaoRfb += n; continue }
      if (String(indRaw).trim() === 'S') {
        indeferidasRfb += n
        if (motivo) motivoCount.set(motivo, (motivoCount.get(motivo) ?? 0) + n)
      } else {
        naoIndeferidasRfb += n
      }
    }
    const porMotivo = Array.from(motivoCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([motivo, n]) => ({ motivo, label: MOTIVO_LABEL[motivo] ?? motivo, n, pct: indeferidasRfb ? (n / indeferidasRfb) * 100 : 0 }))
    const situacaoRfb = { total: totalRfb, indeferidas: indeferidasRfb, naoIndeferidas: naoIndeferidasRfb, semVerificacao: semVerificacaoRfb, porMotivo }

    return NextResponse.json({ porAno, portes, ativInat, abVsEnc, segmentos, situacaoRfb, referencia: { ano: anoAtual }, dataAtualizacao })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
