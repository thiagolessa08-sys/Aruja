/**
 * Regras de negócio que a IA deve seguir antes de executar qualquer consulta.
 * Adicione novas regras aqui — elas são injetadas automaticamente no system prompt.
 */

export const REGRAS_NEGOCIO = `
══════════════════════════════════════════
REGRAS DE NEGÓCIO — OBRIGATÓRIAS
══════════════════════════════════════════

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

Query modelo CORRETA para receita com as três colunas:
  SELECT
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA = 1 THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS receita_bruta,
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA = 2 THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS deducoes,
    SUM(CASE WHEN tn.CD_TIPO_NATUREZA_RECEITA IN (1, 2) THEN f.VL_ARRECADACAO_RECEITA ELSE 0 END) AS receita_liquida
  FROM pref_aruja_sp.FATO_BIORC_EXECUCAO_RECEITA f
  JOIN pref_aruja_sp.DIM_BIORC_TIPO_NATUREZA_RECEITA tn
    ON f.SK_TIPO_NATUREZA_RECEITA = tn.SK_TIPO_NATUREZA_RECEITA
  JOIN pref_aruja_sp.DIM_BIORC_DATA_CALENDARIO d
    ON f.SK_DATA_CALENDARIO_ANO = d.SK_DATA_CALENDARIO
  WHERE d.NO_ANO = 2025

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

Quando o usuário perguntar por LANÇADO, ARRECADADO, INADIMPLÊNCIA, EM ABERTO, ISENTO ou SUSPENSO
de um tributo (IPTU etc.), a fonte oficial é o LIVRO-RAZÃO DE MOVIMENTO, NUNCA:
  ✗ FATO_BIORC (isso é receita orçamentária, não o lançado/arrecadado do tributo)
  ✗ tb_dsod_parcela_posicao (modelo antigo)
  ✗ vl_venal × alíquota (estimativa — proibido)

Base OBRIGATÓRIA (sempre estes joins, cd_tributo IPTU = 1, exclua no_parcela 0):
  FROM pref_aruja_sp.tb_dsod_guias g
  JOIN pref_aruja_sp.tb_dsod_parcelas p            ON p.cd_guia = g.cd_guia
  JOIN pref_aruja_sp.tb_dsod_parcela_movimento pm  ON pm.cd_parcela = p.cd_parcelas
  WHERE g.cd_tributo IN (1) AND g.no_exercicio_lancamento IN (<ano>) AND p.no_parcela NOT IN (0)

⚠️ O agente NÃO aceita: literal de texto no WHERE, operadores < > <= <>, HAVING, subquery, getdate(),
   e capa em 5000 linhas. Então NÃO filtre texto/HAVING no SQL — faça GROUP BY e você (IA) soma/filtra
   ao ler o resultado. Use IN / NOT IN e YEAR()/MONTH() para datas.

Definições (cada uma acrescenta ao WHERE base):
  • LANÇADO: AND pm.cd_tipo_movimento IN (1,2,3)
      → SELECT g.ds_situacao, SUM(pm.vl_movimento) ... GROUP BY g.ds_situacao
      → some TODAS as linhas EXCETO ds_situacao 'Recalculo' e 'Validacao'.
  • ARRECADADO: AND pm.cd_tipo_movimento IN (11,14) AND pm.cd_tipo_lancamento IN (0,4,7,10)
      + JOIN pref_aruja_sp.tb_dsod_parcela_baixas pb ON pb.cd_parcela_baixa = pm.cd_parcela_baixa
      AND pb.cd_tipo_baixa NOT IN (28)   -- 28 = Estorno de Baixa
      → GROUP BY g.ds_situacao; some tudo EXCETO 'Recalculo'/'Validacao'.
  • EM ABERTO (total a receber): AND pm.cd_tipo_movimento IN (0,1,2,3,11,12,14,20) AND pm.cd_tipo_lancamento IN (0,4,7,10,1)
      → SELECT SUM(pm.vl_movimento * pm.no_sinal)   (1 linha; o resultado já é o total).
  • INADIMPLÊNCIA (em aberto VENCIDO): mesmos filtros do Em Aberto, mas
      → GROUP BY YEAR(p.dt_vencimento), MONTH(p.dt_vencimento), SUM(pm.vl_movimento*pm.no_sinal)
      → some só os grupos cuja data (ano/mês) é ANTERIOR ao mês/ano de hoje.
  • ISENTO: AND pm.cd_tipo_movimento IN (12,5) AND pm.cd_tipo_lancamento IN (1)
      + JOIN tb_dsod_parcela_baixas pb (idem) → GROUP BY pb.ds_setor_origem_baixa
      → some SÓ a linha ds_setor_origem_baixa = 'Isencao'.
  • SUSPENSO: AND pm.cd_tipo_movimento IN (20)
      → SELECT SUM(pm.vl_movimento * pm.no_sinal)  → o valor suspenso = módulo (o resultado é negativo).

Reconciliação: Lançado ≈ Arrecadado + Em Aberto + Isento + Suspenso (+ cancelado).
Inadimplência é SUBCONJUNTO do Em Aberto (a parte vencida) — não some com Em Aberto.
Referência de sanidade IPTU 2026: Lançado 67,6mi · Arrecadado 36,6mi · Em Aberto 28,5mi ·
Inadimplência 5,9mi · Isento 0,5mi · Suspenso 1,3mi.
`
