'use client'

import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz, type ColDef, type ValueFormatterParams, type GetRowStyle } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

const tema = themeQuartz.withParams({
  headerBackgroundColor: '#283e93',
  headerTextColor: '#ffffff',
  headerFontSize: 11,
  headerFontWeight: 700,
  fontSize: 11.5,
  rowHoverColor: '#eef1fb',
  oddRowBackgroundColor: '#fafbff',
  borderColor: '#eef1f7',
  wrapperBorderRadius: 8,
  spacing: 6,
})

export interface LinhaValoresPagos { nome: string; contribuinte: number; imobiliario: number; mobiliario: number; totalGeral: number }

const fmtReais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatarMoeda = (p: ValueFormatterParams<LinhaValoresPagos, number>) => (!p.value ? '—' : fmtReais(p.value))

const getRowStyle: GetRowStyle<LinhaValoresPagos> = p =>
  p.node.rowPinned ? { background: '#eef1fb', fontWeight: 700 } : undefined

export default function GridValoresPagosPorTributo({ linhas }: { linhas: LinhaValoresPagos[] }) {
  const totalGeral = useMemo<LinhaValoresPagos>(() => ({
    nome: 'Total Geral',
    contribuinte: linhas.reduce((s, l) => s + l.contribuinte, 0),
    imobiliario: linhas.reduce((s, l) => s + l.imobiliario, 0),
    mobiliario: linhas.reduce((s, l) => s + l.mobiliario, 0),
    totalGeral: linhas.reduce((s, l) => s + l.totalGeral, 0),
  }), [linhas])

  const colDefs = useMemo<ColDef<LinhaValoresPagos>[]>(() => [
    { field: 'nome', headerName: 'TRIBUTO', flex: 1.7, minWidth: 220, cellStyle: { fontWeight: 600, color: '#1f2a44' } },
    { field: 'contribuinte', headerName: 'CONTRIBUINTE', type: 'rightAligned', flex: 1, minWidth: 130, valueFormatter: formatarMoeda },
    { field: 'imobiliario', headerName: 'IMOBILIARIO', type: 'rightAligned', flex: 1, minWidth: 130, valueFormatter: formatarMoeda },
    { field: 'mobiliario', headerName: 'MOBILIARIO', type: 'rightAligned', flex: 1, minWidth: 130, valueFormatter: formatarMoeda },
    {
      field: 'totalGeral', headerName: 'TOTAL GERAL', type: 'rightAligned', flex: 1.3, minWidth: 175, sort: 'desc',
      cellStyle: { fontWeight: 700, color: '#283e93' },
      valueFormatter: p => fmtReais(p.value ?? 0),
    },
  ], [])

  return (
    <div style={{ width: '100%' }}>
      <AgGridReact<LinhaValoresPagos>
        theme={tema}
        rowData={linhas}
        columnDefs={colDefs}
        pinnedBottomRowData={[totalGeral]}
        getRowStyle={getRowStyle}
        headerHeight={32}
        rowHeight={28}
        domLayout="autoHeight"
        suppressCellFocus
        defaultColDef={{ sortable: true, resizable: true }}
      />
    </div>
  )
}
