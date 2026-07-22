// Formatação compacta padrão para TODOS os gráficos (tooltip, eixos, rótulos):
// bilhão -> "bi", milhão -> "mi", milhar -> "k". Ex.: 1,2 bi / 67,6 mi / 540 k / 320.
export function fmtAbrev(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi'
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' k'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
