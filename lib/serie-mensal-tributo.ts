// Série MENSAL genérica de um tributo (drill "clicar no ano → abrir por mês"), reutilizada
// por ITBI/TCA/ISSCC. Mesma lógica do serieMensalIptu, parametrizada por código(s) do tributo
// e por join/where extra (ITBI usa a ponte tb_dsod_itbi + vl_total>0).
//  • lancado       = SUM(vl_movimento) mov 1,2,3 por MÊS de vencimento
//  • arrecadado    = SUM(vl_movimento) baixas 11,14 por MÊS da baixa (exclui 'Estorno de Baixa')
//  • emAberto      = net>0 por (mês de vencimento, devedor)
//  • inadimplencia = net>1 vencido por (mês de vencimento, devedor)
import { agentQuery } from '@/lib/agent'
import { cached, TTL_15MIN } from '@/lib/cache'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const MOV_ABERTO = '0,1,2,3,11,12,14,20', LANC_ABERTO = '0,4,7,10,1'

export interface TributoMes { mes: number; lancado: number; arrecadado: number; emAberto: number; inadimplencia: number }

export interface OpcoesMensal {
  cacheKey: string        // prefixo do cache (ex.: 'itbiMensal')
  codigos: string         // lista IN de cd_tributo (ex.: '10' ou '40,17,18')
  joinExtra?: string      // join adicional após tb_dsod_guias (ex.: ponte ITBI)
  whereExtra?: string     // condição adicional no WHERE (ex.: 'AND it.vl_total > 0')
}

export async function serieMensalTributo(opts: OpcoesMensal, ano: number): Promise<TributoMes[]> {
  const { cacheKey, codigos, joinExtra = '', whereExtra = '' } = opts
  return cached(`${cacheKey}:${ano}`, TTL_15MIN, async () => {
    const qNet = (vencido: boolean) => `SELECT m, SUM(valor) vl FROM (
        SELECT MONTH(p.dt_vencimento) m, g.cd_devedor dev, SUM(pm.vl_movimento*pm.no_sinal) valor
        FROM ${S}.tb_dsod_guias g ${joinExtra}
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (${codigos}) AND g.no_exercicio_lancamento IN (${ano}) AND p.no_parcela <> 0 ${whereExtra}
          AND pm.cd_tipo_movimento IN (${MOV_ABERTO}) AND pm.cd_tipo_lancamento IN (${LANC_ABERTO})${vencido ? ' AND p.dt_vencimento < getdate()-1' : ''}
        GROUP BY MONTH(p.dt_vencimento), g.cd_devedor
        HAVING SUM(pm.vl_movimento*pm.no_sinal) > ${vencido ? '1' : '0'}
      ) t GROUP BY m`
    const [lancR, arrecR, abertoR, inadR] = await Promise.all([
      agentQuery(`
        SELECT MONTH(p.dt_vencimento) m, SUM(pm.vl_movimento) vl
        FROM ${S}.tb_dsod_guias g ${joinExtra}
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        WHERE g.cd_tributo IN (${codigos}) AND g.no_exercicio_lancamento IN (${ano})
          AND pm.cd_tipo_movimento IN (1,2,3) AND p.no_parcela <> 0
          AND g.ds_situacao NOT IN ('Recalculo','Validacao') ${whereExtra}
        GROUP BY MONTH(p.dt_vencimento)`, 40),
      agentQuery(`
        SELECT MONTH(pb.dt_baixa) m, SUM(pm.vl_movimento) vl
        FROM ${S}.tb_dsod_guias g ${joinExtra}
        JOIN ${S}.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
        JOIN ${S}.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
        JOIN ${S}.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
        JOIN ${S}.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa = pb.cd_tipo_baixa
        WHERE g.cd_tributo IN (${codigos}) AND g.no_exercicio_lancamento IN (${ano})
          AND pm.cd_tipo_movimento IN (11,14) AND p.no_parcela <> 0
          AND pm.cd_tipo_lancamento IN (0,4,7,10) AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
          AND g.ds_situacao NOT IN ('Recalculo','Validacao') ${whereExtra}
        GROUP BY MONTH(pb.dt_baixa)`, 40),
      agentQuery(qNet(false), 40),
      agentQuery(qNet(true), 40),
    ])
    const lanc = new Map<number, number>(), arr = new Map<number, number>(), aberto = new Map<number, number>(), inad = new Map<number, number>()
    for (const r of lancR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) lanc.set(m, num(r[1])) }
    for (const r of arrecR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) arr.set(m, num(r[1])) }
    for (const r of abertoR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) aberto.set(m, Math.max(0, num(r[1]))) }
    for (const r of inadR.rows) { const m = num(r[0]); if (m >= 1 && m <= 12) inad.set(m, Math.max(0, num(r[1]))) }
    const out: TributoMes[] = []
    for (let m = 1; m <= 12; m++) out.push({ mes: m, lancado: lanc.get(m) ?? 0, arrecadado: arr.get(m) ?? 0, emAberto: aberto.get(m) ?? 0, inadimplencia: inad.get(m) ?? 0 })
    return out
  })
}
