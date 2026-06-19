# Dashboard Orçamento Municipal — Design Spec

**Data:** 2026-05-19  
**Status:** Aprovado  
**Rota:** `/orcamento`

---

## 1. Objetivo

Criar uma nova página de dashboard de Orçamento Municipal na rota `/orcamento`, exibindo KPIs, gráficos de arrecadação mensal, execução orçamentária, despesa por função e receita por categoria. Dados inicialmente mockados; estrutura preparada para conectar ao Sybase IQ depois.

---

## 2. Arquitetura

### API Route
`GET /api/orcamento?ano=2025`

Retorna JSON único com 4 blocos:

```ts
{
  kpis: {
    arrecadado:  { valor: number, meta_pct: number },
    empenhado:   { valor: number, receita_pct: number },
    liquidado:   { valor: number, empenhado_pct: number },
    pago:        { valor: number, liquidado_pct: number }
  },
  mensal: Array<{ mes: string, arrecadado: number }>,  // 12 itens
  funcoes: Array<{ nome: string, pago: number }>,       // top 6
  categorias: Array<{ nome: string, valor: number, pct: number }>
}
```

Na fase mock, os valores são hardcoded na route. Para conectar ao banco, basta substituir o objeto mock pelas queries via `agentQuery()` de `lib/agent.ts`.

### Fluxo da Página
1. `useState<DadosOrcamento | null>` para `dados`, inicializado como `null`
2. `useState<number>` para `ano`, inicializado como `2025`
3. `useEffect` com dependência em `ano` → `fetch('/api/orcamento?ano=' + ano)` → `setDados(json)`
4. Enquanto `dados === null`: renderiza skeleton loaders com `animate-pulse`
5. Com dados: renderiza todos os widgets

---

## 3. Arquivos

| Arquivo | Ação |
|---------|------|
| `app/api/orcamento/route.ts` | **Criar** — retorna mock JSON |
| `app/orcamento/page.tsx` | **Criar** — página completa |
| `app/dashboard/page.tsx` | **Editar** — adicionar "Orçamento" como 1º item do nav |
| `app/chat/page.tsx` | **Editar** — idem |
| `app/catalogo/page.tsx` | **Editar** — idem |

---

## 4. Layout

```
┌─ Sidebar 260px ─────────────────────────────────────────────────┐
│  Logo (ícone prefeitura)                                        │
│  Nav:                                                           │
│    [★] Orçamento     ← ativo nesta página                      │
│    [ ] Painel                                                   │
│    [ ] Chat IA                                                  │
│    [ ] Catálogo                                                 │
│  Promo box inferior (mesmo das outras páginas)                  │
├─ Main (scroll) ─────────────────────────────────────────────────┤
│  Header                                                         │
│    "Orçamento" (normal) + "Municipal" (Instrument Serif italic) │
│    Subtitle: "Execução orçamentária · Receitas e Despesas · {ano}" │
│    Botões decorativos: [↓ Exportar] [📊 Relatório]             │
│                                                                 │
│  Row 1 — 4 KPI Cards (grid 4 colunas)                          │
│    Card 1 (destaque azul): Total Arrecadado + meta_%           │
│    Card 2: Total Empenhado + %_da_receita                       │
│    Card 3: Total Liquidado + %_do_empenhado                     │
│    Card 4: Total Pago + %_do_liquidado                          │
│                                                                 │
│  Row 2 — 2 colunas (60% / 40%)                                 │
│    Col A: Arrecadação Mensal (BarChart vertical)               │
│      Filtro de ano: pills [2023][2024][2025][2026]             │
│    Col B: Execução Orçamentária (RadialBarChart / gauge)        │
│      Percentual empenhado/receita, legenda inferior            │
│                                                                 │
│  Row 3 — 2 colunas (60% / 40%)                                 │
│    Col A: Despesa por Função (BarChart horizontal)              │
│      Botão "Detalhes" decorativo (canto superior direito)      │
│    Col B: Receita por Categoria (PieChart donut)                │
│      Valor total no centro, legenda lateral com %              │
│      Botão "Exportar" decorativo                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Componentes Recharts

| Widget | Componente | Notas |
|--------|-----------|-------|
| Arrecadação Mensal | `BarChart` + `Bar` + `XAxis` + `YAxis` + `Tooltip` | Vertical, 12 barras |
| Execução Orçamentária | `RadialBarChart` + dois `RadialBar` | Azul sobre cinza, semicírculo |
| Despesa por Função | `BarChart` layout `horizontal` + `Bar` + `XAxis` + `YAxis` | Labels de valor à direita |
| Receita por Categoria | `PieChart` + `Pie` (innerRadius) + legenda manual | Donut com valor no centro |

---

## 6. Estilo

Seguindo o sistema Kallas já instalado nas outras páginas:

- **CSS inline** via string + `dangerouslySetInnerHTML={{ __html: CSS }}`
- **Seletor raiz:** `.ko-root[data-theme="light"|"dark"]`  
- **Variáveis:** mesmas de `dashboard/page.tsx` e `chat/page.tsx`
  - `--ko-bg`, `--ko-surface`, `--ko-border`, `--ko-text`, `--ko-muted`, `--ko-accent`
- **Card KPI destaque:** fundo `var(--ko-accent)` (azul-marinho), texto branco
- **Gráficos:** azul primário `#2563eb`
- **Skeleton:** `animate-pulse` com `bg-gray-200 dark:bg-gray-700`, `rounded`
- **Fonte título:** Instrument Serif italic (já carregada via Google Fonts no layout global)
- **Tema:** toggle igual às outras páginas, persiste em `localStorage` key `k-theme`

---

## 7. Interatividade

| Elemento | Comportamento |
|----------|--------------|
| Pills de ano `[2023][2024][2025][2026]` | `setAno(n)` → re-fetch → gráfico atualiza |
| Skeleton loaders | Exibidos enquanto `dados === null` |
| Tooltips Recharts | Padrão, formatado como `R$ X M` |
| Botões Exportar / Relatório / Detalhes | Decorativos — `type="button"` sem handler |

---

## 8. Mock Data (fase 1)

```ts
// app/api/orcamento/route.ts
const MOCK: Record<number, DadosOrcamento> = {
  2025: {
    kpis: {
      arrecadado: { valor: 655300000, meta_pct: 99.1 },
      empenhado:  { valor: 196400000, receita_pct: 30.0 },
      liquidado:  { valor: 42600000,  empenhado_pct: 21.7 },
      pago:       { valor: 33200000,  liquidado_pct: 78.0 },
    },
    mensal: [
      { mes: 'Jan', arrecadado: 76000000 },
      { mes: 'Fev', arrecadado: 58000000 },
      { mes: 'Mar', arrecadado: 62000000 },
      { mes: 'Abr', arrecadado: 54000000 },
      { mes: 'Mai', arrecadado: 57000000 },
      { mes: 'Jun', arrecadado: 55000000 },
      { mes: 'Jul', arrecadado: 52000000 },
      { mes: 'Ago', arrecadado: 48000000 },
      { mes: 'Set', arrecadado: 51000000 },
      { mes: 'Out', arrecadado: 53000000 },
      { mes: 'Nov', arrecadado: 59000000 },
      { mes: 'Dez', arrecadado: 70000000 },
    ],
    funcoes: [
      { nome: 'Saúde',        pago: 68000000 },
      { nome: 'Educação',     pago: 45000000 },
      { nome: 'Administração',pago: 35000000 },
      { nome: 'Urbanismo',    pago: 30000000 },
      { nome: 'Energia',      pago: 5000000  },
      { nome: 'Transporte',   pago: 5000000  },
    ],
    categorias: [
      { nome: 'RECEITAS CORRENTES', valor: 617000000, pct: 94 },
      { nome: 'RECEITAS DE CAPITAL', valor: 38300000, pct: 6  },
    ],
  },
  2024: { /* valores distintos para testar o filtro */ ... },
}
```

Anos 2023 e 2024 terão valores distintos para validar que o filtro de ano funciona.

---

## 9. Preparação para Dados Reais (fase 2)

Quando conectar ao Sybase IQ, substituir o mock na route por:

```ts
import { agentQuery } from '@/lib/agent'

// KPIs
const kpiResult = await agentQuery(`
  SELECT
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA = 1 THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS bruta,
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1,2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS liquida
  FROM pref_aruja_sp.FATO_BIORC_EXECUCAO_RECEITA f
  JOIN pref_aruja_sp.DIM_BIORC_TIPO_NATUREZA_RECEITA tn ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
  JOIN pref_aruja_sp.DIM_BIORC_DATA_CALENDARIO d ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
  WHERE d.NO_ANO = ${ano}
`)
// ... demais queries
```

A interface `DadosOrcamento` permanece a mesma — zero mudança na página.

---

## 10. Fora do Escopo

- Autenticação / controle de acesso (já gerenciado pelo middleware existente)
- Exportação real para PDF/Excel
- Responsividade mobile
- Dark mode específico (herdado automaticamente do sistema Kallas)
- Drill-down nos gráficos
