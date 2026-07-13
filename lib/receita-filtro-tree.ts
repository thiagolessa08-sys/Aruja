// Árvore do filtro "Impostos e Taxas" — EXATAMENTE conforme a planilha "Filtro Corrigido" (BO).
// 1º nível = Grupo Alínea (campo `alinea`); 2º nível = Natureza. Gerado da planilha — não editar à mão.
export interface GrupoReceita { alinea: string; naturezas: string[] }

export const RECEITA_FILTRO_TREE: GrupoReceita[] = [
  {
    alinea: "ALIENAÇÃO DE BENS",
    naturezas: [
      "ALIENAÇÃO DE BENS IMÓVEIS",
      "ALIENAÇÃO DE BENS MÓVEIS E SEMOVENTES - PRINCIPAL",
    ],
  },
  {
    alinea: "CESSÃO DO DIREITO DE OPER DE PAG",
    naturezas: [
      "CESSÃO DO DIREITO DE OPERACIONALIZAÇÃO DE PAGAMENTOS - PODER LEGISLATIVO - PRINCIPAL",
    ],
  },
  {
    alinea: "CONTRIB PARA O CUSTEIO DO SERV DE ILUMINAÇÃO PÚBLICA",
    naturezas: [
      "CONTRIB CUSTEIO SERV ILUMINAÇÃO PÚBLICA",
    ],
  },
  {
    alinea: "COTA-PARTE",
    naturezas: [
      "COTA-PARTE COMP. FINANC. REC. MINERAIS - CFEM",
      "FEP - EDUCAÇÃO",
      "FEP - SAÚDE",
      "ROYALTIES - EDUCAÇÃO",
      "ROYALTIES - SAÚDE",
      "COTA-PARTE DA CIDE - CONTRIB INTERV DOM ECON",
      "COTA-PARTE DO FPM - FDO PARTIC MUNICÍPIOS",
      "COTA-PARTE DO ICMS",
      "COTA-PARTE DO ITR - IMPOSTO PROPR TERR RURAL",
      "COTA-PARTE DO IPI",
      "COTA-PARTE DO IPVA",
      "COTA-PARTE ROYALTIES - COMP FIN - LEI Nº 7.990/89",
    ],
  },
  {
    alinea: "IPTU",
    naturezas: [
      "IPTU - DÍVIDA ATIVA",
      "IPTU - DÍVIDA ATIVA - MULTAS E JUROS",
      "IPTU - IMPOSTO PROPR PREDIAL E TERRIT URBANA",
      "IPTU - MULTAS E JUROS",
    ],
  },
  {
    alinea: "IR",
    naturezas: [
      "IR - RETIDO NA FONTE - PF - OUTROS RENDIM",
      "IR - RETIDO NA FONTE - PJ - OUTROS RENDIM",
      "IR - RETIDO NA FONTE - TRABALHO",
    ],
  },
  {
    alinea: "ISS",
    naturezas: [
      "ISSQN - DÍVIDA ATIVA",
      "ISSQN - DÍVIDA ATIVA - MULTAS E JUROS",
      "ISSQN - IMPOSTO SERVIÇOS QUALQUER NATUREZA",
      "ISSQN - MULTAS E JUROS",
    ],
  },
  {
    alinea: "ITBI",
    naturezas: [
      "ITBI - DÍVIDA ATIVA",
      "ITBI - DÍVIDA ATIVA - MULTAS E JUROS",
      "ITBI - IMPOSTO TRANSM INTER VIVOS - BENS IMÓVEIS",
      "ITBI - MULTAS E JUROS",
    ],
  },
  {
    alinea: "MULTAS PREVISTAS EM LEGISLAÇÃO ESPECÍFICA",
    naturezas: [
      "MULTAS POR AUTO DE INFRAÇÃO",
      "MULTAS PREVISTAS LEGISLAÇÃO TRÂNSITO",
    ],
  },
  {
    alinea: "OPER DE CRÉDITO INTERNAS PARA PROGRAMAS DE SAÚDE",
    naturezas: [
      "REC FINISA - CONSTRUÇÃO HOSPITAL",
    ],
  },
  {
    alinea: "OUTRAS INDENIZAÇÕES",
    naturezas: [
      "OUTRAS INDENIZAÇÕES",
    ],
  },
  {
    alinea: "OUTRAS OPER DE CRÉDITO - MI",
    naturezas: [
      "REC AGENCIA SP - CONSTR PRÉDIO PÚBLICO",
      "REC AGENCIA SP - ILUMINAÇÃO LED ÁREA RURAL",
      "REC BB - OPER CRED DESP CAPITAL",
    ],
  },
  {
    alinea: "OUTRAS RECEITAS",
    naturezas: [
      "OUTRAS RECEITAS",
      "OUTRAS RECEITAS - DÍVIDA ATIVA",
      "OUTRAS RECEITAS -DÍVIDA ATIVA -MULTAS E JUROS",
      "TRANSF DEP JUD E ADM - LC 151/2015",
    ],
  },
  {
    alinea: "OUTRAS RESTITUIÇÕES",
    naturezas: [
      "OUTRAS RESTITUIÇÕES",
    ],
  },
  {
    alinea: "OUTRAS TRANSF DE CONV DA UNIÃO E DE SUAS ENT",
    naturezas: [
      "REC FED - CONV 998160/2025 - NATAL ENCANTADO",
      "REC FED - RECAP AV ADILIA B NEVES - TRECHO IV",
    ],
  },
  {
    alinea: "OUTRAS TRANSF DE CONV DOS ESTADOS E DF E DE SUAS ENT",
    naturezas: [
      "REC EST - ACOLH MULHERES / REP JOVEM",
      "REC EST - CICLOVIA ARUJÁ - FASE I",
      "REC EST - CONV 100553/24 - RECAP ESTR LIMOEIRO - TRECHO I",
      "REC EST - CONV 101140/24 - REV CICLOVIA AV MÁRIO COVAS",
      "REC EST - EMENDA 2025.3503901.69171",
      "REC EST - INSTRUMENTOS MUSICAIS CCCA",
      "REC EST - RECAP AV. BEHR BRASIL",
      "REC EST - RECAPEAMENTO AV. ADILIA B. NEVES",
      "REC EST - REVITALIZ. AV. CICERA M. RODRIGUES",
      "REC FEAS - AMPLIAÇÃO CRAS",
      "REC FEAS - BENEFÍCIOS EVENTUAIS",
      "REC FEAS - CONFERÊNCIA NACIONAL",
      "REC FEAS - PROTEÇÃO ESPECIAL ALTA COMPLEXID",
      "REC FEAS - PROTEÇÃO ESPECIAL MÉDIA COMPLEXID",
      "REC FEAS - PROTEÇÃO SOCIAL BÁSICA",
      "REC FEAS - VIGILÂNCIA SOCIOASSISTENCIAL",
      "REC SABESP - FUNDO INFRAESTRUTURA",
    ],
  },
  {
    alinea: "OUTRAS TRANSF DE INST PRIV",
    naturezas: [
      "DOAÇÕES FDO ASSIST SOCIAL",
      "DOAÇÕES FDO CRIANÇA E ADOLESCENTE",
      "DOAÇÕES FDO MUNICIPAL DE CULTURA",
      "DOAÇÕES FDO MUNICIPAL DO IDOSO",
      "DOAÇÕES FDO SOCIAL DE SOLIDARIEDADE",
    ],
  },
  {
    alinea: "OUTRAS TRANSF DE REC DA UNIÃO E DE SUAS ENT",
    naturezas: [
      "APOIO FINANCEIRO AOS MUNICÍPIOS - LC 201/2023",
      "COMPENSAÇÃO UNIÃO - LC 176/2020",
      "REC FED - CONSTR MIRANTE PQ DOS IPÊS",
      "REC FED - INFRAESTR PQ PENHINHA",
      "REC FED - LEI ALDIR BLANC - CICLO II",
      "REC FED - MOBIL URB EC 123/2022",
      "REC FED - MODERNIZAÇÃO CAMPO FUTEBOL",
      "REC FED (PAC) - REGULARIZAÇÃO FUNDIÁRIA",
      "REC FED- PAVIM AV SHINJI HIROSE",
      "REC FED- RECAP AV ARMANDO COLANGELO",
      "REC FED - RECAP AV DUTRA - TRECHO I",
      "REC FED- REVIT. R. HIRAYOSHI AMANO",
    ],
  },
  {
    alinea: "OUTRAS TRANSF DE REC DOS ESTADOS",
    naturezas: [
      "REC FEAS - AMPLIAÇÃO CRAS",
    ],
  },
  {
    alinea: "OUTRAS TRANSF DIRETAS DO FNDE",
    naturezas: [
      "FNDE - ESCOLA TEMPO INTEGRAL",
    ],
  },
  {
    alinea: "REM DE DEP BANCÁRIOS",
    naturezas: [
      "REM DEP - AÇÕES SERV SAÚDE",
      "REM DEP - CIDE",
      "REM DEP - DRADS",
      "REM DEP - FDO ASSIST SOCIAL",
      "REM DEP - FDO CRIANÇA ADOLESCENTE",
      "REM DEP - FDO SOCIAL SOLIDARIEDADE",
      "REM DEP - FEAS",
      "REM DEP - FNAS",
      "REM DEP - FNDE",
      "REM DEP - FNS - FUNDO DA SAÚDE",
      "REM DEP - FUNDEB",
      "REM DEP - FUNDIP",
      "REM DEP - FUNDO MUN IDOSO",
      "REM DEP - JUDICIAIS LC 151/15",
      "REM DEP - MANUT DES ENSINO",
      "REM DEP - MULTA TRÂNSITO",
      "REM DEP - OUTROS REC NÃO VINCULADOS",
      "REM DEP - ROYALTIES - EDUCAÇÃO",
      "REM DEP - ROYALTIES - SAÚDE",
      "REM DEP - SUS",
      "REM DEP - TRANSF CONV ESTADO",
      "REM DEP - TRANSF CONV UNIAO",
    ],
  },
  {
    alinea: "TRANSF DE CONV DA UNIÃO DEST A PROG DE EDUC",
    naturezas: [
      "FNDE - CONSTR CRECHE PRÓ INFÂNCIA",
      "FNDE/PAR - AQUISIÇÃO EQUIPAMENTOS",
    ],
  },
  {
    alinea: "TRANSF DE CONV DOS ESTADOS DESTINADAS A PROG DE EDUC",
    naturezas: [
      "REC EST PAINSP - PLANO AÇÕES INTEGRADAS",
    ],
  },
  {
    alinea: "TRANSF DE REC DO FUNDEB DESTINADOS À CRIAÇÃO DE MAT ETI",
    naturezas: [
      "FUNDEB - FOMENTO MATR TEMPO INTEGRAL",
    ],
  },
  {
    alinea: "TRANSF DE REC DO SUS - REP FUNDO A FUNDO - BL DE MANUT DAS AÇÕES E SERV PUB DE SAÚDE",
    naturezas: [
      "FNS - AGENTES COMBATE ENDEMIAS",
      "FNS - ASSIST FARMAC BÁSICA",
      "FNS - GESTÃO DO SUS",
      "FNS - INCREMENTO ATENÇÃO PRIMÁRIA",
      "FNS - INCREMENTO EMENDA 45120001/2026",
      "FNS - INCREMENTO EMENDA 45120002/2026",
      "FNS - INCREMENTO EMENDA 50410001/2026",
      "FNS - INCREMENTO EMENDA 50410002/2026",
      "FNS - INCREMENTO MEDIA ALTA COMPLEXIDADE",
      "FNS - IST / AIDS",
      "FNS - MÉDIA E ALTA COMPLEXIDADE",
      "FNS - PACS",
      "FNS - PISO DE ATENÇÃO PRIMÁRIA",
      "FNS - PISO ENFERMAGEM",
      "FNS - QUALIFAR-SUS",
      "FNS - QUALIFICAÇÃO DAS AÇÕES",
      "FNS - SAMU",
      "FNS - SAÚDE DA FAMÍLIA",
      "FNS - VIGILÂNCIA SANITÁRIA E SAÚDE",
    ],
  },
  {
    alinea: "TRANSF DE RECURSOS DO FNAS",
    naturezas: [
      "FNAS - BOLSA FAMÍLIA E CADASTRO ÚNICO",
      "FNAS - CADASTRO ÚNICO",
      "FNAS - ESTRUTURA SUAS 202537170021",
      "FNAS - FORTALECIMENTO CENTROS POP",
      "FNAS - FORTALECIMENTO CONTROLE SOCIAL",
      "FNAS - PETI",
      "FNAS - PRIMEIRA INFÂNCIA NO SUAS",
      "FNAS - PROCADSUAS",
      "FNAS - PROTEÇÃO SOCIAL BÁSICA",
      "FNAS - PROTEÇÃO SOCIAL ESPECIAL MAC",
      "FNAS - SIGTV SUAS CUSTEIO",
    ],
  },
  {
    alinea: "TRANSF DE RECURSOS DO SUS",
    naturezas: [
      "REC EST - CONTROLE DE GLICEMIA",
      "REC EST - DEMANDA 106366 - EMENDA 2026.A00000685.84268",
      "REC EST- DEMANDAS PARLAMENTARES",
      "REC EST - DOSE CERTA",
      "REC EST - INCENTIVO A GESTÃO MUNICIPAL - IGM SUS",
      "REC EST - SUS - DEMANDAS PARLAMENTARES",
      "REC EST - VIGILÂNCIA EPIDEMIOLÓGICA",
    ],
  },
  {
    alinea: "TRANSF DE RECURSOS DO SUS - FUNDO A FUNDO - BL DE MAN DAS AÇÕES E SERV PUB DE SAÚDE",
    naturezas: [
      "FNS - CONSTRUÇÃO HOSPITAL FEDERAL",
      "FNS - EQUIP. ATENÇÃO ESPECIALIZADA",
      "FNS - EQUIP. ATENÇÃO PRIMÁRIA",
      "FNS - EQUIP - HOSPITAL FEDERAL",
    ],
  },
  {
    alinea: "TRANSF DIRETAS DO FNDE REF AO PROG DINHEIRO DIRETO NA ESCOLA - PDDE",
    naturezas: [
      "TRANSF FNDE - PDDE - PRG DINHEIRO DIRETO ESCOLA",
    ],
  },
  {
    alinea: "TRANSF DO SALÁRIO EDUCAÇÃO",
    naturezas: [
      "TRANSF SALÁRIO-EDUCAÇÃO - QSE",
    ],
  },
  {
    alinea: "TRANSF ESPECIAL DA UNIÃO",
    naturezas: [
      "REC FED - TRANSF ESP - EMENDA 202441550010",
      "REC FED - TRANSF ESP - EMENDA 202544150001",
      "REC FED - TRANSF ESP - EMENDA 202545120005",
    ],
  },
  {
    alinea: "TRANSF REF AO PNAE",
    naturezas: [
      "TRANSF FNDE - PNAE - PRG NAC ALIM ESCOLAR",
    ],
  },
  {
    alinea: "TRANSF REF AO PNATE",
    naturezas: [
      "TRANSF FNDE - PNATE - PRG NAC TRANSP ESCOLAR",
    ],
  },
  {
    alinea: "TRANSFERÊNCIAS DE CONVÊNIOS DOS ESTADOS PARA O SISTEMA ÚNICO DE SAÚDE - SUS",
    naturezas: [
      "REC EST - EQUIP - HOSPITAL FEDERAL",
    ],
  },
  {
    alinea: "TRANSFERÊNCIAS DE RECURSOS DO FUNDEB",
    naturezas: [
      "FUNDEB - FDO MANUT DESENV EDUC BÁSICA",
    ],
  },
  {
    alinea: "TX DE INSPEÇÃO, CONTROLE E FISC",
    naturezas: [
      "ESTACIONAMENTO ROTATIVO",
      "FEIRAS, BARRACAS",
      "OUTRAS TAXAS EXERCICIO PODER DE POLÍCIA",
      "OUTROS TRIBUTOS - DÍVIDA ATIVA",
      "OUTROS TRIBUTOS -DÍVIDA ATIVA- MULTAS E JUROS",
      "OUTROS TRIBUTOS - MULTAS E JUROS",
      "TAXA DE FISCALIZAÇÃO DE VIGILÂNCIA SANITÁRIA",
      "TAXA LICENÇA EXECUÇÃO DE OBRAS",
      "TAXA LIC FUNC ESTAB COM IND PREST SERVIÇOS",
      "TAXA VIG SANIT - DÍVIDA ATIVA",
      "TAXA VIG SANIT - MULTAS E JUROS",
    ],
  },
  {
    alinea: "TX PELA PRESTAÇÃO DE SERV EM GERAL",
    naturezas: [
      "EMOLUMENTOS E CUSTAS PROC ADMINISTR",
      "OUTRAS TAXAS PRESTAÇÃO DE SERVIÇOS",
      "TAXA DE CEMITÉRIOS",
      "TAXA DE COMPENSAÇÃO AMBIENTAL - TCA",
    ],
  },
]
