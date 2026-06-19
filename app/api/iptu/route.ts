import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export interface DadosIPTU {
  kpis: {
    lancado:       { valor: number; vs_ano_anterior_pct: number }
    arrecadado:    { valor: number; vs_ano_anterior_pct: number }
    efetividade:   { pct: number }
    inadimplencia: { valor: number; vs_ano_anterior_pct: number }
    imoveis:       { qtde: number }
  }
  mensal:  Array<{ mes: string; lancado: number; arrecadado: number }>
  tipos:   Array<{ nome: string; valor: number; pct: number }>
  bairros: Array<{ nome: string; valor: number }>
  aging:   Array<{ faixa: string; valor: number; pct: number }>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const MOCK: Record<number, DadosIPTU> = {
  2026: {
    kpis: {
      lancado:       { valor: 240000000, vs_ano_anterior_pct: 9.1  },
      arrecadado:    { valor: 81500000,  vs_ano_anterior_pct: 8.2  },
      efetividade:   { pct: 34.0 },
      inadimplencia: { valor: 158500000, vs_ano_anterior_pct: 9.7  },
      imoveis:       { qtde: 59800 },
    },
    mensal: [
      { mes: 'Jan', lancado: 22000000, arrecadado: 28500000 },
      { mes: 'Fev', lancado: 20000000, arrecadado: 21200000 },
      { mes: 'Mar', lancado: 20000000, arrecadado: 18800000 },
      { mes: 'Abr', lancado: 19000000, arrecadado: 13000000 },
      { mes: 'Mai', lancado: 19000000, arrecadado: 0 },
      { mes: 'Jun', lancado: 19000000, arrecadado: 0 },
      { mes: 'Jul', lancado: 19000000, arrecadado: 0 },
      { mes: 'Ago', lancado: 19000000, arrecadado: 0 },
      { mes: 'Set', lancado: 19000000, arrecadado: 0 },
      { mes: 'Out', lancado: 19000000, arrecadado: 0 },
      { mes: 'Nov', lancado: 22000000, arrecadado: 0 },
      { mes: 'Dez', lancado: 23000000, arrecadado: 0 },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 55420000, pct: 68 },
      { nome: 'Comercial',       valor: 17930000, pct: 22 },
      { nome: 'Industrial',      valor: 5705000,  pct: 7  },
      { nome: 'Terreno Baldio',  valor: 2445000,  pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 14200000 },
      { nome: 'JARDIM RINCÃO',              valor: 11800000 },
      { nome: 'PARQUE RINCÃO',              valor: 9650000  },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 8200000  },
      { nome: 'JARDIM BELÉM',               valor: 7300000  },
      { nome: 'VILA FLÓRIDA',               valor: 6100000  },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 5400000  },
      { nome: 'JARDIM PLANALTO',            valor: 4750000  },
      { nome: 'CITROLÂNDIA',                valor: 4100000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 3500000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 79250000, pct: 50 },
      { faixa: '1–3 anos',   valor: 47550000, pct: 30 },
      { faixa: '3–5 anos',   valor: 19020000, pct: 12 },
      { faixa: '+5 anos',    valor: 12680000, pct: 8  },
    ],
  },
  2025: {
    kpis: {
      lancado:       { valor: 220000000, vs_ano_anterior_pct: 10.0 },
      arrecadado:    { valor: 178000000, vs_ano_anterior_pct: 11.3 },
      efetividade:   { pct: 80.9 },
      inadimplencia: { valor: 42000000,  vs_ano_anterior_pct: -4.5 },
      imoveis:       { qtde: 58200 },
    },
    mensal: [
      { mes: 'Jan', lancado: 20000000, arrecadado: 26500000 },
      { mes: 'Fev', lancado: 18000000, arrecadado: 19800000 },
      { mes: 'Mar', lancado: 18000000, arrecadado: 17600000 },
      { mes: 'Abr', lancado: 17000000, arrecadado: 16400000 },
      { mes: 'Mai', lancado: 17000000, arrecadado: 14200000 },
      { mes: 'Jun', lancado: 17000000, arrecadado: 13100000 },
      { mes: 'Jul', lancado: 17000000, arrecadado: 12500000 },
      { mes: 'Ago', lancado: 17000000, arrecadado: 11800000 },
      { mes: 'Set', lancado: 17000000, arrecadado: 11200000 },
      { mes: 'Out', lancado: 17000000, arrecadado: 12000000 },
      { mes: 'Nov', lancado: 20000000, arrecadado: 11900000 },
      { mes: 'Dez', lancado: 25000000, arrecadado: 11000000 },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 121040000, pct: 68 },
      { nome: 'Comercial',       valor: 39160000,  pct: 22 },
      { nome: 'Industrial',      valor: 12460000,  pct: 7  },
      { nome: 'Terreno Baldio',  valor: 5340000,   pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 31200000 },
      { nome: 'JARDIM RINCÃO',              valor: 25900000 },
      { nome: 'PARQUE RINCÃO',              valor: 21100000 },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 17900000 },
      { nome: 'JARDIM BELÉM',               valor: 15950000 },
      { nome: 'VILA FLÓRIDA',               valor: 13320000 },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 11800000 },
      { nome: 'JARDIM PLANALTO',            valor: 10350000 },
      { nome: 'CITROLÂNDIA',                valor: 8960000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 7620000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 21000000, pct: 50 },
      { faixa: '1–3 anos',   valor: 12600000, pct: 30 },
      { faixa: '3–5 anos',   valor: 5040000,  pct: 12 },
      { faixa: '+5 anos',    valor: 3360000,  pct: 8  },
    ],
  },
  2024: {
    kpis: {
      lancado:       { valor: 200000000, vs_ano_anterior_pct: 8.7  },
      arrecadado:    { valor: 160000000, vs_ano_anterior_pct: 9.8  },
      efetividade:   { pct: 80.0 },
      inadimplencia: { valor: 44000000,  vs_ano_anterior_pct: 5.1  },
      imoveis:       { qtde: 56500 },
    },
    mensal: [
      { mes: 'Jan', lancado: 18000000, arrecadado: 23900000 },
      { mes: 'Fev', lancado: 16500000, arrecadado: 17800000 },
      { mes: 'Mar', lancado: 16500000, arrecadado: 15900000 },
      { mes: 'Abr', lancado: 15500000, arrecadado: 14750000 },
      { mes: 'Mai', lancado: 15500000, arrecadado: 12800000 },
      { mes: 'Jun', lancado: 15500000, arrecadado: 11800000 },
      { mes: 'Jul', lancado: 15500000, arrecadado: 11250000 },
      { mes: 'Ago', lancado: 15500000, arrecadado: 10600000 },
      { mes: 'Set', lancado: 15500000, arrecadado: 10100000 },
      { mes: 'Out', lancado: 15500000, arrecadado: 10800000 },
      { mes: 'Nov', lancado: 18000000, arrecadado: 10700000 },
      { mes: 'Dez', lancado: 22500000, arrecadado: 9600000  },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 108800000, pct: 68 },
      { nome: 'Comercial',       valor: 35200000,  pct: 22 },
      { nome: 'Industrial',      valor: 11200000,  pct: 7  },
      { nome: 'Terreno Baldio',  valor: 4800000,   pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 28000000 },
      { nome: 'JARDIM RINCÃO',              valor: 23300000 },
      { nome: 'PARQUE RINCÃO',              valor: 19000000 },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 16100000 },
      { nome: 'JARDIM BELÉM',               valor: 14350000 },
      { nome: 'VILA FLÓRIDA',               valor: 12000000 },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 10620000 },
      { nome: 'JARDIM PLANALTO',            valor: 9300000  },
      { nome: 'CITROLÂNDIA',                valor: 8060000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 6860000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 22000000, pct: 50 },
      { faixa: '1–3 anos',   valor: 13200000, pct: 30 },
      { faixa: '3–5 anos',   valor: 5280000,  pct: 12 },
      { faixa: '+5 anos',    valor: 3520000,  pct: 8  },
    ],
  },
  2023: {
    kpis: {
      lancado:       { valor: 184000000, vs_ano_anterior_pct: 7.5  },
      arrecadado:    { valor: 145700000, vs_ano_anterior_pct: 6.8  },
      efetividade:   { pct: 79.2 },
      inadimplencia: { valor: 41900000,  vs_ano_anterior_pct: 4.2  },
      imoveis:       { qtde: 54800 },
    },
    mensal: [
      { mes: 'Jan', lancado: 16000000, arrecadado: 21800000 },
      { mes: 'Fev', lancado: 15000000, arrecadado: 16200000 },
      { mes: 'Mar', lancado: 15000000, arrecadado: 14500000 },
      { mes: 'Abr', lancado: 14000000, arrecadado: 13400000 },
      { mes: 'Mai', lancado: 14000000, arrecadado: 11700000 },
      { mes: 'Jun', lancado: 14000000, arrecadado: 10750000 },
      { mes: 'Jul', lancado: 14000000, arrecadado: 10250000 },
      { mes: 'Ago', lancado: 14000000, arrecadado: 9650000  },
      { mes: 'Set', lancado: 14000000, arrecadado: 9200000  },
      { mes: 'Out', lancado: 14000000, arrecadado: 9850000  },
      { mes: 'Nov', lancado: 16500000, arrecadado: 9750000  },
      { mes: 'Dez', lancado: 20500000, arrecadado: 8650000  },
    ],
    tipos: [
      { nome: 'Residencial',     valor: 99080000, pct: 68 },
      { nome: 'Comercial',       valor: 32050000, pct: 22 },
      { nome: 'Industrial',      valor: 10200000, pct: 7  },
      { nome: 'Terreno Baldio',  valor: 4370000,  pct: 3  },
    ],
    bairros: [
      { nome: 'CENTRO',                     valor: 25500000 },
      { nome: 'JARDIM RINCÃO',              valor: 21200000 },
      { nome: 'PARQUE RINCÃO',              valor: 17300000 },
      { nome: 'JARDIM FAZENDA RINCÃO',      valor: 14650000 },
      { nome: 'JARDIM BELÉM',               valor: 13060000 },
      { nome: 'VILA FLÓRIDA',               valor: 10900000 },
      { nome: 'JARDIM DAS ACÁCIAS',         valor: 9660000  },
      { nome: 'JARDIM PLANALTO',            valor: 8470000  },
      { nome: 'CITROLÂNDIA',                valor: 7340000  },
      { nome: 'RECREIO DOS BANDEIRANTES',   valor: 6240000  },
    ],
    aging: [
      { faixa: 'Até 1 ano',  valor: 20950000, pct: 50 },
      { faixa: '1–3 anos',   valor: 12570000, pct: 30 },
      { faixa: '3–5 anos',   valor: 5028000,  pct: 12 },
      { faixa: '+5 anos',    valor: 3352000,  pct: 8  },
    ],
  },
}

// Reference (kept in file for future Sybase integration):
// Months order: MESES = ['Jan',…,'Dez']
void MESES

export async function GET(req: NextRequest) {
  const session = getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ano = parseInt(searchParams.get('ano') ?? '2026')
  const dados = MOCK[ano] ?? MOCK[2026]
  return NextResponse.json(dados)
}
