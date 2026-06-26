// De-para de tributos (tb_dsod_tributos) agrupados nas abas/sub-abas do dashboard.
// O motor de arrecadação soma vl_lancto/vl_pagto/vl_saldo de tb_dsod_parcela_posicao
// (posição → parcela → guia), agrupando por cd_tributo. cd_tributo é numérico →
// WHERE ... IN (...) funciona (a restrição de literal de TEXTO no IQ não se aplica).

export type GrupoTributo = 'iptu' | 'itbi' | 'isscc' | 'iss' | 'tfe' | 'tfhs' | 'outros'

// Códigos de cd_tributo por grupo (validados em tb_dsod_tributos).
export const CODIGOS: Record<Exclude<GrupoTributo, 'outros'>, number[]> = {
  iptu: [1, 25],                       // IPTU + IPTU Diferença Área
  itbi: [10],                          // ITBI
  isscc: [40, 17, 18],                 // ISS Construção Civil (+ dif. área 2001/02, 2002/03)
  iss: [3, 7, 8, 33, 70, 301, 302, 303, 304, 572], // ISSQN family + Simples Nacional + variável
  tfe: [2002],                         // Taxa de Fiscalização de Estabelecimento
  tfhs: [2003],                        // Taxa de Fiscalização de Higiene e Saúde
}

// Todos os códigos "core" (cobertos por abas dedicadas) — o restante cai em "Outros".
export const CODIGOS_CORE: number[] = Object.values(CODIGOS).flat()

// Códigos operacionais/não-tributo: não entram em "Outros Tributos" nem em rankings.
// 20=DAM genérico (4,8M linhas), 499/501/502=parcelamento, 53/56=restituições,
// 210=correção, 560/565=novo/vazio, 568=cauções, -1=não informado.
export const CODIGOS_EXCLUIDOS: number[] = [20, 499, 501, 502, 53, 56, 210, 560, 565, 568, -1]

export const LABEL_GRUPO: Record<GrupoTributo, string> = {
  iptu: 'IPTU',
  itbi: 'ITBI',
  isscc: 'ISS Construção Civil',
  iss: 'ISS / ISSQN',
  tfe: 'TFE',
  tfhs: 'TFHS',
  outros: 'Outros Tributos',
}

export function codigosDoGrupo(g: GrupoTributo): number[] {
  if (g === 'outros') return [] // tratado por exclusão no engine
  return CODIGOS[g]
}

export function parseGrupo(v: string | null): GrupoTributo | null {
  const ok: GrupoTributo[] = ['iptu', 'itbi', 'isscc', 'iss', 'tfe', 'tfhs', 'outros']
  return v && (ok as string[]).includes(v) ? (v as GrupoTributo) : null
}
