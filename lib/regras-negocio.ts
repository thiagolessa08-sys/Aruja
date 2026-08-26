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

## REGRA 10 — LANÇADO DE ITBI — regra ÚNICA e OBRIGATÓRIA

Quando a pergunta envolver VALOR LANÇADO DE ITBI ("quanto foi lançado de ITBI", "ITBI lançado",
"lançamento de ITBI"), o valor OFICIAL é EXATAMENTE o do KPI "Total Lançado" da tela de ITBI
(Imobiliário). NÃO calcule de outra forma e NÃO adapte a REGRA 4 do IPTU por conta própria — o
ITBI tem uma PONTE PRÓPRIA e um filtro a mais.

QUERY OFICIAL (reproduz o KPI exatamente — validada ao vivo):
  SELECT g.no_exercicio_lancamento AS ex, SUM(pm.vl_movimento) AS lancado
  FROM pref_aruja_sp.tb_dsod_guias g
  JOIN pref_aruja_sp.tb_dsod_itbi it ON it.cd_itbi = g.cd_origem
  JOIN pref_aruja_sp.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
  JOIN pref_aruja_sp.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
  WHERE g.cd_tributo = 10
    AND pm.cd_tipo_movimento IN (1,2,3)
    AND p.no_parcela <> 0
    AND g.ds_situacao NOT IN ('Recalculo','Validacao')
    AND it.vl_total > 0
  GROUP BY g.no_exercicio_lancamento

TODOS os elementos abaixo são OBRIGATÓRIOS:
  • cd_tributo = 10 (ITBI).
  • PONTE 1:1 guia→itbi: JOIN tb_dsod_itbi it ON it.cd_itbi = g.cd_origem. A tb_dsod_guias NÃO
    tem coluna cd_itbi (dá "Column not found"). A ponte é por cd_origem, igual ao imóvel no IPTU.
  • it.vl_total > 0 — só ITBI COM imposto. Filtro exclusivo do ITBI, não existe no IPTU.
  • pm.cd_tipo_movimento IN (1,2,3) e p.no_parcela <> 0.
  • g.ds_situacao NOT IN ('Recalculo','Validacao').
  • ANO = g.no_exercicio_lancamento (exercício de lançamento). NUNCA use dt_geracao da guia:
    uma guia de exercício 2025 pode ter sido gerada/reemitida em 2026.
  • NUNCA junte tb_dsod_itbi_imovel_urbano nos agregados de valor — é 1:N e INFLA o total.
    Ela só serve para detalhar imóveis de uma transmissão, nunca para somar valor.

FILTRO DE MÊS (quando o usuário pedir acumulado até um mês / YTD): acrescente
  AND MONTH(p.dt_vencimento) <= <mês>
(é por VENCIMENTO da parcela, mesma convenção do IPTU).

⚠️ ATENÇÃO CRÍTICA — O LANÇADO OFICIAL INCLUI GUIAS CANCELADAS:
O KPI "Total Lançado" exclui apenas Recalculo/Validacao, então CANCELADA ENTRA no total — e no
ITBI isso é enorme, não é detalhe. Verificado ao vivo no exercício 2026:
  Cancelada = R$ 16.885.985,11 (56,7%)  ·  Ativa = R$ 12.887.989,51 (43,3%)
Ou seja: MAIS DA METADE do "lançado" de 2026 é guia cancelada.

Por isso a tela mostra DOIS KPIs, e você deve fazer o mesmo:
  • "Total Lançado"            = a query acima (inclui Cancelada) → é o valor OFICIAL.
  • "Lançado (Guias Ativas)"   = a MESMA query trocando a linha de situação por
                                 AND g.ds_situacao = 'Ativa'
Ao responder sobre lançado de ITBI, apresente o OFICIAL e, SEMPRE que a diferença for relevante,
cite também o de Guias Ativas explicando que o oficial inclui canceladas. NUNCA entregue só o
número cheio sem essa ressalva — induz o usuário a superestimar o lançamento efetivo.

QUAL ANO: se o usuário não disser, use o exercício mais recente com lançado > 0 (hoje = 2026) e
diga qual ano está usando.

SANIDADE (validado na base do IQ em 25/08/2026) — Total Lançado / Lançado Ativas:
  2022 = 39,03 mi / 12,05 mi · 2023 = 54,77 mi / 17,46 mi · 2024 = 64,30 mi / 28,49 mi
  2025 = 46,86 mi / 31,46 mi · 2026 = 29,77 mi / 12,89 mi
  KPI atual (2026): Total Lançado R$ 29.773.974,62 · Guias Ativas R$ 12.887.989,51 (-36,5% vs 2025)

As demais métricas de ITBI (arrecadado, em aberto, inadimplência, isento, suspenso) seguem a mesma
base/ponte deste bloco com os filtros da REGRA 4 — mas sempre mantendo o JOIN tb_dsod_itbi e o
it.vl_total > 0. Para ITBI POR BAIRRO/RUA/IMÓVEL, use a REGRA 11 (ponte diferente).

## REGRA 11 — ITBI POR BAIRRO / RUA / IMÓVEL (valores E quantidades) — regra ÚNICA e OBRIGATÓRIA

Quando a pergunta pedir VALOR ou QUANTIDADE de ITBI por BAIRRO, RUA ou IMÓVEL ("ITBI por bairro",
"bairros que mais arrecadam ITBI", "quantos imóveis tiveram ITBI no bairro X", "ruas com mais
inadimplência de ITBI"), use EXATAMENTE a regra do gráfico "ITBI por Bairro" da tela de ITBI
(Imobiliário). Para IPTU por bairro continue usando a REGRA 8 — a ponte do ITBI é DIFERENTE.

⚠️ ERRO GRAVÍSSIMO A EVITAR — g.cd_devedor NÃO É O IMÓVEL NO ITBI:
No IPTU, g.cd_devedor = cd_imovel_urbano. No ITBI, g.cd_devedor é o CONTRIBUINTE (pessoa). Se você
usar g.cd_devedor como imóvel, o ID casa por COINCIDÊNCIA com algum imóvel qualquer: derruba ~94%
dos registros e atribui BAIRRO ERRADO aos que "batem". Foi um bug real já corrigido. Medido ao
vivo no exercício 2026: o jeito errado dá 41 imóveis / R$ 1.655.058,93 contra os corretos
655 imóveis / R$ 29.696.574,62.

PONTE OFICIAL (obrigatória): guia → itbi → itbi_imovel_urbano → imóvel → cep
  g.cd_origem = it.cd_itbi   →   tb_dsod_itbi_imovel_urbano   →   cd_imovel_urbano   →   nm_bairro

⚠️ tb_dsod_itbi_imovel_urbano é 1:N (uma transmissão pode ter vários imóveis). Juntá-la DIRETO
causa fan-out e INFLA o SUM (medido em 2026: R$ 29.744.826,12 inflado contra R$ 29.696.574,62
correto). É OBRIGATÓRIO colapsar para 1 imóvel por transmissão com uma subquery MIN:
  (SELECT cd_itbi, MIN(cd_imovel_urbano) cd_imovel_urbano
     FROM pref_aruja_sp.tb_dsod_itbi_imovel_urbano GROUP BY cd_itbi)
Isso serve só para ATRIBUIR bairro e CONTAR imóveis, sem duplicar valor.

FROM + WHERE base (todas as métricas partem daqui):
  FROM pref_aruja_sp.tb_dsod_guias g
  JOIN pref_aruja_sp.tb_dsod_itbi it ON it.cd_itbi = g.cd_origem
  JOIN (SELECT cd_itbi, MIN(cd_imovel_urbano) cd_imovel_urbano
          FROM pref_aruja_sp.tb_dsod_itbi_imovel_urbano GROUP BY cd_itbi) iiu ON iiu.cd_itbi = it.cd_itbi
  JOIN pref_aruja_sp.tb_dsod_imovel_urbano i ON i.cd_imovel_urbano = iiu.cd_imovel_urbano
  JOIN pref_aruja_sp.tb_dsod_cep c ON c.cd_cep = i.cd_cep
  JOIN pref_aruja_sp.tb_dsod_parcelas p ON p.cd_guia = g.cd_guia
  JOIN pref_aruja_sp.tb_dsod_parcela_movimento pm ON pm.cd_parcela = p.cd_parcelas
  WHERE g.cd_tributo = 10 AND g.no_exercicio_lancamento = <ano> AND p.no_parcela <> 0
    AND it.vl_total > 0

QUANTIDADE ("quantos imóveis") = COUNT(DISTINCT iiu.cd_imovel_urbano). NUNCA COUNT(*) — com as
parcelas/movimentos no FROM, COUNT(*) conta linhas de movimento, não imóveis.

NÍVEL DO AGRUPAMENTO (é um drill de 3 níveis, igual à tela):
  bairro → GROUP BY c.nm_bairro   ·   rua (dentro do bairro) → GROUP BY c.ds_endereco
  imóvel (dentro da rua) → GROUP BY iiu.cd_imovel_urbano
Filtrar nível: AND c.nm_bairro = '<bairro>'  e/ou  AND c.ds_endereco = '<rua>'

FÓRMULA POR MÉTRICA (semRV = AND g.ds_situacao NOT IN ('Recalculo','Validacao')):
  • LANÇADO (padrão): ...base... semRV AND pm.cd_tipo_movimento <= 3
      → SELECT <grupo> k, COUNT(DISTINCT iiu.cd_imovel_urbano) im, SUM(pm.vl_movimento) vl
  • ARRECADADO: junte tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      e tb_dsod_tipo_baixa tbx ON tbx.cd_tipo_baixa = pb.cd_tipo_baixa
      ...base... semRV AND g.ds_situacao NOT IN ('Cancelada')
      AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
      AND tbx.ds_tipo_baixa <> 'Estorno de Baixa'
      (ATENÇÃO: no arrecadado por bairro, 'Cancelada' também é excluída — diferente do lançado.)
  • ISENTO (Não Incidência): ...base... semRV AND pm.cd_tipo_movimento <= 3
      AND iiu.cd_imovel_urbano IN (SELECT e.cd_origem FROM pref_aruja_sp.tb_extr_isencoes e
        WHERE e.ds_isencao IN ('Não Incidência de ITBI'))
  • SUSPENSO: ...base... AND pm.cd_tipo_movimento = 20
  • EM ABERTO: net por (imóvel, devedor, vencimento) — subquery + soma externa:
      SELECT k, COUNT(DISTINCT imovel) im, SUM(valor) vl FROM (
        SELECT <grupo> k, iiu.cd_imovel_urbano imovel, g.cd_devedor, p.dt_vencimento venc,
               SUM(pm.vl_movimento*pm.no_sinal) valor
        ...base... AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20)
                   AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
        GROUP BY <grupo>, iiu.cd_imovel_urbano, g.cd_devedor, p.dt_vencimento
        HAVING SUM(pm.vl_movimento*pm.no_sinal) > 0 ) t GROUP BY k
  • INADIMPLÊNCIA: igual Em Aberto, mas AND p.dt_vencimento < getdate()-1,
      movimento IN (0,1,2,3,12,11,14,20), lançamento IN (4,7,0,10,1) e HAVING ... > 1.
      É SUBCONJUNTO do Em Aberto (parte vencida) — nunca some os dois.

⚠️ A SOMA DOS BAIRROS NÃO FECHA COM O KPI DA REGRA 10: a ponte de imóvel é INNER JOIN, então
transmissão que não resolve imóvel/CEP fica fora do gráfico. Medido em 2026: soma dos bairros
R$ 29.696.574,62 contra KPI Total Lançado R$ 29.773.974,62 — diferença de R$ 77.400,00 (0,26%).
NUNCA apresente o total por bairro como se fosse o lançado do município, e não "conserte" a
diferença: se precisar citar os dois, explique que o recorte por bairro exige imóvel vinculado.

⚠️ O RANKING DE BAIRROS MUDA COMPLETAMENTE CONFORME A MÉTRICA — nunca reaproveite o ranking de
uma métrica para responder sobre outra, e nunca responda "qual bairro tem mais ITBI" sem antes
fixar QUAL métrica (lançado? arrecadado? inadimplência?). Em 2026 o líder de LANÇADO é ARUJÁ 5,
mas o líder de INADIMPLÊNCIA é CONDOMINIO ARUJAZINHO III — bairros diferentes, escalas diferentes
(lançado R$ 29,70 mi em 73 bairros × inadimplência R$ 349.993,95 em apenas 16 bairros).

SANIDADE (validado na base do IQ em 25/08/2026, nível bairro):

  LANÇADO 2026 — 73 bairros, 655 imóveis, total R$ 29.696.574,62:
    ARUJÁ 5 = 32 imóveis / R$ 5.761.356,85 · CONDOMINIO ARUJAZINHO IV = 24 / R$ 5.280.215,38
    LIMOEIRO = 19 / R$ 3.583.485,39 · CONDOMINIO NOVO HORIZONTE = 9 / R$ 2.898.622,57
    CENTRO INDUSTRIAL DE ARUJA = 5 / R$ 1.666.383,27

  INADIMPLÊNCIA 2026 — 16 bairros, 29 imóveis, total R$ 349.993,95:
    CONDOMINIO ARUJAZINHO III = 1 imóvel / R$ 77.243,25   <-- MAIOR inadimplência de 2026
    ARUJA CENTER VILLE = 5 / R$ 58.544,34 · CONDOMINIO ARUJAZINHO IV = 1 / R$ 43.200,00
    CHACARAS SÃO JOSÉ DO ARUJÁ = 2 / R$ 36.144,24 · PARQUE RODRIGO BARRETO = 7 / R$ 30.298,76
    JARDIM PLANALTO = 2 / R$ 16.988,66

  INADIMPLÊNCIA 2025 — 7 bairros, 7 imóveis, total R$ 7.396.150,68:
    RESIDENCIAL REAL PARK ARUJÁ = 1 imóvel / R$ 7.284.188,35 (98,5% do ano inteiro!)
    ARUJÁ COUNTRY CLUB = 1 / R$ 44.966,01 · ARUJAMERICA = 1 / R$ 42.450,00

⚠️ A INADIMPLÊNCIA DE ITBI É ALTAMENTE CONCENTRADA — poucos imóveis, valores enormes num só.
Em 2025, UM único imóvel responde por 98,5% da inadimplência do ano. Ao responder sobre bairro
mais inadimplente, SEMPRE informe também a quantidade de imóveis: dizer que um bairro "lidera a
inadimplência" com 1 imóvel é muito diferente de liderar com dezenas. Não descreva como problema
disseminado do bairro o que é uma única transmissão em atraso.

## REGRA 12 — TRANSMISSÃO DE IMÓVEIS e VALOR VENAL — regra ÚNICA e OBRIGATÓRIA

Quando a pergunta envolver TRANSMISSÃO DE IMÓVEL (quantas transmissões, imóveis mais
transmitidos, quantas vezes o imóvel foi vendido, histórico de transmissões) ou VALOR VENAL,
use EXATAMENTE as regras dos cards "Imóveis mais transmitidos" e "Consultar Imóvel" da tela de
ITBI (Imobiliário).

FONTE: tb_dsod_itbi (it) + tb_dsod_itbi_imovel_urbano (iiu). Este bloco NÃO passa por
tb_dsod_guias nem pelo livro-razão — é o cadastro da transmissão, não o lançamento do imposto.
  TRANSMISSÃO = COUNT(DISTINCT it.cd_itbi)      ·      filtro obrigatório: it.vl_total > 0

⚠️ A COLUNA DE DATA AQUI É it.dt_lancamento — NÃO no_exercicio_lancamento da guia (REGRAS 10/11):
  AND YEAR(it.dt_lancamento) = <ano>   (+ AND MONTH(it.dt_lancamento) <= <mês> se houver mês)
Trocar a coluna MUDA a resposta: medido em 2026, dt_lancamento dá 798 transmissões contra 760 por
no_exercicio_lancamento da guia (38 de diferença). Use dt_lancamento para contar transmissões.

⚠️ AQUI A PONTE 1:N **NÃO** É COLAPSADA (o oposto da REGRA 11): junte
tb_dsod_itbi_imovel_urbano DIRETO. A unidade de análise é imóvel × transmissão, então um ITBI que
cobre 2 imóveis conta 1 transmissão para CADA imóvel — isso é correto e intencional.
  → MAS por isso NUNCA some a coluna de venal entre imóveis para obter um total do município:
    SUM(it.vl_venal) agrupado por imóvel repete o venal do ITBI em cada imóvel dele. Existem 34
    ITBIs com mais de um imóvel vinculado (verificado) — o risco é real, não teórico.
    "Venal total" só é válido POR IMÓVEL, nunca somado entre imóveis.

COLUNAS DE VALOR em tb_dsod_itbi (nunca inventar outras):
  • it.vl_venal              = VALOR VENAL do imóvel na transmissão
  • it.vl_aquisicao_original = valor de aquisição / transação declarado pelas partes
  • it.pc_aliquota           = alíquota aplicada
  • it.vl_total              = imposto total da transmissão (o filtro > 0 = "ITBI com imposto")

CARD "IMÓVEIS MAIS TRANSMITIDOS" — distribuição por faixa (GROUP BY imóvel + HAVING):
  faixa "1" → HAVING COUNT(DISTINCT it.cd_itbi) = 1   ·  "2" → = 2
  faixa "3-5" → BETWEEN 3 AND 5                        ·  "6+" → >= 6
  Ranking dos mais transmitidos: ORDER BY COUNT(DISTINCT it.cd_itbi) DESC

FAIXA "VALOR <= VENAL" (o 5º card):
  AND it.vl_venal > 0 AND it.vl_aquisicao_original <= it.vl_venal
  → contagem = COUNT(DISTINCT iiu.cd_imovel_urbano)
  SIGNIFICADO CORRETO: indica que o ITBI foi calculado sobre o VENAL, porque a base de cálculo é
  o MAIOR entre venal e valor declarado — é a regra NORMAL de apuração.
  ⚠️ NUNCA descreva isso como sonegação, subdeclaração, fraude ou irregularidade. É apenas o
  indicativo de qual dos dois valores serviu de base. Se o usuário sugerir fraude, esclareça isso.

"CONSULTAR IMÓVEL" — histórico do imóvel (ao abrir um imóvel específico):
  • Transmissões do imóvel: WHERE iiu.cd_imovel_urbano = <id> AND it.vl_total > 0 — SEM filtro de
    ano: o histórico é SEMPRE completo, mesmo com a tela filtrada por exercício.
  • ⚠️ A data exibida da transmissão é it.dt_transacao (terceira coluna de data do módulo —
    não confundir com it.dt_lancamento das contagens, nem com it.dt_vencimento).
  • Natureza = it.ds_natureza_transacao. ⚠️ it.ds_situacao existe mas vem VAZIA em 100% das
    linhas (24.507 de 24.507 medidas) — NUNCA prometa/cite "situação" da transmissão.
  • Partes: it.cd_contr_transmitente / it.cd_contr_adquirente → nome em tb_dsod_contribuinte;
    o nome do transmitente tem fallback para o texto livre it.nm_transmitente quando o vínculo
    não resolve (COALESCE(NULLIF(it.nm_transmitente,''), tb_dsod_contribuinte.nm_rsocial)).
  • IMPOSTO por transmissão NÃO está em vl_total para esse fim — vem do livro-razão, pela ponte
    g.cd_origem = cd_itbi, com mov 1,2,3 · no_parcela <> 0 · fora de Recalculo/Validacao.
  • VALORIZAÇÃO do venal = (venal da transmissão MAIS RECENTE − venal da MAIS ANTIGA) ÷ venal da
    mais antiga, em ordem cronológica, considerando SÓ transmissões com vl_venal > 0.
  • Proprietário atual = i.cd_contr_proprietario. Se o proprietário for ESPÓLIO, o possuidor de
    fato é i.cd_contr_posseiro (herdeiro/responsável enquanto a partilha não sai) — cite-o.
  • Busca do imóvel: inscrição (i.no_inscricao_imovel), código (i.cd_imovel_urbano) ou nome do
    proprietário (contribuinte.nm_rsocial).

SANIDADE (validado na base do IQ em 25/08/2026, exercício 2026 por dt_lancamento — 798
transmissões):
  Distribuição por imóvel: 1 transmissão = 578 imóveis · 2 = 72 · 3 a 5 = 16 · 6 ou mais = 2
  Faixa "Valor <= venal" = 151 imóveis
  Mais transmitidos: imóvel 3264 (insc. NE11140617.000) = 14 transmissões / venal R$ 1.285.970,14 ·
  imóvel 6662 = 9 / R$ 210.159,42 · imóvel 28890 = 5 / R$ 23.799.913,75 · imóvel 32945 = 4 /
  R$ 1.584.655,42 · imóvel 18739 = 4 / R$ 212.446,40
  Note que QUANTIDADE e VENAL rankeiam diferente (28890 tem 5 transmissões mas o maior venal) —
  ao responder "imóvel mais transmitido" deixe claro que o critério é a QUANTIDADE.

## REGRA 13 — ITBI: PARTES, VÍNCULO MOBILIÁRIO, VALORES E ALERTA — regra ÚNICA e OBRIGATÓRIA

COMPLEMENTA a REGRA 12 (que define a CONTAGEM de transmissões e as faixas). Esta REGRA 13 define
os CAMPOS do detalhe do imóvel. Quando a pergunta de ITBI envolver VALOR VENAL, TRANSMISSÕES,
AQUISIÇÕES, TRANSMITENTE × PROPRIETÁRIO, VÍNCULO MOBILIÁRIO, VALOR DA TRANSAÇÃO, IMPOSTO ou
ALERTA, use EXATAMENTE as regras dos cards "Imóveis mais transmitidos" e "Consultar Imóvel" da
tela de ITBI (Imobiliário). NUNCA invente coluna, indicador ou interpretação fora deste bloco.

DE-PARA rótulo da tela → coluna real (nunca trocar):
  • "Valor da Transação" = it.vl_aquisicao_original  (valor de aquisição declarado pelas partes)
  • "Valor Venal"        = it.vl_venal
  • "Imposto"            = livro-razão (ponte g.cd_origem = cd_itbi, mov 1,2,3, no_parcela <> 0,
                           fora de Recalculo/Validacao) — NÃO é it.vl_total
  • "Natureza"           = it.ds_natureza_transacao
  • "Data de Início"     = it.dt_transacao
  • "Data de Fim"        = it.dt_vencimento → ⚠️ VAZIA em 100% das linhas (24.507 de 24.507
    medidas). A coluna existe na tela mas nunca tem valor. NUNCA prometa nem cite "data de fim".
  "AQUISIÇÃO" = it.vl_aquisicao_original (é o mesmo dado de "Valor da Transação", não outro campo).

COLUNA "ALERTA" (badge "⚠ abaixo do venal") — condição EXATA, com < ESTRITO:
  it.vl_aquisicao_original > 0 AND it.vl_venal > 0 AND it.vl_aquisicao_original < it.vl_venal
  ⚠️ NÃO CONFUNDIR com a faixa "Valor ≤ venal" do card "Imóveis mais transmitidos" (REGRA 12),
  que usa <= e não exige transação > 0. São dois indicadores diferentes: medido em 2026, o ALERTA
  dá 109 imóveis e a FAIXA dá 151 (dos 42 de diferença, 5 imóveis têm vl_aquisicao_original = 0).
  ⚠️ O alerta NÃO é sonegação, subdeclaração, fraude nem irregularidade — significa apenas que a
  base de cálculo foi o VENAL, porque a base é o MAIOR entre venal e valor declarado (apuração
  NORMAL). Se o usuário sugerir fraude a partir do alerta, corrija essa leitura.

CARD "TRANSMITENTE × PROPRIETÁRIO":
  Proprietário atual = i.cd_contr_proprietario (tb_dsod_imovel_urbano). Estados do card:
    "Partes não informadas" (nenhuma transmissão com nome de transmitente nem de adquirente) ·
    "Cadastro atualizado" (adquirente da transmissão MAIS RECENTE = proprietário atual) ·
    "Possível divergência" (todo o resto)
  ⚠️⚠️ GUARDA CRÍTICA — o ADQUIRENTE quase nunca existe nesta base: it.cd_contr_adquirente = -1
  (linha sentinela, nome "Não Informado") em 24.434 de 24.507 ITBIs = 99,7%. Só 73 ITBIs (0,3%)
  têm adquirente real. Consequências OBRIGATÓRIAS:
    → "Possível divergência" é o estado quase universal: apenas 29 de 14.349 imóveis com
      transmissão (0,2%) chegam a "Cadastro atualizado". NUNCA apresente "Possível divergência"
      como indício de irregularidade, erro de cadastro ou fraude — é AUSÊNCIA DE DADO.
    → NUNCA afirme quem foi o adquirente/comprador sem antes checar cd_contr_adquirente > 0.
      Se for -1, responda que o adquirente não está informado no cadastro.
  ⚠️ A "cobertura" exibida ("N/M c/ adquirente") conta NOME não-vazio, e o sentinela "Não
  Informado" conta como preenchido — então "18/18 c/ adquirente" pode ser 100% sentinela. Para
  saber se há adquirente REAL, teste cd_contr_adquirente > 0; nunca conclua pelo nome.
  O TRANSMITENTE, ao contrário, é confiável: real em 23.399 de 24.507 (95,5%), sentinela em 1.107
  (4,5%). Nome = COALESCE(NULLIF(it.nm_transmitente,''), tb_dsod_contribuinte.nm_rsocial).
  Badge "transm.= prop." (transmitente = proprietário atual) ocorre em 2.129 de 14.349 imóveis
  (14,8%) — típico de incorporadora/loteadora que segue como proprietária no cadastro enquanto as
  unidades são vendidas. É normal, não é erro.

CARD "VÍNCULO MOBILIÁRIO":
  FONTE: tb_dsod_contribuinte_mob_fisico (mf), WHERE mf.cd_imovel_urbano = <id>, contando
  DISTINCT mf.cd_contr_mob = nº de empresas no endereço do imóvel. Tabela acessível (27.557
  linhas · 7.515 imóveis · 26.584 empresas). "Empresa é o proprietário" = esse conjunto contém
  i.cd_contr_proprietario. "Transmissões com PJ" = transmissões em que o transmitente OU o
  adquirente é PJ.
  ⚠️ PJ vem de tb_dsod_contribuinte.ic_pessoa = 'J' e é POUCO CONFIÁVEL nos dois sentidos:
  1.099 contribuintes têm nome claramente PJ (LTDA / EIRELI / S.A. / INCORPORADORA /
  EMPREENDIMENTO) e NÃO estão marcados como 'J'; 579 têm CNPJ em no_cpf_cnpj (contém "/") sem
  estar marcados. Caso real: cd_contr 423296 = "FOMENTO 02 INCORPORADORA SPE LTDA", CNPJ
  54.992.445/0001-24, ic_pessoa = 'F'. → NUNCA afirme "as partes são pessoas físicas" só com
  base em ic_pessoa. Se nome ou CNPJ indicarem PJ, diga que o cadastro está marcado como física
  (divergência cadastral), e trate "transmissões com PJ = 0" como subcontagem possível.
  ⚠️ "Sem empresa no endereço" também aparece quando a consulta do mobiliário FALHA (o código
  trata erro como conjunto vazio) — não afirme ausência categórica de empresa.

INDICADORES do imóvel (nº de transmissões, valorização do venal, intervalo médio, imposto total,
venal primeiro/último): SEM filtro de ano — histórico SEMPRE completo, mesmo com a tela filtrada
por exercício (ver REGRA 12). Ordenação do histórico = it.dt_transacao DESC (mais recente
primeiro); "última transmissão" = a primeira linha dessa ordem.
"Espólio" NÃO é campo do banco: é detectado por padrão no NOME do proprietário (regex ESP.LIO).
Quando for espólio, cite o possuidor de fato i.cd_contr_posseiro (REGRA 12).

SANIDADE (validada na base do IQ em 26/08/2026):
  • Imóvel 3264 (insc. NE11140617.000) — o caso típico: 18 transmissões no histórico COMPLETO
    (contra 14 no exercício 2026 pela REGRA 12: o detalhe não filtra ano). Venal 59.146,51 →
    91.855,01 = +55,3% de valorização · imposto total R$ 924.960,00 · intervalo médio 0,53 ano ·
    proprietário FOMENTO 02 INCORPORADORA SPE LTDA · 1 empresa no endereço · 0 transmissões com
    alerta. TODOS os 18 adquirentes são o sentinela -1: o card mostra "Possível divergência" e
    "18/18 c/ adquirente", mas NENHUM adquirente é real, e transmitente = proprietário nas 18.
  • Imóvel 30044 (insc. SO11020411.000, BASSICON EMPREENDIMENTOS) — o caso raro (0,2%): 2
    transmissões, ambas em 16/04/2019, adquirente REAL = proprietário atual → "Cadastro
    atualizado". Venal igual nas duas (169.987,19) → valorização 0%. ITBI 16369: transação
    111.291,09 < venal → COM alerta; ITBI 16373: transação 440.000,00 > venal → SEM alerta.
    Imposto total R$ 20.999,74 · 2 empresas no endereço.
`
