// Série DIÁRIA genérica de um tributo (drill "clicar no mês → abrir por dia"), mesmo
// padrão de serie-mensal-tributo.ts — reutilizável por TCA/ITBI/ISSCC. Arrecadado por dia
// de baixa (dt_baixa), mesma fórmula do arrecadado mensal/anual (mov 11,14, lanc 0,4,7,10,
// exclui Estorno de Baixa e guia Recalculo/Validacao).
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const isData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const proxDia = (s: string) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

export interface DiaTributo { dia: string; valor: number }

export async function serieDiariaTributo(cacheKey: string, codigos: string, de: string, ate: string): Promise<DiaTributo[]> {
  return cached(`${cacheKey}:${de}:${ate}`, TTL_15MIN, async () => {
    const r = await agentQuery(`
      SELECT DATEFORMAT(pb.dt_baixa,'yyyy-mm-dd') AS dia, SUM(pm.vl_movimento) AS vl
      FROM ${S}.tb_dsod_guias g
      JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
      JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
      JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
      WHERE g.cd_tributo IN (${codigos}) AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela <> 0
        AND pm.cd_tipo_lancamento IN (0,4,7,10) AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
        AND g.ds_situacao NOT IN ('Recalculo','Validacao')
        AND pb.dt_baixa >= '${de}' AND pb.dt_baixa < '${proxDia(ate)}'
      GROUP BY DATEFORMAT(pb.dt_baixa,'yyyy-mm-dd')`, 800)
    return r.rows
      .map(row => ({ dia: String(row[0] ?? '').slice(0, 10), valor: num(row[1]) }))
      .filter(x => isData(x.dia))
      .sort((a, b) => a.dia.localeCompare(b.dia))
  })
}
