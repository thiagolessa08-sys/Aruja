# Dashboard IPTU — Design Spec

**Data:** 2026-05-19
**Status:** Aprovado
**Rota:** `/iptu`

## Objetivo
Página de análise executiva 360° do IPTU do Município com KPIs financeiros e cadastrais, série mensal lançado vs. arrecadado, donut por tipo de imóvel, ranking dos 10 bairros que mais arrecadam e aging da dívida ativa. Dados mock por ano (2023–2026); estrutura pronta para conectar ao Sybase IQ.

## API
`GET /api/iptu?ano=N` retorna um único JSON com 5 blocos:

```typescript
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
  bairros: Array<{ nome: string; valor: number }>  // top 10
  aging:   Array<{ faixa: string; valor: number; pct: number }>
}
```

Auth: 401 se `getSession()` retornar null (mesmo padrão das outras rotas). Fallback: se `ano` não existir em `MOCK`, usa `MOCK[2026]`.

## Layout
- Sidebar azul-marinho (`oklch(0.20 0.10 264)`) com texto branco, "IPTU" como **4º item** ativo (após Orçamento, Receita, Despesa)
- Prefixo CSS: `.kipt-root` (não conflita com `.kor-`, `.krec-`, `.kdes-`)
- Header: título "IPTU do *Município*" (Instrument Serif, "Município" em itálico azul) · subtítulo · toggle tema · botões Exportar (primary), Carnê IPTU, Detalhe Cadastro

### Row 1 — 5 KPI Cards (grid 5 cols, gap 14px)
| # | Card | Estilo | Subtexto |
|---|------|--------|----------|
| 1 | IPTU Lançado | accent (`#0f2d5a` bg, texto branco) | ▲%/▼% vs ano anterior |
| 2 | IPTU Arrecadado | branco | ▲%/▼% vs ano anterior |
| 3 | % Efetividade | branco | "arrecadado / lançado" |
| 4 | Inadimplência | warm (`oklch(0.96 0.04 75)` bg bege) | ▲%/▼% vs ano anterior |
| 5 | Imóveis Cadastrados | branco | "imóveis no cadastro" |

Skeleton loaders por card durante fetch.

### Row 2 — 60/40
- **Esquerda (3fr):** BarChart mensal 12 meses, 2 séries lado a lado: **Lançado** (cinza `#d1d5db`) + **Arrecadado** (azul `#2563eb`). Pills de ano `2023 · 2024 · 2025 · 2026`. Tooltip e legenda inline embaixo do chart.
- **Direita (2fr):** PieChart donut **Por Tipo de Imóvel** — 4 fatias (Residencial, Comercial, Industrial, Terreno Baldio). Paleta `['#0f2d5a','#2563eb','#60a5fa','#93c5fd']`. Centro: `fmtM(arrecadado)` + label "arrecadado". Legenda lateral nome + %.

### Row 3 — 60/40
- **Esquerda (3fr):** Lista CSS de barras horizontais **Top 10 Bairros em Arrecadação** — 10 linhas com nome (uppercase, peso 700), barra com gradiente `linear-gradient(90deg, #0f2d5a 0%, #2563eb 100%)` proporcional ao valor máximo da lista, e valor em R$ M à direita. Reaproveita o componente visual do `/despesa`.
- **Direita (2fr):** PieChart donut **Aging da Dívida** — 4 faixas: "Até 1 ano", "1–3 anos", "3–5 anos", "+5 anos". Mesma paleta do donut de tipo. Centro: total da dívida + label "dívida total".

## Dados Mock (referência para o engenheiro)

Bairros de Arujá usados no ranking (top 10): Centro, Jardim Rincão, Parque Rincão, Jardim Fazenda Rincão, Jardim Belém, Vila Flórida, Jardim das Acácias, Jardim Planalto, Citrolândia, Recreio dos Bandeirantes.

Ordem de grandeza para 2025 (calibrar nos outros anos):
- Lançado: ~R$ 220 M · Arrecadado: ~R$ 178 M · Efetividade: ~80,9%
- Inadimplência: ~R$ 42 M · Imóveis: ~58.000
- Aging: Até 1 ano ~50%, 1–3 anos ~30%, 3–5 anos ~12%, +5 anos ~8%
- Tipos: Residencial ~68%, Comercial ~22%, Industrial ~7%, Terreno ~3%

## Estado e Tema
- `useState<'light' | 'dark'>` sincronizado com `localStorage.getItem('k-theme')` (chave compartilhada entre todas as abas — toggle em `/iptu` reflete nas outras)
- `useState<number>(2026)` para ano (default no ano corrente — 2026)
- `useEffect([ano])` dispara fetch e reseta `dados` para null (mostra skeletons)
- Erro 401 → `router.push('/login')`

## Sidebar — Atualizações Cross-File
A ordem final do menu fica:
1. Orçamento
2. Receita
3. Despesa
4. **IPTU** (novo)
5. Chat IA
6. Catálogo
7. Consulta

Arquivos que precisam adicionar o novo link "IPTU" (mesmo SVG de prédio/casa em todos):
- `app/orcamento/page.tsx`
- `app/receita/page.tsx`
- `app/despesa/page.tsx`
- `app/dashboard/page.tsx`
- `app/chat/page.tsx`
- `app/iptu/page.tsx` (este — `IPTU` ativo)

Ícone SVG sugerido (casa com símbolo $):
```html
<svg viewBox="0 0 24 24" fill="none">
  <path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
</svg>
```

## Arquivos a Criar/Modificar
- **Criar:** `app/api/iptu/route.ts` (mock data 4 anos + GET handler)
- **Criar:** `app/iptu/page.tsx` (página completa Kallas)
- **Modificar:** 5 sidebars existentes (adicionar item "IPTU" após Despesa)

## Fora de Escopo (YAGNI)
- Drill-down em bairro/tipo (apenas visualização)
- Filtros além de ano (ex: por bairro, por tipo)
- Exportação real (botão decorativo)
- Mapa geográfico (apenas lista textual de bairros)
- Tabela de maiores devedores individuais
