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

### 7a. ITBI — Lançado (valor oficial, vale no chat)

**Regra:** o valor de **Lançado de ITBI** é sempre o do KPI **"Total Lançado"** da tela de ITBI
(Imobiliário) — não adaptar a regra do IPTU por conta própria, o ITBI tem ponte própria e um
filtro a mais.

```sql
SELECT g.no_exercicio_lancamento AS ex, SUM(pm.vl_movimento) AS lancado
FROM pref_aruja_sp.tb_dsod_guias g
JOIN pref_aruja_sp.tb_dsod_itbi it ON it.cd_itbi = g.cd_origem   -- ponte 1:1 (NÃO existe g.cd_itbi)
JOIN pref_aruja_sp.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
JOIN pref_aruja_sp.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
WHERE g.cd_tributo = 10
  AND pm.cd_tipo_movimento IN (1,2,3)
  AND p.no_parcela <> 0
  AND g.ds_situacao NOT IN ('Recalculo','Validacao')
  AND it.vl_total > 0                                            -- só ITBI COM imposto
GROUP BY g.no_exercicio_lancamento
```

Obrigatórios: ponte por `cd_origem`; `it.vl_total > 0` (filtro exclusivo do ITBI); ano =
`no_exercicio_lancamento` (**nunca** `dt_geracao` — guia de 2025 pode ser reemitida em 2026);
**nunca** juntar `tb_dsod_itbi_imovel_urbano` em agregado de valor (é 1:N e infla).
Mês/YTD: `AND MONTH(p.dt_vencimento) <= <mês>`.

⚠️ **O lançado oficial INCLUI guias Canceladas** (só exclui Recalculo/Validacao) — e no ITBI isso
é enorme. Verificado ao vivo em 2026: **Cancelada R$ 16,89 mi (56,7%) × Ativa R$ 12,89 mi (43,3%)**,
ou seja mais da metade do "lançado" é guia cancelada. Por isso a tela mostra **dois** KPIs, e o chat
deve fazer o mesmo: `Total Lançado` (oficial) + `Lançado (Guias Ativas)` (mesma query com
`AND g.ds_situacao = 'Ativa'`). Nunca entregar só o número cheio sem a ressalva.

**Sanidade (base do IQ, 25/08/2026)** — Total Lançado / Lançado Ativas:
2022 = 39,03 / 12,05 mi · 2023 = 54,77 / 17,46 mi · 2024 = 64,30 / 28,49 mi ·
2025 = 46,86 / 31,46 mi · **2026 = 29,77 / 12,89 mi** (−36,5% vs 2025).

**Implementação:** `lib/itbi-engine.ts` (`bucketsItbi`/`bucketsItbiAteMes`),
`app/api/itbi/visao/route.ts`, `app/imobiliario/PainelItbi.tsx`,
`lib/regras-negocio.ts` (REGRA 10 — injetada no system prompt do chat).

### 7b. ITBI por Bairro / Rua / Imóvel — valores E quantidades (vale no chat)

**Regra:** valor ou quantidade de ITBI por bairro/rua/imóvel usa exatamente a regra do gráfico
**"ITBI por Bairro"**. Para IPTU por bairro vale a REGRA 8 — **a ponte do ITBI é diferente**.

⚠️ **`g.cd_devedor` NÃO é o imóvel no ITBI.** No IPTU `g.cd_devedor = cd_imovel_urbano`; no ITBI é o
**contribuinte**. Usar como imóvel casa por coincidência de ID, derruba ~94% dos registros e atribui
bairro errado (bug real já corrigido). Medido em 2026: errado = **41 imóveis / R$ 1,66 mi** vs
correto = **655 imóveis / R$ 29,70 mi**.

**Ponte oficial:** `g.cd_origem = it.cd_itbi` → `tb_dsod_itbi_imovel_urbano` → `cd_imovel_urbano`
→ `tb_dsod_imovel_urbano` → `tb_dsod_cep` (`nm_bairro` / `ds_endereco`).

⚠️ `tb_dsod_itbi_imovel_urbano` é **1:N** → juntar direto causa **fan-out e infla o SUM** (2026:
R$ 29.744.826,12 inflado × R$ 29.696.574,62 correto). Obrigatório colapsar para 1 imóvel por
transmissão:

```sql
JOIN (SELECT cd_itbi, MIN(cd_imovel_urbano) cd_imovel_urbano
        FROM pref_aruja_sp.tb_dsod_itbi_imovel_urbano GROUP BY cd_itbi) iiu
  ON iiu.cd_itbi = it.cd_itbi
```

Demais obrigatórios: `it.vl_total > 0`; `g.cd_tributo = 10`; `no_exercicio_lancamento = <ano>`;
`p.no_parcela <> 0`. **Quantidade = `COUNT(DISTINCT iiu.cd_imovel_urbano)`** (nunca `COUNT(*)` — com
parcelas/movimentos no FROM isso conta linhas de movimento). Drill: `c.nm_bairro` → `c.ds_endereco`
→ `iiu.cd_imovel_urbano`.

Métricas espelham `bucketsItbi`: **lançado** `pm.cd_tipo_movimento <= 3` + fora de
Recalculo/Validacao · **arrecadado** mov 11,14 · lanç 0,4,7,10 · exclui `Estorno de Baixa`
**e também `Cancelada`** (diferente do lançado) · **isento** = `Não Incidência de ITBI` via
`tb_extr_isencoes` · **suspenso** mov 20 · **em aberto / inadimplência** = net por
(imóvel, devedor, vencimento) `HAVING > 0` / `> 1` (inadimplência é subconjunto do em aberto).

⚠️ **A soma dos bairros não fecha com o KPI da seção 7a**: a ponte de imóvel é INNER JOIN, então
transmissão sem imóvel/CEP resolvido fica fora. Medido em 2026: bairros **R$ 29.696.574,62** ×
KPI Total Lançado **R$ 29.773.974,62** → diferença **R$ 77.400,00 (0,26%)**. Não apresentar o total
por bairro como lançado do município nem "corrigir" a diferença.

⚠️ **O ranking de bairros muda por completo conforme a métrica.** Nunca reaproveitar o ranking de
uma métrica para responder sobre outra, nem responder "qual bairro tem mais ITBI" sem fixar a
métrica. Em 2026 o líder de **lançado** é ARUJÁ 5, mas o de **inadimplência** é
**CONDOMINIO ARUJAZINHO III** — escalas totalmente diferentes (R$ 29,70 mi em 73 bairros ×
R$ 349.993,95 em 16 bairros).

**Sanidade (base do IQ, 25/08/2026):**

| Métrica / ano | Cobertura | Líder |
|---|---|---|
| Lançado 2026 | 73 bairros · 655 imóveis · R$ 29.696.574,62 | ARUJÁ 5 = 32 imóveis / R$ 5.761.356,85 |
| Inadimplência 2026 | 16 bairros · 29 imóveis · R$ 349.993,95 | **CONDOMINIO ARUJAZINHO III = 1 imóvel / R$ 77.243,25** |
| Inadimplência 2025 | 7 bairros · 7 imóveis · R$ 7.396.150,68 | RESIDENCIAL REAL PARK ARUJÁ = 1 imóvel / R$ 7.284.188,35 |

Lançado 2026 (demais): CONDOMINIO ARUJAZINHO IV = 24 / R$ 5.280.215,38 · LIMOEIRO = 19 /
R$ 3.583.485,39 · CONDOMINIO NOVO HORIZONTE = 9 / R$ 2.898.622,57 · CENTRO INDUSTRIAL DE ARUJA =
5 / R$ 1.666.383,27.
Inadimplência 2026 (demais): ARUJA CENTER VILLE = 5 / R$ 58.544,34 · CONDOMINIO ARUJAZINHO IV =
1 / R$ 43.200,00 · CHACARAS SÃO JOSÉ DO ARUJÁ = 2 / R$ 36.144,24 · PARQUE RODRIGO BARRETO = 7 /
R$ 30.298,76 · JARDIM PLANALTO = 2 / R$ 16.988,66.

⚠️ **A inadimplência de ITBI é altamente concentrada** — poucos imóveis, valores enormes num só.
Em 2025 **um único imóvel responde por 98,5%** da inadimplência do ano. Ao citar bairro mais
inadimplente, informar **sempre** a quantidade de imóveis: liderar com 1 imóvel é muito diferente
de liderar com dezenas — não descrever como problema disseminado do bairro o que é uma única
transmissão em atraso.

**Implementação:** `lib/itbi-agg.ts` (`bairrosItbi`), `app/api/itbi/bairros/route.ts`,
`app/imobiliario/PainelItbi.tsx`, `lib/regras-negocio.ts` (REGRA 11 — no system prompt do chat).

### 7c. Transmissão de imóveis e valor venal (vale no chat)

**Regra:** contagem de transmissões e valor venal usam as regras dos cards **"Imóveis mais
transmitidos"** e **"Consultar Imóvel"**. Fonte = `tb_dsod_itbi` (it) + `tb_dsod_itbi_imovel_urbano`
(iiu) — **não passa por `tb_dsod_guias`** (é o cadastro da transmissão, não o lançamento do imposto).

`TRANSMISSÃO = COUNT(DISTINCT it.cd_itbi)`, sempre com `it.vl_total > 0`.

⚠️ **A coluna de data aqui é `it.dt_lancamento`** — *não* `no_exercicio_lancamento` da guia
(seções 7a/7b). Medido em 2026: **798** transmissões por `dt_lancamento` × **760** por exercício da
guia (38 de diferença). Para contar transmissão, usar `dt_lancamento`.

⚠️ **Aqui a ponte 1:N NÃO é colapsada** (o oposto da seção 7b): junta-se
`tb_dsod_itbi_imovel_urbano` direto, porque a unidade é **imóvel × transmissão** — um ITBI que cobre
2 imóveis conta 1 transmissão para cada. **Consequência:** `SUM(it.vl_venal)` agrupado por imóvel
repete o venal do ITBI em cada imóvel dele (**34 ITBIs têm mais de um imóvel**), então "venal total"
vale **por imóvel** e nunca somado entre imóveis.

Colunas de valor em `tb_dsod_itbi`: `vl_venal` (valor venal) · `vl_aquisicao_original` (valor
declarado) · `pc_aliquota` · `vl_total` (imposto).

**Faixas do card:** `HAVING COUNT(DISTINCT it.cd_itbi)` `= 1` / `= 2` / `BETWEEN 3 AND 5` / `>= 6`.

**Faixa "Valor ≤ venal":** `vl_venal > 0 AND vl_aquisicao_original <= vl_venal`, contagem
`COUNT(DISTINCT iiu.cd_imovel_urbano)`. Significa que o ITBI foi calculado **sobre o venal**, pois a
base é o maior entre venal e declarado — **regra normal de apuração**. ⚠️ Nunca descrever como
sonegação/subdeclaração/fraude.

**Consultar Imóvel:** transmissões via `iiu.cd_imovel_urbano = <id> AND it.vl_total > 0`, **sem
filtro de ano** (histórico sempre completo). ⚠️ A data exibida é **`it.dt_transacao`** (terceira
coluna de data do módulo, ≠ `dt_lancamento` das contagens, ≠ `dt_vencimento`). Imposto por
transmissão vem do **livro-razão** (`g.cd_origem = cd_itbi`, mov 1,2,3, `no_parcela <> 0`, fora de
Recalculo/Validacao), não de `vl_total`. Valorização do venal = (venal mais recente − venal mais
antigo) ÷ venal mais antigo, só transmissões com `vl_venal > 0`. Partes em
`cd_contr_transmitente`/`cd_contr_adquirente` (fallback de nome: `it.nm_transmitente`).
Proprietário = `i.cd_contr_proprietario`; se espólio, possuidor de fato = `i.cd_contr_posseiro`.

**Sanidade (base do IQ, 25/08/2026 — 2026 por `dt_lancamento`, 798 transmissões):** distribuição
1 = 578 imóveis · 2 = 72 · 3–5 = 16 · 6+ = 2 · "Valor ≤ venal" = **151 imóveis**. Mais transmitidos:
imóvel **3264** (NE11140617.000) = **14** transmissões / venal R$ 1.285.970,14 · 6662 = 9 /
R$ 210.159,42 · 28890 = 5 / R$ 23.799.913,75 · 32945 = 4 / R$ 1.584.655,42 · 18739 = 4 /
R$ 212.446,40. Note que **quantidade e venal rankeiam diferente** (28890 tem 5 transmissões mas o
maior venal) — ao dizer "imóvel mais transmitido", deixar claro que o critério é a quantidade.

**Implementação:** `app/api/itbi/ranking-imovel/route.ts`,
`app/api/itbi/transmissoes-faixa/route.ts`, `app/api/itbi/imovel/route.ts`,
`app/imobiliario/PainelItbi.tsx`, `lib/regras-negocio.ts` (REGRA 12 — no system prompt do chat).

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

## 9. Reforma Tributária — Base de Serviços (valor oficial, vale no chat)

**Regra:** o valor de **Base de Serviços** é sempre o do KPI da tela de Reforma Tributária —
não existe cálculo alternativo. Fonte `pref_aruja_sp.tb_dsod_nfse` (1 linha = 1 NFS-e):
`base = SUM(vl_servicos)` · `ISS = SUM(vl_imposto)` · `qt = COUNT(*)` · ano = `YEAR(dt_emissao)`.

Os **dois filtros são obrigatórios** — sem eles o número sai errado:

1. **Janela de anos:** `YEAR(dt_emissao) BETWEEN 2020 AND 2026`. A coluna `dt_emissao` tem datas
   digitadas erradas que criam anos-lixo (verificado ao vivo: 1997, 2031, 2069, 2077, 2085, 2088,
   2100, 2102, 2103, 2201, 2207–2209, 2910, 2911, 3010–3013).
2. **Descarte de ano-outlier:** `HAVING SUM(vl_servicos) / COUNT(*) < 50000`. Ano com valor médio
   por nota implausível é erro de carga e sai **inteiro**. ⚠️ Caso real: **2021** tem base
   R$ 30,39 bi com média de R$ 107.777/nota (normal é R$ 3–5 mil) → descartado. A série fica com
   buraco em 2021 de propósito; não interpolar nem estimar.

```sql
SELECT YEAR(dt_emissao) AS ano, COUNT(*) AS qt,
       SUM(vl_servicos) AS base, SUM(vl_imposto) AS iss
FROM pref_aruja_sp.tb_dsod_nfse
WHERE YEAR(dt_emissao) BETWEEN 2020 AND 2026
GROUP BY YEAR(dt_emissao)
HAVING SUM(vl_servicos) / COUNT(*) < 50000
ORDER BY ano
```

O KPI exibe sempre o **ano mais recente que passa nos dois filtros** (hoje = 2026).
`Alíquota ISS Efetiva = ISS ÷ base`. O **IBS Municipal Potencial** é *simulação* paramétrica
(base × alíquota do slider) — nunca apresentar como valor apurado/arrecadado.

**Sanidade (base do IQ, 25/08/2026):** 2020 = 657,01 mi (224.982 NFS-e) · 2022 = 1,73 bi (341.507) ·
2023 = 1,59 bi (466.597) · 2024 = 1,86 bi (533.714) · 2025 = 1,96 bi (639.010) ·
**2026 = 2,01 bi (455.332), ISS 68,33 mi, alíq. efetiva 3,40%**.

Não usar para base de serviços: `tb_dsod_nfse_item`, `tb_dsod_nfse_parcela`, `FATO_BIORC_*` nem o
lançado/arrecadado de ISS da REGRA 4 — são outras métricas e divergem do KPI.

**Implementação:** `app/api/reforma/base/route.ts`, `app/reforma-tributaria/page.tsx`,
`lib/regras-negocio.ts` (REGRA 9 — injetada no system prompt do chat).

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

## 12. 🚫 ESCOPO — Câmara Municipal de Arujá FORA do painel (regra restritiva)

**Contexto:** o dashboard é do **poder Executivo** (Prefeitura). A **Câmara Municipal de Arujá**
é poder **Legislativo**, órgão autônomo com orçamento e prestação de contas próprios — misturar
os dois infla totais e induz a leitura errada em comunicação oficial.

**Regra (ABSOLUTA, vale em todas as superfícies — painéis, insights, relatórios e chat):**

- **NUNCA** exibir valores, totais, análises, rankings ou comparações da Câmara Municipal.
- **NUNCA** citar a Câmara nem como linha de tabela, nem como observação/parêntese.
- No **chat**: se a pergunta for sobre a Câmara ("quanto a Câmara gastou?", "orçamento do
  Legislativo", "repasse para a Câmara"), **não executar a query** — responder que o painel
  cobre somente o Executivo e indicar o Portal da Transparência da Câmara.
- Em perguntas gerais (total do orçamento, despesa por órgão, maiores fornecedores), o filtro
  é **obrigatório** — sem ele o total sai somado com o Legislativo.
- Se a consulta não permitir amarrar o institucional, **dizer que não é possível garantir a
  exclusão** em vez de devolver o número.

**Identificação (validado na base):** `DIM_BIORC_INSTITUCIONAL.CD_ORGAO` — `'1'` = PREFEITURA
MUNICIPAL DE ARUJÁ (79 UOs), `'2'` = CÂMARA MUNICIPAL DE ARUJÁ (16 UOs). `CD_ORGAO` é
**VARCHAR** → sempre com aspas simples.

```sql
JOIN pref_aruja_sp.DIM_BIORC_INSTITUCIONAL i ON f.SK_INSTITUCIONAL = i.SK_INSTITUCIONAL
WHERE i.CD_ORGAO = '1'   -- só Executivo; NUNCA '2'
```

Vale para `FATO_BIORC_EXECUCAO_RECEITA` e `FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO` (ambas têm
`SK_INSTITUCIONAL`); em `FATO_BIORC_ELABORACAO_ORCAMENTO` a coluna é `SK_INSTITUCIONAL_EXECUCAO`.

> ℹ️ Os painéis de **Despesa** já excluem o Legislativo por outro caminho (faixa de `CD_UO`
> `02.01.00`–`02.19.99`, ver Regra 11) — esta regra 12 cobre o **chat** e qualquer consulta
> nova que não passe por `whereUO()`.

**Implementação:** `lib/regras-negocio.ts` (REGRA 0 — prioridade máxima no system prompt),
`app/api/chat/route.ts` (seção DIM_BIORC_INSTITUCIONAL), `lib/despesa-filtros.ts` (`whereUO`).

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
