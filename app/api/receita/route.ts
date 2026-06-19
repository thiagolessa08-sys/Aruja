import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export interface DadosReceita {
  kpis: {
    orcado:           { valor: number; tendencia: 'up' | 'down' }
    orcadoAtualizado: { valor: number; tendencia: 'up' | 'down' }
    arrecadacaoMes:   { valor: number; vs_ano_anterior_pct: number }
    acumulado:        { valor: number; vs_ano_anterior_pct: number }
    mesAnterior:      { valor: number }
  }
  mensal:     Array<{ mes: string; meta: number; realizado: number }>
  categorias: Array<{ nome: string; valor: number; pct: number }>
  historico: {
    meses: string[]
    anos:  Record<string, number[]>
  }
  origens: Array<{ nome: string; valor: number }>
}

const MOCK: Record<number, DadosReceita> = {
  2025: {
    kpis: {
      orcado:           { valor: 661000000, tendencia: 'down' },
      orcadoAtualizado: { valor: 760700000, tendencia: 'down' },
      arrecadacaoMes:   { valor: 655300000, vs_ano_anterior_pct: 13.8 },
      acumulado:        { valor: 655300000, vs_ano_anterior_pct: 13.8 },
      mesAnterior:      { valor: 575900000 },
    },
    mensal: [
      { mes: 'Jan', meta: 85000000, realizado: 76000000 },
      { mes: 'Fev', meta: 70000000, realizado: 58000000 },
      { mes: 'Mar', meta: 72000000, realizado: 62000000 },
      { mes: 'Abr', meta: 65000000, realizado: 54000000 },
      { mes: 'Mai', meta: 68000000, realizado: 57000000 },
      { mes: 'Jun', meta: 65000000, realizado: 55000000 },
      { mes: 'Jul', meta: 62000000, realizado: 52000000 },
      { mes: 'Ago', meta: 60000000, realizado: 48000000 },
      { mes: 'Set', meta: 62000000, realizado: 51000000 },
      { mes: 'Out', meta: 64000000, realizado: 53000000 },
      { mes: 'Nov', meta: 70000000, realizado: 59000000 },
      { mes: 'Dez', meta: 82000000, realizado: 70000000 },
    ],
    categorias: [
      { nome: 'Transferências Correntes',              valor: 413600000, pct: 63 },
      { nome: 'Impostos, Taxas e Contrib. de Melhoria', valor: 183400000, pct: 28 },
      { nome: 'Operações de Crédito',                  valor: 26200000,  pct: 4  },
      { nome: 'Transferências de Capital',              valor: 13100000,  pct: 2  },
      { nome: 'Outras Receitas Correntes',              valor: 13100000,  pct: 2  },
      { nome: 'Contribuições',                          valor: 6560000,   pct: 1  },
    ],
    historico: {
      meses: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      anos: {
        '2023': [59444282,50717657,47157120,39127073,57188731,44739854,42472101,44832760,48291430,52810340,58930120,64299400],
        '2024': [70277740,59214382,45822256,52822165,61750170,53914449,62845430,55190280,61432100,67830420,73291500,80239110],
        '2025': [67267295,65331666,51917374,65486361,50931379,53133699,66528173,0,0,0,0,0],
        '2026': [79892897,65321156,68584583,29981487,0,0,0,0,0,0,0,0],
      },
    },
    origens: [
      { nome: 'Transf. Correntes', valor: 413600000 },
      { nome: 'Impostos e Taxas',  valor: 181400000 },
      { nome: 'Op. de Crédito',    valor: 25100000  },
      { nome: 'Transf. Capital',   valor: 14500000  },
      { nome: 'Outras Rec. Correntes', valor: 18000000 },
    ],
  },
  2024: {
    kpis: {
      orcado:           { valor: 620000000, tendencia: 'up' },
      orcadoAtualizado: { valor: 698000000, tendencia: 'up' },
      arrecadacaoMes:   { valor: 598700000, vs_ano_anterior_pct: 10.6 },
      acumulado:        { valor: 598700000, vs_ano_anterior_pct: 10.6 },
      mesAnterior:      { valor: 541200000 },
    },
    mensal: [
      { mes: 'Jan', meta: 78000000, realizado: 70277740 },
      { mes: 'Fev', meta: 65000000, realizado: 59214382 },
      { mes: 'Mar', meta: 55000000, realizado: 45822256 },
      { mes: 'Abr', meta: 60000000, realizado: 52822165 },
      { mes: 'Mai', meta: 68000000, realizado: 61750170 },
      { mes: 'Jun', meta: 60000000, realizado: 53914449 },
      { mes: 'Jul', meta: 70000000, realizado: 62845430 },
      { mes: 'Ago', meta: 62000000, realizado: 55190280 },
      { mes: 'Set', meta: 68000000, realizado: 61432100 },
      { mes: 'Out', meta: 74000000, realizado: 67830420 },
      { mes: 'Nov', meta: 80000000, realizado: 73291500 },
      { mes: 'Dez', meta: 88000000, realizado: 80239110 },
    ],
    categorias: [
      { nome: 'Transferências Correntes',              valor: 376600000, pct: 63 },
      { nome: 'Impostos, Taxas e Contrib. de Melhoria', valor: 167200000, pct: 28 },
      { nome: 'Operações de Crédito',                  valor: 23900000,  pct: 4  },
      { nome: 'Transferências de Capital',              valor: 11900000,  pct: 2  },
      { nome: 'Outras Receitas Correntes',              valor: 11900000,  pct: 2  },
      { nome: 'Contribuições',                          valor: 5980000,   pct: 1  },
    ],
    historico: {
      meses: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      anos: {
        '2022': [42100000,38200000,35100000,32800000,44200000,36100000,38500000,37200000,40100000,43800000,48200000,52900000],
        '2023': [59444282,50717657,47157120,39127073,57188731,44739854,42472101,44832760,48291430,52810340,58930120,64299400],
        '2024': [70277740,59214382,45822256,52822165,61750170,53914449,62845430,55190280,61432100,67830420,73291500,80239110],
        '2025': [67267295,65331666,51917374,65486361,50931379,53133699,66528173,0,0,0,0,0],
      },
    },
    origens: [
      { nome: 'Transf. Correntes', valor: 376600000 },
      { nome: 'Impostos e Taxas',  valor: 167200000 },
      { nome: 'Op. de Crédito',    valor: 23900000  },
      { nome: 'Transf. Capital',   valor: 11900000  },
      { nome: 'Outras Rec. Correntes', valor: 17100000 },
    ],
  },
  2023: {
    kpis: {
      orcado:           { valor: 565000000, tendencia: 'up' },
      orcadoAtualizado: { valor: 610000000, tendencia: 'up' },
      arrecadacaoMes:   { valor: 541200000, vs_ano_anterior_pct: 8.2 },
      acumulado:        { valor: 541200000, vs_ano_anterior_pct: 8.2 },
      mesAnterior:      { valor: 500100000 },
    },
    mensal: [
      { mes: 'Jan', meta: 68000000, realizado: 59444282 },
      { mes: 'Fev', meta: 58000000, realizado: 50717657 },
      { mes: 'Mar', meta: 52000000, realizado: 47157120 },
      { mes: 'Abr', meta: 46000000, realizado: 39127073 },
      { mes: 'Mai', meta: 62000000, realizado: 57188731 },
      { mes: 'Jun', meta: 50000000, realizado: 44739854 },
      { mes: 'Jul', meta: 48000000, realizado: 42472101 },
      { mes: 'Ago', meta: 50000000, realizado: 44832760 },
      { mes: 'Set', meta: 54000000, realizado: 48291430 },
      { mes: 'Out', meta: 58000000, realizado: 52810340 },
      { mes: 'Nov', meta: 65000000, realizado: 58930120 },
      { mes: 'Dez', meta: 72000000, realizado: 64299400 },
    ],
    categorias: [
      { nome: 'Transferências Correntes',              valor: 341000000, pct: 63 },
      { nome: 'Impostos, Taxas e Contrib. de Melhoria', valor: 151500000, pct: 28 },
      { nome: 'Operações de Crédito',                  valor: 21600000,  pct: 4  },
      { nome: 'Transferências de Capital',              valor: 10800000,  pct: 2  },
      { nome: 'Outras Receitas Correntes',              valor: 10800000,  pct: 2  },
      { nome: 'Contribuições',                          valor: 5400000,   pct: 1  },
    ],
    historico: {
      meses: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      anos: {
        '2021': [35100000,31200000,28900000,26800000,36100000,29500000,31400000,30200000,32800000,35600000,39200000,43100000],
        '2022': [42100000,38200000,35100000,32800000,44200000,36100000,38500000,37200000,40100000,43800000,48200000,52900000],
        '2023': [59444282,50717657,47157120,39127073,57188731,44739854,42472101,44832760,48291430,52810340,58930120,64299400],
        '2024': [70277740,59214382,45822256,52822165,61750170,53914449,62845430,55190280,61432100,67830420,73291500,80239110],
      },
    },
    origens: [
      { nome: 'Transf. Correntes', valor: 341000000 },
      { nome: 'Impostos e Taxas',  valor: 151500000 },
      { nome: 'Op. de Crédito',    valor: 21600000  },
      { nome: 'Transf. Capital',   valor: 10800000  },
      { nome: 'Outras Rec. Correntes', valor: 15400000 },
    ],
  },
  2026: {
    kpis: {
      orcado:           { valor: 720000000, tendencia: 'up' },
      orcadoAtualizado: { valor: 820000000, tendencia: 'up' },
      arrecadacaoMes:   { valor: 243780136, vs_ano_anterior_pct: 17.2 },
      acumulado:        { valor: 243780136, vs_ano_anterior_pct: 17.2 },
      mesAnterior:      { valor: 65321156 },
    },
    mensal: [
      { mes: 'Jan', meta: 90000000, realizado: 79892897 },
      { mes: 'Fev', meta: 75000000, realizado: 65321156 },
      { mes: 'Mar', meta: 78000000, realizado: 68584583 },
      { mes: 'Abr', meta: 72000000, realizado: 29981487 },
      { mes: 'Mai', meta: 74000000, realizado: 0 },
      { mes: 'Jun', meta: 72000000, realizado: 0 },
      { mes: 'Jul', meta: 70000000, realizado: 0 },
      { mes: 'Ago', meta: 68000000, realizado: 0 },
      { mes: 'Set', meta: 70000000, realizado: 0 },
      { mes: 'Out', meta: 74000000, realizado: 0 },
      { mes: 'Nov', meta: 80000000, realizado: 0 },
      { mes: 'Dez', meta: 92000000, realizado: 0 },
    ],
    categorias: [
      { nome: 'Transferências Correntes',              valor: 153600000, pct: 63 },
      { nome: 'Impostos, Taxas e Contrib. de Melhoria', valor: 68200000,  pct: 28 },
      { nome: 'Operações de Crédito',                  valor: 9750000,   pct: 4  },
      { nome: 'Transferências de Capital',              valor: 4870000,   pct: 2  },
      { nome: 'Outras Receitas Correntes',              valor: 4870000,   pct: 2  },
      { nome: 'Contribuições',                          valor: 2430000,   pct: 1  },
    ],
    historico: {
      meses: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      anos: {
        '2023': [59444282,50717657,47157120,39127073,57188731,44739854,42472101,44832760,48291430,52810340,58930120,64299400],
        '2024': [70277740,59214382,45822256,52822165,61750170,53914449,62845430,55190280,61432100,67830420,73291500,80239110],
        '2025': [67267295,65331666,51917374,65486361,50931379,53133699,66528173,0,0,0,0,0],
        '2026': [79892897,65321156,68584583,29981487,0,0,0,0,0,0,0,0],
      },
    },
    origens: [
      { nome: 'Transf. Correntes', valor: 153600000 },
      { nome: 'Impostos e Taxas',  valor: 68200000  },
      { nome: 'Op. de Crédito',    valor: 9750000   },
      { nome: 'Transf. Capital',   valor: 4870000   },
      { nome: 'Outras Rec. Correntes', valor: 7360000 },
    ],
  },
}

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ano = parseInt(searchParams.get('ano') ?? '2025')
  const dados = MOCK[ano] ?? MOCK[2025]
  return NextResponse.json(dados)
}
