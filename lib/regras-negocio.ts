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
`
