import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

interface DadosOrcamento {
  kpis: {
    arrecadado: { valor: number; meta_pct: number }
    empenhado:  { valor: number; receita_pct: number }
    liquidado:  { valor: number; empenhado_pct: number }
    pago:       { valor: number; liquidado_pct: number }
  }
  mensal:     Array<{ mes: string; arrecadado: number }>
  funcoes:    Array<{ nome: string; pago: number }>
  categorias: Array<{ nome: string; valor: number; pct: number }>
}

const MOCK: Record<number, DadosOrcamento> = {
  2025: {
    kpis: {
      arrecadado: { valor: 655300000, meta_pct: 99.1 },
      empenhado:  { valor: 196400000, receita_pct: 30.0 },
      liquidado:  { valor: 42600000,  empenhado_pct: 21.7 },
      pago:       { valor: 33200000,  liquidado_pct: 78.0 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 76000000 }, { mes: 'Fev', arrecadado: 58000000 },
      { mes: 'Mar', arrecadado: 62000000 }, { mes: 'Abr', arrecadado: 54000000 },
      { mes: 'Mai', arrecadado: 57000000 }, { mes: 'Jun', arrecadado: 55000000 },
      { mes: 'Jul', arrecadado: 52000000 }, { mes: 'Ago', arrecadado: 48000000 },
      { mes: 'Set', arrecadado: 51000000 }, { mes: 'Out', arrecadado: 53000000 },
      { mes: 'Nov', arrecadado: 59000000 }, { mes: 'Dez', arrecadado: 70000000 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 68000000 },
      { nome: 'Educação',      pago: 45000000 },
      { nome: 'Administração', pago: 35000000 },
      { nome: 'Urbanismo',     pago: 30000000 },
      { nome: 'Energia',       pago: 5000000  },
      { nome: 'Transporte',    pago: 5000000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes',  valor: 617000000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 38300000,  pct: 6  },
    ],
  },
  2024: {
    kpis: {
      arrecadado: { valor: 598700000, meta_pct: 97.3 },
      empenhado:  { valor: 182100000, receita_pct: 30.4 },
      liquidado:  { valor: 39800000,  empenhado_pct: 21.9 },
      pago:       { valor: 31200000,  liquidado_pct: 78.4 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 68000000 }, { mes: 'Fev', arrecadado: 52000000 },
      { mes: 'Mar', arrecadado: 55000000 }, { mes: 'Abr', arrecadado: 48000000 },
      { mes: 'Mai', arrecadado: 51000000 }, { mes: 'Jun', arrecadado: 49000000 },
      { mes: 'Jul', arrecadado: 47000000 }, { mes: 'Ago', arrecadado: 44000000 },
      { mes: 'Set', arrecadado: 46000000 }, { mes: 'Out', arrecadado: 49000000 },
      { mes: 'Nov', arrecadado: 53000000 }, { mes: 'Dez', arrecadado: 63000000 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 62000000 },
      { nome: 'Educação',      pago: 41000000 },
      { nome: 'Administração', pago: 32000000 },
      { nome: 'Urbanismo',     pago: 27000000 },
      { nome: 'Energia',       pago: 4500000  },
      { nome: 'Transporte',    pago: 4200000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes',  valor: 563000000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 35700000,  pct: 6  },
    ],
  },
  2023: {
    kpis: {
      arrecadado: { valor: 541200000, meta_pct: 95.8 },
      empenhado:  { valor: 165000000, receita_pct: 30.5 },
      liquidado:  { valor: 36100000,  empenhado_pct: 21.9 },
      pago:       { valor: 28400000,  liquidado_pct: 78.7 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 61000000 }, { mes: 'Fev', arrecadado: 47000000 },
      { mes: 'Mar', arrecadado: 49000000 }, { mes: 'Abr', arrecadado: 43000000 },
      { mes: 'Mai', arrecadado: 46000000 }, { mes: 'Jun', arrecadado: 44000000 },
      { mes: 'Jul', arrecadado: 42000000 }, { mes: 'Ago', arrecadado: 40000000 },
      { mes: 'Set', arrecadado: 41000000 }, { mes: 'Out', arrecadado: 44000000 },
      { mes: 'Nov', arrecadado: 48000000 }, { mes: 'Dez', arrecadado: 57000000 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 57000000 },
      { nome: 'Educação',      pago: 37000000 },
      { nome: 'Administração', pago: 28000000 },
      { nome: 'Urbanismo',     pago: 23000000 },
      { nome: 'Energia',       pago: 4000000  },
      { nome: 'Transporte',    pago: 3800000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes',  valor: 509000000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 32200000,  pct: 6  },
    ],
  },
  2026: {
    kpis: {
      arrecadado: { valor: 198400000, meta_pct: 30.2 },
      empenhado:  { valor: 54200000,  receita_pct: 27.3 },
      liquidado:  { valor: 11800000,  empenhado_pct: 21.8 },
      pago:       { valor: 9200000,   liquidado_pct: 78.0 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 82000000 }, { mes: 'Fev', arrecadado: 64000000 },
      { mes: 'Mar', arrecadado: 52400000 }, { mes: 'Abr', arrecadado: 0 },
      { mes: 'Mai', arrecadado: 0 },        { mes: 'Jun', arrecadado: 0 },
      { mes: 'Jul', arrecadado: 0 },        { mes: 'Ago', arrecadado: 0 },
      { mes: 'Set', arrecadado: 0 },        { mes: 'Out', arrecadado: 0 },
      { mes: 'Nov', arrecadado: 0 },        { mes: 'Dez', arrecadado: 0 },
    ],
    funcoes: [
      { nome: 'Saúde',         pago: 18000000 },
      { nome: 'Educação',      pago: 12000000 },
      { nome: 'Administração', pago: 9000000  },
      { nome: 'Urbanismo',     pago: 8000000  },
      { nome: 'Energia',       pago: 1200000  },
      { nome: 'Transporte',    pago: 1100000  },
    ],
    categorias: [
      { nome: 'Receitas Correntes',  valor: 186700000, pct: 94 },
      { nome: 'Receitas de Capital', valor: 11700000,  pct: 6  },
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
