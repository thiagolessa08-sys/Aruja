# Regras de Negócio — Dashboard Prefeitura de Arujá

Documento vivo com as regras de negócio, definições de cálculo e decisões de dados
do dashboard. Cada regra registra: **contexto**, **regra**, **implementação** (arquivo).

> Convenção: quando uma regra for corrigida, atualizar aqui **e** referenciar o commit.

---

## 🔧 Correções em andamento

_(As correções que o usuário está passando item a item entram aqui. Cada item vira uma
regra numerada abaixo quando definida.)_

| # | Item | Status | Valor IPTU 2026 |
|---|------|--------|-----------------|
| 1 | **Lançado** | ✅ | R$ 67,61 mi |
| 2 | **Arrecadado** | ✅ | R$ 36,60 mi |
| 3 | **Em Aberto** (a receber total) | ✅ | R$ 28,47 mi |
| 4 | **Inadimplente** (em aberto vencido) | ✅ | R$ 5,86 mi |
| 5 | **Suspenso** | ✅ | R$ 1,34 mi |
| 6 | **Isento** | ✅ | R$ 0,49 mi |

> ✅ **Reconciliação:** Arrecadado + Em Aberto + Isento + Suspenso ≈ Lançado
> (36,6 + 28,47 + 0,49 + 1,34 = 66,9 ≈ 67,61; diferença = cancelado/arredondamento).
> Inadimplente é SUBCONJUNTO de Em Aberto (a parte vencida), não soma.
> Todos os 6 buckets do IPTU migraram para o modelo `parcela_movimento`.

> 🌐 **Abrangência:** estas regras são fonte de verdade em TODAS as superfícies, não só nos KPIs:
> KPIs (`/api/imobiliario/kpis`), gráficos (`/api/imobiliario/graficos`),
> insights (`/api/imobiliario/insights`) e o **chat** (via `lib/regras-negocio.ts` → REGRA 4,
> injetada no system prompt com templates SQL adaptados ao agente).

---

## 1. Motor de tributos (lançado / arrecadado / inadimplência)

**Contexto:** os valores financeiros por tributo saem do livro-razão de parcelas, não do
`FATO_BIORC` (que não decompõe por tributo).

**Regra — cadeia de tabelas:**
`tb_dsod_parcela_posicao` (valores) → `tb_dsod_parcelas` (parcela/vencimento) → `tb_dsod_guias` (tributo/exercício).

**Regra 1 — LANÇADO (oficial, 2026-07):** vem de `tb_dsod_parcela_movimento.vl_movimento`, NÃO de
`parcela_posicao.vl_lancto`. Query de referência do usuário:
```
SUM(pm.vl_movimento)
FROM tb_dsod_guias g
  JOIN tb_dsod_parcelas p        ON p.cd_guia = g.cd_guia
  JOIN tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
  JOIN tb_dsod_tributos t        ON t.cd_tributo = g.cd_tributo
WHERE g.cd_tributo IN (1)                      -- IPTU
  AND g.no_exercicio_lancamento IN (2026)
  AND pm.cd_tipo_movimento <= 3                -- = IN (1,2,3); não há 0/negativos
  AND p.no_parcela <> 0                        -- exclui parcela 0
  AND g.ds_situacao NOT IN ('Recalculo','Validacao')
GROUP BY ...
```
Adaptações p/ o agente IQ (que quebra com `<=`, `<>` e literal de texto no WHERE):
`cd_tipo_movimento IN (1,2,3)`, `no_parcela NOT IN (0)`, e a exclusão de `Recalculo`/`Validacao`
feita por `GROUP BY g.ds_situacao` + filtro em JS.
**Validado:** IPTU 2026 = **R$ 67,61 mi** (era R$ 134,81 mi no modelo antigo).
⚠️ IPTU aqui = `cd_tributo` **1** apenas (o 25 = "IPTU Diferença Área" fica de fora — confirmar se deve entrar).

**Regras 2-6 — BUCKETS OFICIAIS DO IPTU (2026-07)**, todos sobre `parcela_movimento`, `cd_tributo IN (1)`,
`no_parcela <> 0`. Base comum: `guias → parcelas → parcela_movimento` (+ `parcela_baixas`/`tipo_baixa` quando indicado).

| Bucket | `cd_tipo_movimento` | `cd_tipo_lancamento` | Valor | Filtros extras |
|--------|--------------------|----------------------|-------|----------------|
| **2 Arrecadado** | `11,14` | `0,4,7,10` | `SUM(vl_movimento)` | exclui `tipo_baixa=28` (Estorno de Baixa) e guia `Recalculo/Validacao` |
| **3 Em Aberto** | `0,1,2,3,11,12,14,20` | `0,4,7,10,1` | `SUM(vl_movimento*no_sinal)` por devedor, `HAVING >0` | — (líquido = positivos: sem devedor negativo neste filtro) |
| **4 Inadimplente** | idem Em Aberto | idem | idem | apenas parcelas **vencidas** (`dt_vencimento < hoje`); é subconjunto do Em Aberto |
| **5 Suspenso** | `20` | — | `SUM(vl_movimento)` por devedor com `net<0` ≈ `-SUM(vl_movimento*no_sinal)` | — |
| **6 Isento** | `12,5` | `1` | `SUM(vl_movimento)` | `ds_setor_origem_baixa = 'Isencao'` |

**Adaptações p/ o agente IQ** (não aceita `<`,`>`,`<=`,`<>`, literal de texto no WHERE, subquery, `HAVING`, e capa em 5000 linhas):
- `cd_tipo_movimento <= 3` → `IN (1,2,3)`; `no_parcela <> 0` → `NOT IN (0)`; `tipo_baixa <> Estorno` → `cd_tipo_baixa NOT IN (28)`.
- Exclusão de `Recalculo/Validacao` e filtro `ds_setor_origem_baixa='Isencao'` → `GROUP BY` + filtro em JS.
- `HAVING >0` (Em Aberto) → validado que `SUM(net)` já = soma dos positivos (não há devedor negativo) → usa `SUM(net)` direto (1 linha).
- Inadimplente `dt_vencimento < hoje` → `GROUP BY YEAR/MONTH(dt_vencimento)` + classifica em JS (mesma query do Em Aberto).
- Suspenso `HAVING net<0` → validado ≈ `-SUM(net)` (movimento 20 é majoritariamente sinal negativo).

**Reconciliação (IPTU 2026):** Lançado 67,61 = Arrecadado 36,60 + Em Aberto 28,47 + Isento 0,49 + Suspenso 1,34 (+ cancelado). Inadimplente 5,86 ⊂ Em Aberto.

**Implementação:** `lib/tributo-engine.ts` — `lancadoOficial()` (Regra 1) e `bucketsIptu()` (Regras 2-6, cacheado).
⚠️ IPTU aqui = `cd_tributo` **1** apenas (o 25 "IPTU Diferença Área" fica de fora — confirmar).

## 2. Inadimplência × Em Aberto (split do saldo devedor)

**Contexto:** "Inadimplência" e "Em Aberto" saem do mesmo `vl_saldo`.

**Regra:** separa por **data de vencimento** da parcela (`tb_dsod_parcelas.dt_vencimento`):
- **Inadimplência** = saldo de parcelas **já vencidas** (`dt_vencimento` < hoje)
- **Em Aberto** = saldo de parcelas **a vencer** (`dt_vencimento` >= hoje)

**Nota técnica:** o agente IQ quebra com operador `<` no `WHERE`, então agrupa por
`YEAR(dt_vencimento)`/`MONTH(dt_vencimento)` e classifica em JS comparando com hoje.

**Implementação:** `lib/tributo-engine.ts` (`saldoVencidoAberto`). Usado nos KPIs do IPTU.

## 3. Grupos de tributo (`cd_tributo` → aba/sub-aba)

**Regra — mapa (de-para em `tb_dsod_tributos`):**
- **IPTU** = `[1, 25]` · **ITBI** = `[10]` · **ISSCC** = `[40, 17, 18]`
- **ISS/ISSQN** = `[3, 7, 8, 33, 70, 301, 302, 303, 304, 572]`
- **TFE** = `[2002]` · **TFHS** = `[2003]`
- **Outros Tributos** = demais códigos, EXCETO os operacionais abaixo.

**Regra — códigos operacionais EXCLUÍDOS de "Outros"/rankings** (não são tributo analisável):
`20` (DAM genérico, 4,8M linhas), `499/501/502` (parcelamento), `53/56` (restituições),
`210` (correção), `560/565` (novo/vazio), `568` (cauções), `-1` (não informado).

**Implementação:** `lib/tributos.ts`.

## 4. IPTU — KPIs (6 buckets monetários)

**Regra:** Total Lançado, Total Arrecadado, Total Inadimplência (saldo vencido),
Total em Aberto (saldo a vencer), Total Isento, Total Suspenso — todos do motor,
para o exercício selecionado. Não decomponíveis por faixa de venal → exibem "—" com
filtro de faixa ativo. (Imóveis/Valor Venal saíram dos KPIs em 2026-06.)

**Implementação:** `app/api/imobiliario/kpis/route.ts`.

## 5. Dívida Ativa

**Contexto:** o star schema `FATO_BIORC_POSICAO_DIVIDA` está VAZIO → usa-se a fonte operacional.

**Regra:** estoque de dívida = `SUM(vl_saldo)` de parcelas cujo `tb_dsod_parcelas.ds_situacao` ∈
`{DividaAtiva, Ajuizada, Em Ajuizamento}` (texto → filtra em JS). "Normal" = corrente, fora.
- **Administrativa** = `DividaAtiva` · **Judicial** = `Ajuizada` · **Em Ajuizamento** = idem.

**Implementação:** `lib/divida-engine.ts`.

## 6. Cobrança

**Regra:**
- **Conversão por tributo** = arrecadado ÷ lançado (exercício de referência: 2025).
- **Canais de arrecadação** = `tb_dsod_parcela_baixas.ds_setor_origem_baixa` (Febraban, Parcelamento, Internet, etc.).
- ⚠️ `cd_usuario_baixa` tem 5.188 valores (lote/sistema) → não usado como "operador".

**Implementação:** `lib/cobranca-engine.ts`.

## 7. ITBI

**Regra:** natureza da transação (`ds_natureza_transacao`) é suja/duplicada → classificada
por regex em JS. Arrecadado/inadimplência do motor; transmissões/movimentado/ticket de
`tb_dsod_itbi`. Arrecadado não decompõe por natureza → "—" com filtro de natureza.

**Implementação:** `lib/itbi-filtros.ts`, `app/api/itbi/*`.

## 7b. Chat — busca por texto e anti-alucinação (Regra 5 do prompt)

**Contexto:** o chat gerou uma análise falsa sobre um contribuinte ("Robinson Simões": CPF e
"120 débitos / cobrança judicial" inventados).

**Causa raiz (revisada):** a IA **alucinou** (inventou CPF e "120 débitos / judicial") e interpretou a
contagem de `tb_dsod_devedor_contribuinte` (tabela de vínculo, sem R$) como inadimplência.
⚠️ A hipótese inicial de que "o agente não aceita texto" estava ERRADA — era artefato do PowerShell
(ver "Restrições técnicas"). **Busca por texto FUNCIONA** (`nm_rsocial LIKE '%NOME%'`,
`no_cpf_cnpj = '053.628.458-02'`).

**Regra (corrigida):** (a) buscar pessoa por texto É permitido — `nm_rsocial LIKE`/`no_cpf_cnpj =`;
se vier vazio, dizer que não encontrou, NUNCA inventar; (b) contagem de `devedor_contribuinte` ≠ débitos
(é vínculo); "CobrancaAcumulada" ≠ judicial; (c) débito real = modelo `parcela_movimento` (Regra 4)
filtrando `cd_contr`/`cd_devedor`; judicial só via `ds_situacao 'Ajuizada'`.
**Implementação:** `lib/regras-negocio.ts` (REGRA 5).

## 8. Contribuintes

**Regra:**
- **PF × PJ** = `ic_pessoa` (F/J) · **Situação** = `ds_sit_cadast`.
- **Vínculos** = flags 0/1 em `tb_dsod_contribuinte_pessoa` (SUM = nº de contribuintes).
- **Devedores** = `COUNT(DISTINCT cd_contr)` por `ds_setor_devedor` (sem valor R$ na base).
  Exclui o setor "Contribuinte" (= base inteira).
- **Score de adimplência** = base − contribuintes em `CobrancaAcumulada`.
- ⚠️ Demografia (sexo/escolaridade/estado civil) é ~99% nula → descartada.

**Endereço (chat):** `tb_dsod_contribuinte_endereco` NÃO tem rua nem CEP real — `cd_cep` é código
interno e `no_logr` é o número da casa. Fazer JOIN com `tb_dsod_cep` (por `cd_cep`) para pegar
`ds_endereco` (logradouro), `nm_bairro`, `no_cep` (CEP real), `nm_mun`. Ver `lib/regras-negocio.ts` (REGRA 6).

**Implementação:** `app/api/contribuinte/*`.

## 9. Reforma Tributária

**Regra:** calculadora paramétrica do IBS sobre a base de serviços (`tb_dsod_nfse.vl_servicos`).
⚠️ 2021 é outlier de dado (base R$30 bi) → filtrado.

**Implementação:** `app/api/reforma/base/route.ts`, `app/reforma-tributaria/page.tsx`.

---

## 10. Orçamento / Receita — filtro oficial (Ronaldo)

**Regra:** o número OFICIAL de receita/arrecadação do painel de Orçamento usa este filtro
(vale em KPIs, gráficos, insights e no chat):

```sql
WHERE tn.CD_TIPO_NATUREZA_RECEITA = 1                     -- receita BRUTA
  AND f.CD_FICHA_RECEITA < 5000                           -- fichas orçamentárias
  AND nr.CD_CATEGORIA_ECONOMICA_RECEITA NOT IN ('-1','-3')-- exclui categorias inválidas
  AND d.NO_ANO >= 2023                                    -- a partir de 2023
```

- Sanidade: arrecadação **2025 = 739,4 mi**, 2024 = 655,3 mi, 2023 = 575,9 mi.
  Correntes 2025 = 692 mi · Capital 2025 = 47,4 mi.
- **Drill** do gráfico "Arrecadação por Categoria / Origem" (4 níveis, todos em `DIM_BIORC_NATUREZA_RECEITA`):
  `DS_CATEGORIA_ECONOMICA_RECEITA → DS_ESPECIE_RECEITA → DS_ALINEA_RECEITA → DS_NATUREZA_RECEITA`.
  O filtro "Impostos e Taxas" tem 2 níveis: `DS_ALINEA_RECEITA` (nível 1) → `DS_NATUREZA_RECEITA` (nível 2).
- **Diferença p/ a Regra 1 (bruta/deduções/líquida):** a Regra 1 é o detalhamento analítico
  (`IN (1,2)` = líquida). A Regra 10 é o total oficial exibido no painel (bruta com os filtros acima).

**Implementação:** `lib/receita-filtros.ts` (`WHERE_RECEITA_OFICIAL`, `ANO_MIN_RECEITA`),
`app/api/orcamento/{kpis,graficos,insights}/route.ts`, `app/dashboard/PainelReceita.tsx` (drill),
`lib/regras-negocio.ts` (REGRA 7 do chat).

---

## 11. Orçamento / Despesa — filtro oficial (unidades orçamentárias)

**Regra:** o painel de Despesa usa SEMPRE este filtro (KPIs, gráficos, insights, subelemento, fornecedores):

- `NO_ANO >= 2023`
- **Código Unidade Orçamentária** restrito às secretarias do executivo **02.01.00 a 02.19.00**
  (exclui a raiz `02.00.00` e o Legislativo `01.xx`).

O fato (`FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO`) é tagueado no nível de sub-unidade (`02.XX.YY`),
então o filtro é por faixa de `CD_UO` via subquery na `DIM_BIORC_INSTITUCIONAL`:

```sql
AND f.SK_INSTITUCIONAL IN (
  SELECT i.SK_INSTITUCIONAL FROM pref_aruja_sp.DIM_BIORC_INSTITUCIONAL i
  WHERE i.CD_UO >= '02.01.00' AND i.CD_UO <= '02.19.99')
```

Dotação (orçado) usa `SK_INSTITUCIONAL_EXECUCAO`; alteração e execução usam `SK_INSTITUCIONAL`.
Sanidade 2026: Dotação Inicial 724 mi · Atualizada 802,25 mi · Empenho 545,82 · Liquidado 366,19 · Pago 360,6 mi.

**Implementação:** `lib/despesa-filtros.ts` (`whereUO`, `ANO_MIN_DESPESA`, `whereExtra`),
`app/api/despesa/{kpis,graficos,insights,liquidado-subelemento,fornecedores,secretarias}/route.ts`.

---

## Restrições técnicas do agente IQ (transversais)

- ✅ **MITO DERRUBADO (2026-07):** o agente NÃO rejeita literal de texto, `<`, `>`, `<=`, `<>`, `HAVING`,
  subquery nem `getdate()`. Isso era **artefato do PowerShell** (`ConvertTo-Json` escapa `< > ' &` como
  `\uXXXX`, e o agente engasgava). Via **Node/`fetch`** (o caminho real do app, `lib/agent.ts`) o SQL
  passa inteiro — confirmado (`WHERE ds_situacao = 'Ativa'`, `< getdate()`, `HAVING`, subquery: todos OK).
  → Ao TESTAR o agente, use Node, nunca PowerShell `ConvertTo-Json`.
  → O código do dashboard usa `GROUP BY` + JS por herança dessa premissa errada — funciona e dá resultado
    correto (validado), mas PODE ser simplificado para as queries oficiais diretas quando conveniente.
- Tabelas grandes (guias 7,1M; parcela_posicao; devedor 4M) → agregar server-side; resultados pesados
  são cacheados (`lib/cache.ts`, TTL 1h) e pré-aquecidos no boot (`instrumentation.ts`).
