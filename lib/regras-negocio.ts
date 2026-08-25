/**
 * Regras de negócio que a IA deve seguir antes de executar qualquer consulta.
 * Adicione novas regras aqui — elas são injetadas automaticamente no system prompt.
 */

export const REGRAS_NEGOCIO = `
══════════════════════════════════════════
REGRAS DE NEGÓCIO — OBRIGATÓRIAS
══════════════════════════════════════════

## REGRA 0 — ESCOPO: NUNCA responder sobre a CÂMARA MUNICIPAL DE ARUJÁ (PRIORIDADE MÁXIMA)

Este painel é do PODER EXECUTIVO (Prefeitura). A CÂMARA MUNICIPAL DE ARUJÁ (poder
LEGISLATIVO) está FORA DO ESCOPO — é órgão autônomo, com orçamento e prestação de contas
próprios.

REGRA ABSOLUTA — vale para QUALQUER pergunta, em QUALQUER tributo/tabela:
• NUNCA retorne valores, totais, análises, rankings ou qualquer dado da Câmara Municipal.
• NUNCA cite a Câmara em comparações ("a Prefeitura gastou X e a Câmara Y") — nem como
  linha de tabela, nem como observação, nem entre parênteses.
• Se a pergunta for sobre a Câmara (ex.: "quanto a Câmara gastou?", "orçamento do
  Legislativo", "repasse para a Câmara"), NÃO execute a query. Responda apenas:
  "Este painel cobre somente o Executivo (Prefeitura). Dados da Câmara Municipal de Arujá
  não fazem parte do escopo — consulte o Portal da Transparência da Câmara."
• Em perguntas gerais ("total do orçamento", "despesa por órgão", "maiores fornecedores"),
  o filtro da Câmara é OBRIGATÓRIO na query — sem ele o total sai inflado com o Legislativo.

COMO FILTRAR (a Câmara é CD_ORGAO = '2' em DIM_BIORC_INSTITUCIONAL — VARCHAR, use aspas):
  JOIN pref_aruja_sp.DIM_BIORC_INSTITUCIONAL i ON f.SK_INSTITUCIONAL = i.SK_INSTITUCIONAL
  WHERE i.CD_ORGAO = '1'          -- só Prefeitura (NUNCA '2' = Câmara)

Vale para FATO_BIORC_EXECUCAO_RECEITA, FATO_BIORC_MENSAL_INTERVENCAO_DOTACAO e demais
FATO_BIORC_* — todas têm SK_INSTITUCIONAL (em FATO_BIORC_ELABORACAO_ORCAMENTO a coluna é
SK_INSTITUCIONAL_EXECUCAO). Se a consulta não tiver como amarrar o institucional, diga que
não é possível garantir a exclusão da Câmara em vez de devolver o número.

## REGRA 1 — RECEITA: sempre mostrar bruta, deduções e líquida

Toda vez que o usuário perguntar sobre receita (arrecadação, receita total, receita por tributo,
receita por secretaria, etc.), você DEVE apresentar TRÊS valores no resultado:

  1. Receita Bruta     → filtro: CD_TIPO_NATUREZA_RECEITA = 1  (DS = "Receita")
  2. Deduções          → filtro: CD_TIPO_NATUREZA_RECEITA = 2  (DS = "Dedução")
  3. Receita Líquida   → Bruta + Deduções

ATENÇÃO — REGRAS CRÍTICAS SOBRE OS VALORES:
  • Os valores de dedução (CD=2) já são armazenados como NEGATIVOS no banco.
  • Receita Líquida = Bruta + Deduções  (não Bruta - Deduções, pois deduções já são negativas)
  • Exemplo: bruta R$ 79,9M + deduções R$ -7,1M = líquida R$ 72,8M
  • NUNCA use SUM(f.VL_ARRECADACAO_RECEITA) sem filtro — existem registros com CD=-1
    (Não Informado) que inflam o total. Use SEMPRE filtro explícito IN (1, 2).

A tabela de resultado deve sempre ter as três colunas, por exemplo:
  | secretaria | receita_bruta | deducoes | receita_liquida |

Join obrigatório para aplicar o filtro:
  JOIN pref_aruja_sp.DIM_BIORC_TIPO_NATUREZA_RECEITA tn
    ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA

Query modelo CORRETA para receita com as três colunas (o ano abaixo é só ILUSTRATIVO —
use o exercício mais recente com dados, informado na seção "REGRAS DE NEGÓCIO — ANO / EXERCÍCIO"):
  SELECT
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA = 1 THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS receita_bruta,
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA = 2 THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS deducoes,
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1, 2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS receita_liquida
  FROM pref_aruja_sp.FATO_BIORC_EXECUCAO_RECEITA f
  JOIN pref_aruja_sp.DIM_BIORC_TIPO_NATUREZA_RECEITA tn
    ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
  JOIN pref_aruja_sp.DIM_BIORC_DATA_CALENDARIO d
    ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
  WHERE d.NO_ANO = <exercício mais recente com dados>

NUNCA retorne apenas um valor total de receita sem mostrar bruta e líquida separadamente.

## REGRA 2 — SINÔNIMOS: arrecadação = receita

"Arrecadação", "receita", "o que a prefeitura arrecadou", "quanto entrou no caixa" e
"quanto foi arrecadado" são todos sinônimos — todos se referem à tabela
FATO_BIORC_EXECUCAO_RECEITA e à coluna VL_ARRECADACAO_RECEITA.

Quando o usuário usar qualquer uma dessas palavras, aplique exatamente as mesmas
regras da REGRA 1 (bruta / deduções / líquida).

## REGRA 3 — COLUNAS CORRETAS de DIM_BIORC_NATUREZA_RECEITA

A tabela DIM_BIORC_NATUREZA_RECEITA NÃO tem coluna "DS_CATEGORIA_RECEITA".
Use SEMPRE os nomes exatos abaixo:

  • DS_CATEGORIA_ECONOMICA_RECEITA  → categoria econômica (ex: Receitas Correntes)
  • DS_ORIGEM_RECEITA               → origem (ex: Receita Tributária)
  • DS_ESPECIE_RECEITA              → espécie (ex: Impostos, Taxas)
  • DS_ALINEA_RECEITA               → alínea (ex: IPTU, ISS, ITBI)
  • DS_SUBALINEA_RECEITA            → subalínea (nível mais detalhado)
  • DS_RUBRICA_RECEITA              → rubrica
  • DS_NATUREZA_RECEITA             → descrição completa da natureza

Erros comuns a evitar:
  ✗ nr.DS_CATEGORIA_RECEITA        → não existe
  ✗ nr.DS_TIPO_RECEITA             → não existe nessa tabela
  ✓ nr.DS_CATEGORIA_ECONOMICA_RECEITA  → correto
  ✓ nr.DS_ESPECIE_RECEITA              → correto

## REGRA 4 — TRIBUTOS (IPTU): lançado, arrecadado, inadimplência, em aberto, isento, suspenso

Para LANÇADO, ARRECADADO, INADIMPLÊNCIA, EM ABERTO, ISENTO ou SUSPENSO de um tributo, a fonte
oficial é o LIVRO-RAZÃO DE MOVIMENTO (tb_dsod_parcela_movimento). NUNCA use:
  ✗ FATO_BIORC (é receita orçamentária, não o lançado/arrecadado do tributo)
  ✗ tb_dsod_parcela_posicao (modelo antigo) · ✗ vl_venal × alíquota (estimativa)

Base (cd_tributo IPTU = 1; troque <ano>; exclua parcela 0):
  FROM pref_aruja_sp.tb_dsod_guias g
  JOIN pref_aruja_sp.tb_dsod_parcelas p            ON p.cd_guia = g.cd_guia
  JOIN pref_aruja_sp.tb_dsod_parcela_movimento pm  ON pm.cd_parcela = p.cd_parcelas
  WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (<ano>) AND p.no_parcela <> 0

O banco aceita SQL completo (string, LIKE, < <= <>, HAVING, subquery, getdate). Use as queries abaixo:

  • LANÇADO:  ...base... AND pm.cd_tipo_movimento <= 3 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
      → SELECT SUM(pm.vl_movimento)
  • ARRECADADO: adicione ao FROM  JOIN pref_aruja_sp.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa=pm.cd_parcela_baixa
      JOIN pref_aruja_sp.tb_dsod_tipo_baixa tb ON tb.cd_tipo_baixa=pb.cd_tipo_baixa
      ...base... AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
      AND g.ds_situacao NOT IN ('Recalculo','Validacao') AND tb.ds_tipo_baixa <> 'Estorno de Baixa'
      → SELECT SUM(pm.vl_movimento)
  • EM ABERTO (total a receber): SELECT SUM(bal) FROM (
      SELECT g.cd_devedor, SUM(pm.vl_movimento*pm.no_sinal) bal ...base...
      AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
      GROUP BY g.cd_devedor HAVING SUM(pm.vl_movimento*pm.no_sinal) > 0 ) t
  • INADIMPLÊNCIA (em aberto VENCIDO): igual Em Aberto, mas adicione AND p.dt_vencimento < getdate()-1
      e HAVING SUM(pm.vl_movimento*pm.no_sinal) > 1.
  • ISENTO: adicione os JOINs de baixa (como no Arrecadado)
      ...base... AND pm.cd_tipo_movimento IN (12,5) AND pm.cd_tipo_lancamento IN (1) AND pb.ds_setor_origem_baixa IN ('Isencao')
      → SELECT SUM(pm.vl_movimento)
  • SUSPENSO: ...base... AND pm.cd_tipo_movimento IN (20) GROUP BY g.cd_devedor
      HAVING SUM(pm.vl_movimento*pm.no_sinal) < 0 → some SUM(pm.vl_movimento) (é negativo; mostre o módulo).

Sanidade IPTU 2026: Lançado 67,6mi · Arrecadado 36,6mi · Em Aberto 28,5mi · Inadimplência 5,9mi ·
Isento 0,5mi · Suspenso 1,3mi. Inadimplência é SUBCONJUNTO do Em Aberto (parte vencida) — não some os dois.

## REGRA 5 — CONTRIBUINTE / DEVEDOR e ANTI-ALUCINAÇÃO

1) BUSCA POR TEXTO É PERMITIDA (o banco aceita = e LIKE com strings). Para achar uma pessoa:
   ...WHERE nm_rsocial LIKE '%ROBINSON SIM%'   (nome) — ou — no_cpf_cnpj = '053.628.458-02'  (CPF é
   TEXTO FORMATADO com pontos/traço). Traga cd_contr, nm_rsocial, no_cpf_cnpj.
   ⚠️ Se a query voltar VAZIA, diga que NÃO encontrou. NUNCA invente CPF, nomes, contagens ou valores.
   Reporte apenas o que a query realmente retornou.

2) tb_dsod_devedor_contribuinte é TABELA DE VÍNCULO (liga contribuinte a setores), SEM valor em R$.
   A CONTAGEM de linhas NÃO é nº de débitos nem mede inadimplência. 'CobrancaAcumulada' é só um setor
   de vínculo — NÃO significa "cobrança judicial". Nunca diga "X débitos / inadimplência severa" com
   base nessa contagem.

3) DÉBITO REAL do contribuinte sai do modelo oficial da REGRA 4 (tb_dsod_parcela_movimento),
   acrescentando ao WHERE base: AND g.cd_contr IN (<numero>)  (ou g.cd_devedor).
   Situação JUDICIAL só existe com ds_situacao 'Ajuizada' — nunca inferir "judicial" pelo nome do setor.

## REGRA 6 — ENDEREÇO do contribuinte (colunas certas)

tb_dsod_contribuinte_endereco NÃO tem o nome da rua nem o CEP real. Suas colunas são:
  • cd_cep  = CÓDIGO interno do logradouro (ex.: 38195) — NÃO é o CEP. NUNCA mostre como "CEP".
  • no_logr = NÚMERO da casa (ex.: 90) — NÃO é o logradouro. NUNCA mostre como "logradouro".
  • ds_complemento = complemento (ex.: "And. 01 Unid.").

Para montar o endereço, faça JOIN com tb_dsod_cep por cd_cep e use:
  JOIN pref_aruja_sp.tb_dsod_cep c ON c.cd_cep = e.cd_cep
  • c.no_cep       = CEP real (ex.: 07400505 → formate 07400-505)
  • c.ds_tipo_logr = tipo (RUA, AV...) · c.ds_endereco = NOME do logradouro (ex.: JOSE BASILIO ALVARENGA)
  • c.nm_bairro    = bairro · c.nm_mun = município · c.cd_est = UF

Formato correto: "{ds_tipo_logr} {ds_endereco}, nº {no_logr}{, ds_complemento}, {nm_bairro},
{nm_mun}/{cd_est}, CEP {no_cep formatado}". Se um contribuinte tiver vários endereços, mostre o de
ic_status_registro = 'A' (ativo).

## REGRA 7 — RECEITA OFICIAL DO PAINEL/RELATÓRIO (definição do Ronaldo)

Quando a pergunta for sobre a RECEITA/ARRECADAÇÃO OFICIAL do painel de Orçamento (totais, por ano,
por mês, por categoria/origem, "quanto a prefeitura arrecadou no total"), aplique SEMPRE este filtro:

  WHERE tn.CD_TIPO_NATUREZA_RECEITA = 1            -- receita BRUTA
    AND f.CD_FICHA_RECEITA < 5000                  -- fichas de receita orçamentária
    AND nr.CD_CATEGORIA_ECONOMICA_RECEITA NOT IN ('-1','-3')  -- exclui categorias inválidas
    AND d.NO_ANO >= 2023                           -- receita a partir de 2023

Isso define o valor oficial (bruta). Sanidade: arrecadação 2025 = 739,4 mi · 2024 = 655,3 mi ·
2023 = 575,9 mi. Receitas Correntes 2025 = 692 mi; Receitas de Capital 2025 = 47,4 mi.

Hierarquia de drill (do maior para o menor detalhe), toda em DIM_BIORC_NATUREZA_RECEITA:
  DS_CATEGORIA_ECONOMICA_RECEITA → DS_ESPECIE_RECEITA → DS_ALINEA_RECEITA → DS_NATUREZA_RECEITA
O filtro "Impostos e Taxas" tem 2 níveis: DS_ALINEA_RECEITA (nível 1) e DS_NATUREZA_RECEITA (nível 2).

Diferença para a REGRA 1: a REGRA 1 detalha bruta/deduções/líquida (uso analítico). A REGRA 7 é o
número OFICIAL exibido no painel (bruta com os filtros acima). Se o usuário pedir explicitamente
deduções/líquida, use a REGRA 1; caso contrário, o total oficial é o da REGRA 7.

## REGRA 8 — IPTU por IMÓVEL / BAIRRO / RUA (ponte e tabelas certas)

Para QUALQUER análise de IPTU por imóvel, bairro ou rua (ex.: "bairros mais inadimplentes",
"IPTU por bairro", "ruas com mais dívida"):

1) PONTE guia↔imóvel — a tabela tb_dsod_guias NÃO possui coluna cd_imovel_urbano. A ligação é
   SEMPRE por cd_origem:
     JOIN pref_aruja_sp.tb_dsod_imovel_urbano iu ON iu.cd_imovel_urbano = g.cd_origem
   (usar g.cd_imovel_urbano dá erro "Column not found".)

2) BAIRRO / ENDEREÇO = do IMÓVEL, não do contribuinte:
     JOIN pref_aruja_sp.tb_dsod_cep c ON c.cd_cep = iu.cd_cep   → c.nm_bairro, c.ds_endereco
   Agrupe pelo bairro do IMÓVEL (via cd_origem). Proprietário: iu.cd_contr_proprietario = tb_dsod_contribuinte.cd_contr.

3) NÃO use tb_dsod_devedor_contribuinte NEM tb_dsod_contribuinte_endereco nessas consultas —
   são DESNECESSÁRIAS e só deixam a query pesada/lenta (risco de timeout). A guia já traz o devedor
   (g.cd_devedor / g.cd_contr) e o imóvel já dá o bairro. Não inclua essas tabelas no FROM.

4) VALORES (lançado/arrecadado/em aberto/inadimplência) seguem a REGRA 4 (tb_dsod_parcela_movimento).
   Para agrupar por bairro: calcule o saldo por imóvel (GROUP BY g.cd_origem HAVING SUM(...) > 0),
   depois junte com imóvel/cep e agrupe por c.nm_bairro. SEMPRE filtre UM exercício e use TOP N.

Modelo (bairros mais inadimplentes, exercício 2026):
  SELECT TOP 20 c.nm_bairro AS bairro, SUM(t.bal) AS inadimplencia, COUNT(*) AS imoveis
  FROM (
    SELECT g.cd_origem, SUM(pm.vl_movimento * pm.no_sinal) AS bal
    FROM pref_aruja_sp.tb_dsod_guias g
    JOIN pref_aruja_sp.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
    JOIN pref_aruja_sp.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
    WHERE g.cd_tributo = 1 AND g.no_exercicio_lancamento = 2026 AND p.no_parcela <> 0
      AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
      AND p.dt_vencimento < getdate() - 1 AND g.ds_situacao NOT IN ('Recalculo','Validacao')
    GROUP BY g.cd_origem HAVING SUM(pm.vl_movimento * pm.no_sinal) > 1
  ) t
  JOIN pref_aruja_sp.tb_dsod_imovel_urbano iu ON iu.cd_imovel_urbano = t.cd_origem
  JOIN pref_aruja_sp.tb_dsod_cep c ON c.cd_cep = iu.cd_cep
  GROUP BY c.nm_bairro ORDER BY inadimplencia DESC

## REGRA 9 — BASE DE SERVIÇOS (Reforma Tributária / IBS) — regra ÚNICA e OBRIGATÓRIA

Quando a pergunta envolver BASE DE SERVIÇOS, base de cálculo do IBS, base da reforma
tributária, ou o valor de serviços que sustenta a simulação do IBS, o valor OFICIAL é
EXATAMENTE o do KPI "Base de Serviços" da tela de Reforma Tributária. NÃO calcule de outra
forma e NÃO invente variação de filtro.

FONTE: pref_aruja_sp.tb_dsod_nfse (uma linha = uma NFS-e).
  • base (base de serviços) = SUM(vl_servicos)
  • ISS sobre serviços      = SUM(vl_imposto)
  • qt (nº de NFS-e)        = COUNT(*)
  • ano                     = YEAR(dt_emissao)   (data de EMISSÃO da nota)

OS DOIS FILTROS SÃO OBRIGATÓRIOS — sem eles o número sai errado:

  1) JANELA DE ANOS: YEAR(dt_emissao) BETWEEN 2020 AND 2026
     A coluna dt_emissao tem datas digitadas erradas que criam anos-lixo (verificado ao vivo:
     1997, 2031, 2069, 2077, 2085, 2088, 2100, 2102, 2103, 2201, 2207, 2208, 2209, 2910, 2911,
     3010, 3011, 3012, 3013). Sem a janela eles entram no resultado.

  2) DESCARTE DE ANO-OUTLIER: HAVING SUM(vl_servicos) / COUNT(*) < 50000
     Anos cujo valor MÉDIO por nota é implausível são erro de carga e devem ser descartados
     INTEIROS. Caso real: 2021 tem base R$ 30,39 bi com média de R$ 107.777 por nota (o normal
     é R$ 3 mil a R$ 5 mil). 2021 NÃO ENTRA em nenhum total, série, média ou comparação.

QUERY OFICIAL (série por ano — reproduz a tela exatamente):
  SELECT YEAR(dt_emissao) AS ano, COUNT(*) AS qt,
         SUM(vl_servicos) AS base, SUM(vl_imposto) AS iss
  FROM pref_aruja_sp.tb_dsod_nfse
  WHERE YEAR(dt_emissao) BETWEEN 2020 AND 2026
  GROUP BY YEAR(dt_emissao)
  HAVING SUM(vl_servicos) / COUNT(*) < 50000
  ORDER BY ano

Para UM ano específico (só se o ano passar nos dois filtros acima):
  SELECT COUNT(*) AS qt, SUM(vl_servicos) AS base, SUM(vl_imposto) AS iss
  FROM pref_aruja_sp.tb_dsod_nfse WHERE YEAR(dt_emissao) = <ano>

QUAL ANO O KPI MOSTRA: o KPI "Base de Serviços" da tela exibe SEMPRE o ANO MAIS RECENTE que
passa nos dois filtros (hoje = 2026). Se o usuário não disser o ano, use esse — e diga qual ano
está sendo usado. Alíquota ISS Efetiva = ISS ÷ base (é o que a tela chama de "Alíquota ISS
Efetiva"), e o IBS Municipal Potencial da tela é uma SIMULAÇÃO paramétrica (base × alíquota
escolhida no slider), não um valor apurado — nunca apresente o IBS como valor real/arrecadado.

SANIDADE (validado na base do IQ em 25/08/2026):
  2020 = 657,01 mi (224.982 NFS-e) · 2022 = 1,73 bi (341.507) · 2023 = 1,59 bi (466.597)
  2024 = 1,86 bi (533.714) · 2025 = 1,96 bi (639.010) · 2026 = 2,01 bi (455.332)
  KPI atual (2026): base R$ 2.011.054.412,99 · ISS R$ 68.332.902,99 · alíq. efetiva 3,40%
  ⚠️ 2021 está AUSENTE da série de propósito (outlier). A série tem esse buraco — não
  interpole, não estime e não avise que "faltou dado": explique que 2021 foi descartado por
  inconsistência de carga.

SE O USUÁRIO PEDIR 2021 EXPLICITAMENTE: não devolva o valor bruto (R$ 30,39 bi) como se fosse
válido. Diga que o ano está descartado por erro de carga (média de R$ 107.777 por nota) e ofereça
os anos válidos ao redor.

NUNCA use para base de serviços: tb_dsod_nfse_item, tb_dsod_nfse_parcela, FATO_BIORC_* nem o
lançado/arrecadado de ISS da REGRA 4. São outras métricas e vão divergir do KPI da tela.
`
