# Regras de Negócio — Dashboard Prefeitura de Arujá

Documento vivo com as regras de negócio, definições de cálculo e decisões de dados
do dashboard. Cada regra registra: **contexto**, **regra**, **implementação** (arquivo).

> Convenção: quando uma regra for corrigida, atualizar aqui **e** referenciar o commit.

---

## 🔧 Correções em andamento

_(As correções que o usuário está passando item a item entram aqui. Cada item vira uma
regra numerada abaixo quando definida.)_

| # | Item | Status | Definição |
|---|------|--------|-----------|
| 1 | **Lançado** (definição oficial) | ✅ implementado | `SUM(vl_movimento)` de `parcela_movimento`, `cd_tipo_movimento IN (1,2,3)`, `no_parcela <> 0`, guia `ds_situacao NOT IN ('Recalculo','Validacao')`. Ver Regra 1. |

> ⚠️ **Reconciliação pendente:** apenas o **Lançado** foi migrado para o modelo `parcela_movimento`.
> Arrecadado / Inadimplência / Em Aberto / Isento / Suspenso ainda vêm de `parcela_posicao`
> (modelo antigo), então os percentuais podem não fechar até essas regras serem passadas.

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

**Regra — demais buckets (AINDA no modelo antigo `parcela_posicao`, a corrigir):**
- **Arrecadado** = `SUM(vl_pagto)` · **Saldo devedor** = `SUM(vl_saldo)`
- **Isento** = `SUM(vl_isencao)` · **Suspenso** = `SUM(vl_suspenso)` · **Cancelado** = `SUM(vl_cancelamento)`
- ⚠️ `tb_dsod_parcelas.vl_*` está ZERADO — no modelo antigo os valores vinham de `parcela_posicao`.

**Implementação:** `lib/tributo-engine.ts` (`lancadoOficial` para o novo lançado; `serieTributo` p/ os demais), `lib/tributos.ts` (mapa de códigos).

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

## 8. Contribuintes

**Regra:**
- **PF × PJ** = `ic_pessoa` (F/J) · **Situação** = `ds_sit_cadast`.
- **Vínculos** = flags 0/1 em `tb_dsod_contribuinte_pessoa` (SUM = nº de contribuintes).
- **Devedores** = `COUNT(DISTINCT cd_contr)` por `ds_setor_devedor` (sem valor R$ na base).
  Exclui o setor "Contribuinte" (= base inteira).
- **Score de adimplência** = base − contribuintes em `CobrancaAcumulada`.
- ⚠️ Demografia (sexo/escolaridade/estado civil) é ~99% nula → descartada.

**Implementação:** `app/api/contribuinte/*`.

## 9. Reforma Tributária

**Regra:** calculadora paramétrica do IBS sobre a base de serviços (`tb_dsod_nfse.vl_servicos`).
⚠️ 2021 é outlier de dado (base R$30 bi) → filtrado.

**Implementação:** `app/api/reforma/base/route.ts`, `app/reforma-tributaria/page.tsx`.

---

## Restrições técnicas do agente IQ (transversais)

- **HTTP 500 com literal de TEXTO no `WHERE`** → filtros por texto viram `GROUP BY` + filtro em JS.
- **HTTP 500 com operadores `<` / `>`** → usar `BETWEEN`, `YEAR()`/`MONTH()`, ou classificar em JS.
- `cd_tributo` é numérico → `WHERE cd_tributo IN (...)` é seguro.
- Tabelas grandes (guias 7,1M; parcela_posicao; devedor 4M) → SEMPRE agregar server-side; resultados pesados são cacheados (`lib/cache.ts`, TTL 1h) e pré-aquecidos no boot (`instrumentation.ts`).
