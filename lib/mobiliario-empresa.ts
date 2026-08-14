import { agentQuery } from '@/lib/agent'

const S = 'pref_aruja_sp'
const num = (v: unknown) => Number(v) || 0
const esc = (s: string) => s.replace(/'/g, "''")

// Simples Nacional / MEI oficiais (Receita Federal) — best-effort: tb_aux_rf_simples é
// keyed por CNPJ raiz (8 dígitos) e pode negar SELECT por permissão; nesse caso retorna
// null e o chamador cai no MEI cadastral (ds_tipo_empresa) como aproximação. Inclui as
// datas de opção/exclusão — histórico de quando entrou/saiu do MEI e do Simples Nacional.
interface RfSimples { simples: boolean; mei: boolean; dtOpcaoSimples: string; dtExclusaoSimples: string; dtOpcaoMei: string; dtExclusaoMei: string }
async function simplesMei(cnpjRaiz: string): Promise<RfSimples | null> {
  if (!cnpjRaiz) return null
  try {
    const r = await agentQuery(`SELECT TOP 1 IC_SIMPLES, IC_MEI,
        DATEFORMAT(DT_OPCAO_SIMPLES,'yyyy-mm-dd') dt_op_s, DATEFORMAT(DT_EXCLUSAO_SIMPLES,'yyyy-mm-dd') dt_ex_s,
        DATEFORMAT(DT_OPCAO_MEI,'yyyy-mm-dd') dt_op_m, DATEFORMAT(DT_EXCLUSAO_MEI,'yyyy-mm-dd') dt_ex_m
      FROM ${S}.TB_AUX_RF_SIMPLES WHERE NO_CNPJ_RAIZ = '${esc(cnpjRaiz)}'`, 1)
    const row = r.rows[0]
    if (!row) return null
    return {
      simples: String(row[0] ?? '').trim().toUpperCase() === 'S',
      mei: String(row[1] ?? '').trim().toUpperCase() === 'S',
      dtOpcaoSimples: String(row[2] ?? '').slice(0, 10), dtExclusaoSimples: String(row[3] ?? '').slice(0, 10),
      dtOpcaoMei: String(row[4] ?? '').slice(0, 10), dtExclusaoMei: String(row[5] ?? '').slice(0, 10),
    }
  } catch {
    return null
  }
}

// Sub-tipo do autônomo (Profissional Liberal × Autônomo geral) — aproximado: não existe
// campo estruturado para essa distinção no cadastro, então classifica por palavras-chave
// de profissões regulamentadas no texto livre da atividade (ds_atividade_livre). Só se
// aplica quando ds_tipo_empresa = 'AUTONOMO'; retorna null quando a atividade está vazia
// ou não bate com nenhuma palavra-chave (não dá pra afirmar nada nesse caso).
const RE_PROFISSAO_LIBERAL = /ADVOCACIA|ADVOGAD|M[ÉE]DIC|DENTISTA|ODONTOL[ÓO]G|PSIC[ÓO]LOG|FISIOTERAP|FONOAUDI[ÓO]LOG|VETERIN[ÁA]RI|ENGENHEIR|ARQUITET|CONTAD|CONTABIL|ECONOMISTA|ADMINISTRADOR|NUTRICIONISTA|CORRETOR|DESPACHANTE|JORNALISTA|PUBLICIT[ÁA]RI|TRADUTOR|BI[ÓO]LOG|GE[ÓO]LOG|PROFESSOR/i
function classificarAutonomo(tipoEmpresa: string, atividadeLivre: string): string | null {
  if (tipoEmpresa.toUpperCase() !== 'AUTONOMO') return null
  if (!atividadeLivre) return null
  return RE_PROFISSAO_LIBERAL.test(atividadeLivre) ? 'Profissional Liberal' : 'Autônomo'
}

// Histórico de cadastros MEI da mesma pessoa (cd_contr) — cobre o caso de MEI que encerrou
// e reabriu (cada ciclo vira uma linha nova em tb_dsod_contribuinte_mobiliario, com o mesmo
// cd_contr mas cd_contr_mob diferente). Exclui o registro atual (idAtual) da lista, já que
// ele já aparece no detalhe principal.
interface CicloMei { cd: number; situacao: string; dtInicio: string; dtEnc: string }
async function historicoMei(cdContr: number, idAtual: number): Promise<CicloMei[]> {
  if (!cdContr) return []
  const r = await agentQuery(`
    SELECT m.cd_contr_mob, m.ds_situacao,
      DATEFORMAT(m.dt_inicio_atividade,'yyyy-mm-dd') dt_ini, DATEFORMAT(m.dt_enc_atividade,'yyyy-mm-dd') dt_enc
    FROM ${S}.tb_dsod_contribuinte_mobiliario m
    WHERE m.cd_contr = ${cdContr} AND m.ds_tipo_empresa = 'MEI'
    ORDER BY m.dt_inicio_atividade`, 50)
  return r.rows
    .map(x => ({ cd: num(x[0]), situacao: String(x[1] ?? '').trim(), dtInicio: String(x[2] ?? '').slice(0, 10), dtEnc: String(x[3] ?? '').slice(0, 10) }))
    .filter(c => c.cd !== idAtual)
}

// Detalhe da empresa: identidade + atividade principal (ds_grupo — melhor cobertura do
// que ds_atividade_livre, que é texto livre e fica nulo/vazio na maior parte da base).
// Usada por /api/mobiliario/empresa (busca/consulta cadastral) e por
// /api/mobiliario/iss-fora-cadastro (drill de dados cadastrais do prestador no card ISS
// Prestador de Fora do Município) — extraída pra lib porque route.ts do App Router só pode
// exportar os handlers HTTP reconhecidos (GET/POST/...), não funções auxiliares soltas.
export async function detalhe(id: number) {
  const r = await agentQuery(`SELECT m.cd_contr_mob, cp.nm_rsocial, cp.nm_fantasia, cp.no_cpf_cnpj, cp.ic_pessoa,
      m.ds_situacao, m.ds_grupo, m.ds_atividade_livre, m.ds_porte_empresa, m.ds_nat_juridica, m.ic_micro_empresa,
      m.ds_inscricao_municipal, m.vl_capital_social, m.qt_funcionarios,
      DATEFORMAT(m.dt_inicio_atividade,'yyyy-mm-dd') dt_ini, DATEFORMAT(m.dt_enc_atividade,'yyyy-mm-dd') dt_enc,
      c.ds_endereco, c.nm_bairro, c.no_cep, m.no_logr, m.ds_complemento, m.ds_tipo_empresa, cp.no_cnpj_raiz,
      m.ic_autorizacao_nfe, DATEFORMAT(m.dt_autorizacao_nf,'yyyy-mm-dd') dt_nf, m.cd_contr
    FROM ${S}.tb_dsod_contribuinte_mobiliario m
    JOIN ${S}.tb_dsod_contribuinte cp ON cp.cd_contr = m.cd_contr
    LEFT JOIN ${S}.tb_dsod_cep c ON c.cd_cep = m.cd_cep
    WHERE m.cd_contr_mob = ${id}`, 1)
  const x = r.rows[0] ?? []
  const numero = String(x[19] ?? '').trim()
  const complemento = String(x[20] ?? '').trim()
  const tipoEmpresa = String(x[21] ?? '').trim()
  const cnpjRaiz = String(x[22] ?? '').trim()
  const emiteNota = String(x[23] ?? '').trim().toUpperCase() === 'A'
  const dtAutorizacaoNf = String(x[24] ?? '').slice(0, 10)
  const cdContr = num(x[25])
  const [rf, historico] = await Promise.all([
    simplesMei(cnpjRaiz),
    tipoEmpresa.toUpperCase() === 'MEI' ? historicoMei(cdContr, id) : Promise.resolve([]),
  ])
  const atividadeLivre = String(x[7] ?? '').trim()
  return {
    cd: num(x[0]), nome: String(x[1] ?? '').trim(), fantasia: String(x[2] ?? '').trim(),
    cnpjCpf: String(x[3] ?? '').trim(), pessoaFisica: String(x[4] ?? '').trim().toUpperCase() === 'F',
    situacao: String(x[5] ?? '').trim(),
    atividadePrincipal: String(x[6] ?? '').trim() || 'Não informada',
    atividadeLivre,
    porte: String(x[8] ?? '').trim(), naturezaJuridica: String(x[9] ?? '').trim(),
    microEmpresa: String(x[10] ?? '').trim().toUpperCase() === 'S',
    inscricaoMunicipal: String(x[11] ?? '').trim(), capitalSocial: num(x[12]), qtdFuncionarios: num(x[13]),
    dataInicioAtividade: String(x[14] ?? '').slice(0, 10), dataEncAtividade: String(x[15] ?? '').slice(0, 10),
    endereco: `${String(x[16] ?? '').trim()}${numero ? ', ' + numero : ''}${complemento ? ' — ' + complemento : ''}`,
    bairro: String(x[17] ?? '').trim(), cep: String(x[18] ?? '').trim(),
    tipoEmpresa,
    // MEI: usa a base oficial da Receita quando disponível; senão cai no cadastro municipal.
    mei: rf ? rf.mei : tipoEmpresa.toUpperCase() === 'MEI',
    // Simples Nacional: só a base oficial da Receita responde isso — null = indisponível.
    simplesNacional: rf ? rf.simples : null,
    // Histórico de opção/exclusão — só disponível junto com a base oficial da Receita.
    dtOpcaoSimples: rf?.dtOpcaoSimples ?? '', dtExclusaoSimples: rf?.dtExclusaoSimples ?? '',
    dtOpcaoMei: rf?.dtOpcaoMei ?? '', dtExclusaoMei: rf?.dtExclusaoMei ?? '',
    // Emissão de nota fiscal: ic_autorizacao_nfe = 'A' (Autorizado) ⇔ tem dt_autorizacao_nf.
    emiteNota, dtAutorizacaoNf,
    // Sub-tipo do autônomo — aproximado por palavras-chave, ver classificarAutonomo().
    subTipoAutonomo: classificarAutonomo(tipoEmpresa, atividadeLivre),
    // Outros ciclos de abertura/encerramento do MEI (mesma pessoa, cd_contr_mob diferente).
    historicoMei: historico,
  }
}

export type DetalheEmpresa = Awaited<ReturnType<typeof detalhe>>
