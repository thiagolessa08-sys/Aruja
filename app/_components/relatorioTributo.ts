// Geração de relatório (PDF/Excel) a partir dos cards + evolução de um tributo.
// Reaproveitado pelas telas de IPTU/ITBI/TCA/ISSCC. Layout institucional (logo Arujá,
// cabeçalho azul, cards de destaque, tabela de evolução). Client-side (jsPDF/exceljs).

const AZUL: [number, number, number] = [40, 62, 147]
const AZUL_ALT: [number, number, number] = [244, 247, 252]

export interface CardRel { rotulo: string; valor: string }
export interface LinhaEvol { ano: number | string; lancado: string; arrecadado: string; arrecPct: string; emAberto: string; inadimplencia: string; isento?: string; suspenso?: string }
export interface DadosRelatorio {
  titulo: string          // ex.: "IPTU — Exercício 2026"
  subtitulo?: string      // ex.: "Dados atualizados em 19/07/2026"
  cards: CardRel[]
  colunas: string[]       // cabeçalho da tabela de evolução
  linhas: (string | number)[][] // linhas da tabela
  arquivo: string         // base do nome do arquivo (sem extensão)
}

async function carregarLogo(): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const res = await fetch('/logo-aruja.png')
    if (!res.ok) return null
    const blob = await res.blob()
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(blob)
    })
    const dim = await new Promise<{ w: number; h: number }>(resolve => {
      const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => resolve({ w: 0, h: 0 }); img.src = url
    })
    return { url, w: dim.w, h: dim.h }
  } catch { return null }
}

export async function baixarRelatorioPdf(d: DadosRelatorio) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mx = 40
  const dataStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const logo = await carregarLogo()

  const cabecalho = () => {
    const topo = 34
    if (logo && logo.h > 0) {
      const alt = 46, larg = Math.min(190, alt * (logo.w / logo.h))
      try { doc.addImage(logo.url, 'PNG', mx, topo, larg, alt) } catch { /* opcional */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(AZUL[0], AZUL[1], AZUL[2])
    doc.text('RELATÓRIO', pageW - mx, topo + 16, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 128, 148)
    doc.text(`Emitido em ${dataStr} · Secretaria da Fazenda`, pageW - mx, topo + 32, { align: 'right' })
    const yLinha = topo + 52
    doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]); doc.setLineWidth(2); doc.line(mx, yLinha, pageW - mx, yLinha)
    return yLinha + 22
  }
  let y = cabecalho()

  // Título + subtítulo
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(31, 42, 68)
  doc.text(d.titulo, mx, y); y += 20
  if (d.subtitulo) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120, 128, 148); doc.text(d.subtitulo, mx, y); y += 16 }
  y += 6

  // Cards de destaque (linha de até 3 por vez; 1º azul preenchido)
  const cards = d.cards.slice(0, 6)
  const porLinha = 3
  for (let start = 0; start < cards.length; start += porLinha) {
    const grupo = cards.slice(start, start + porLinha)
    const gap = 10, h = 56
    const w = (pageW - 2 * mx - gap * (porLinha - 1)) / porLinha
    const innerW = w - 20
    for (let k = 0; k < grupo.length; k++) {
      const x = mx + k * (w + gap), filled = start === 0 && k === 0
      if (filled) { doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]); doc.roundedRect(x, y, w, h, 7, 7, 'F') }
      else { doc.setDrawColor(205, 213, 235); doc.setLineWidth(1); doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, w, h, 7, 7, 'FD') }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.setTextColor(filled ? 220 : 120, filled ? 228 : 128, filled ? 245 : 150)
      doc.text(grupo[k].rotulo.toUpperCase(), x + 12, y + 17)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(filled ? 255 : AZUL[0], filled ? 255 : AZUL[1], filled ? 255 : AZUL[2])
      let fs = 14; doc.setFontSize(fs)
      while (fs > 8 && doc.getTextWidth(grupo[k].valor) > innerW) { fs -= 0.5; doc.setFontSize(fs) }
      doc.text(grupo[k].valor, x + 12, y + 40)
    }
    y += h + 12
  }
  y += 4

  // Tabela de evolução
  autoTable(doc, {
    head: [d.colunas], body: d.linhas.map(r => r.map(String)), startY: y, margin: { left: mx, right: mx },
    styles: { fontSize: 9, cellPadding: 6, textColor: [55, 65, 95], lineColor: [225, 231, 243], lineWidth: 0.5 },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5, halign: 'left' },
    alternateRowStyles: { fillColor: AZUL_ALT },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [31, 42, 68] } },
    theme: 'grid',
  })

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(230, 234, 244); doc.setLineWidth(0.5); doc.line(mx, pageH - 34, pageW - mx, pageH - 34)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 156, 172)
    doc.text('Prefeitura Municipal de Arujá · Documento gerado a partir de dados oficiais.', mx, pageH - 20)
    doc.text(`${p}/${total}`, pageW - mx, pageH - 20, { align: 'right' })
  }
  doc.save(`${d.arquivo}-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export async function baixarRelatorioExcel(d: DadosRelatorio) {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Relatório')
  const AZ = 'FF283E93', ALT = 'FFF4F7FC', CINZA = 'FF5A6478', ESCURO = 'FF1F2A44'
  const ncol = Math.max(d.colunas.length, 3)
  ws.mergeCells(1, 1, 1, ncol)
  const t = ws.getCell(1, 1); t.value = d.titulo; t.font = { bold: true, size: 15, color: { argb: AZ } }
  if (d.subtitulo) { ws.mergeCells(2, 1, 2, ncol); const s = ws.getCell(2, 1); s.value = d.subtitulo; s.font = { size: 10, color: { argb: CINZA } } }

  let row = 4
  ws.getCell(row, 1).value = 'Indicadores'; ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: ESCURO } }; row++
  for (const c of d.cards) {
    ws.getCell(row, 1).value = c.rotulo; ws.getCell(row, 1).font = { color: { argb: CINZA } }
    const v = ws.getCell(row, 2); v.value = c.valor; v.font = { bold: true, color: { argb: AZ } }
    row++
  }
  row += 1

  const head = ws.getRow(row)
  d.colunas.forEach((c, i) => {
    const cell = head.getCell(i + 1); cell.value = c
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZ } }
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }
  })
  row++
  d.linhas.forEach((r, ri) => {
    const rr = ws.getRow(row)
    r.forEach((val, i) => {
      const cell = rr.getCell(i + 1); cell.value = val
      cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }
      if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
      if (i === 0) cell.font = { bold: true, color: { argb: ESCURO } }
    })
    row++
  })
  ws.columns.forEach(col => { col.width = 18 })
  ws.getColumn(1).width = 26

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${d.arquivo}-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
