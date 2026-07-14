import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { agentQuery } from '@/lib/agent'
import { getSchemaContext } from '@/lib/schema-cache'
import { getCatalog, catalogToPromptContext } from '@/lib/catalog-cache'
import { REGRAS_NEGOCIO } from '@/lib/regras-negocio'
import type { Perfil } from '@/lib/perfil'

// Restrição de tópicos conforme o perfil do usuário
function restricaoChat(perfil: Perfil): string {
  if (perfil === 'orcamentario') {
    return `

══════════════════════════════════════════
RESTRIÇÃO DE PERFIL — ORÇAMENTÁRIO (OBRIGATÓRIA):
══════════════════════════════════════════
Você SÓ pode responder sobre ORÇAMENTO/orçamentário: receita e despesa orçamentária,
LOA, dotação, previsão, alteração e execução orçamentária (tabelas FATO_BIORC_* / DIM_BIORC_*).
Se a pergunta for sobre tributos cadastrais (IPTU/ISS/ITBI por imóvel/contribuinte), contribuintes,
dívida ativa, cobrança, mobiliário/imobiliário ou reforma tributária, RECUSE educadamente:
"Meu perfil atende apenas assuntos orçamentários. Para tributos, use o perfil tributário." NÃO consulte
essas tabelas nem tente responder.`
  }
  if (perfil === 'tributario') {
    return `

══════════════════════════════════════════
RESTRIÇÃO DE PERFIL — TRIBUTÁRIO (OBRIGATÓRIA):
══════════════════════════════════════════
Você pode responder sobre TODOS os assuntos EXCETO orçamento/orçamentário. Se a pergunta for sobre
receita/despesa ORÇAMENTÁRIA, LOA, dotação, previsão ou execução orçamentária (tabelas FATO_BIORC_* /
DIM_BIORC_*), RECUSE educadamente: "Meu perfil não atende assuntos orçamentários. Para orçamento, use o
perfil orçamentário." NÃO consulte essas tabelas nem tente responder. Tributos, contribuintes, dívida
ativa, cobrança e reforma são liberados normalmente.`
  }
  return ''
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'executar_query',
    description: 'Executa uma query SELECT no Sybase IQ. Use APENAS para buscar dados — nunca para explorar metadados do banco.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Query SELECT válida para Sybase IQ' },
        limit: { type: 'number', description: 'Máximo de linhas (padrão 200)' },
      },
      required: ['sql'],
    },
  },
]

function buildSystemPrompt(schemaContext: string, catalogContext: string): string {
  return `Você é um analista de dados sênior da Prefeitura de Arujá (SP).
Seu trabalho é RESPONDER PERGUNTAS DE NEGÓCIO com dados reais do banco Sybase IQ.

══════════════════════════════════════════
PROIBIDO — NUNCA FAÇA ISSO:
══════════════════════════════════════════
✗ Consultar SYS.SYSTAB, SYS.SYSTABCOL, INFORMATION_SCHEMA ou qualquer tabela de metadados
✗ Rodar queries de "exploração" para descobrir tabelas ou colunas
✗ Fazer mais de 6 queries por resposta
✗ Responder sem interpretar os dados (não liste só os resultados — analise)
✗ Usar LIMIT (Sybase IQ usa TOP N)
✗ Usar UPPER() ou LOWER() para comparar strings
✗ Consultar tabelas sem o prefixo pref_aruja_sp.

══════════════════════════════════════════
VOCÊ JÁ SABE TUDO SOBRE O BANCO:
══════════════════════════════════════════
O schema completo está listado abaixo. Leia-o, identifique as tabelas certas e execute a query diretamente.
NÃO faça queries para descobrir o schema — ele está aqui.

══════════════════════════════════════════
SINTAXE OBRIGATÓRIA — SYBASE IQ:
══════════════════════════════════════════
• TOP N:        SELECT TOP 20 col FROM pref_aruja_sp.TABELA  (nunca LIMIT)
• Datas:        YEAR(col), MONTH(col), DATEFORMAT(col,'yyyy-mm-dd')
• Cast:         CONVERT(NUMERIC,col) ou CAST(col AS NUMERIC)
• Nulos:        ISNULL(col, 0)
• Concatenar:   col1 || ' ' || col2
• Sem GROUP_CONCAT: use LIST(col, ',')
• Nomes de colunas: use EXATAMENTE como estão no schema (case-sensitive)
• Se a query falhar: leia o erro, corrija e tente de novo (máx 2 tentativas)

══════════════════════════════════════════
REGRAS DE NEGÓCIO — ANO / EXERCÍCIO:
══════════════════════════════════════════
• NUNCA use YEAR(NOW()) para filtrar dados orçamentários — o relógio retorna 2026 mas os dados são de 2025.
• O exercício mais recente com dados é 2025. Use SEMPRE: WHERE d.NO_ANO = 2025
• Se o usuário pedir "ano atual" ou "este ano" sem especificar, use 2025.
• Se quiser confirmar o ano mais recente disponível, rode antes:
    SELECT MAX(NO_ANO) FROM pref_aruja_sp.DIM_BIORC_DATA_CALENDARIO
  e use esse valor no filtro.

══════════════════════════════════════════
REGRAS DE NEGÓCIO — DIM_BIORC_INSTITUCIONAL:
══════════════════════════════════════════
• SECRETARIAS da prefeitura = poder executivo: CD_ORGAO = '1' E DS_UO <> DS_ORGAO
• CD_ORGAO = '2' → Câmara Municipal (poder LEGISLATIVO) — NÃO é secretaria da prefeitura
• CD_ORGAO negativo ('-1', '-2', '-3') → registros sem classificação — excluir de análises
• Quando DS_UO = DS_ORGAO → linha genérica do órgão inteiro, NÃO uma secretaria específica
• CD_ORGAO é VARCHAR — SEMPRE use aspas simples: CD_ORGAO = '1', NUNCA CD_ORGAO = 1
• SEMPRE que a pergunta for sobre "secretarias" ou "por secretaria":
    use: AND i.CD_ORGAO = '1' AND i.DS_UO <> i.DS_ORGAO

══════════════════════════════════════════
COMO RESPONDER:
══════════════════════════════════════════
1. Identifique as tabelas relevantes no schema abaixo
2. Execute a query (máx 6 queries por resposta; ao terminar de coletar, ESCREVA a resposta — nunca pare sem responder)
3. ESTRUTURA OBRIGATÓRIA da resposta — nesta ordem exata:
   a) **Insights** primeiro: escreva 2-4 frases destacando o número mais importante,
      tendências, comparações ou alertas. Use **negrito** para valores-chave.
   b) **Tabela** depois: apresente os dados em formato markdown (| col | col |).
   c) **Conclusão** opcional: uma frase final se houver algo relevante a acrescentar.
   NUNCA coloque a tabela antes dos insights. Sempre texto analítico → tabela.
4. NÃO inclua blocos \`\`\`sql na resposta — a query já fica disponível no painel "Ver query"
5. NUNCA gere gráficos em texto, ASCII art, blocos de código ou caracteres especiais.
   O frontend já converte automaticamente tabelas markdown em gráficos interativos.
   Para mostrar um gráfico: simplesmente retorne os dados em tabela markdown (| col | col |).
6. Se o dado não existir, diga claramente qual tabela foi consultada e o que encontrou

══════════════════════════════════════════
PERFORMANCE — CONSULTAS PESADAS (evite timeout / erro 524):
══════════════════════════════════════════
• Há um limite de ~100s por consulta. Agregações de IPTU que cruzam guias × parcelas ×
  posição/movimento × imóvel × CEP e agrupam por bairro/rua/contribuinte são LENTAS.
• Ao analisar IPTU por bairro, rua, contribuinte ou inadimplência, SEMPRE:
  - filtre UM exercício específico: AND g.no_exercicio_lancamento = 2026 (nunca todos os anos);
  - use TOP N (ex.: TOP 20) e ORDER BY para trazer só o ranking pedido;
  - evite JOINs desnecessários; para "inadimplência/vencido" use a posição da parcela
    (tb_dsod_parcela_posicao.vl_saldo com dt_vencimento < getdate()).
• Se a consulta puder ser muito pesada, prefira um recorte menor (um ano, os N maiores) e
  avise que é uma amostra. NÃO tente varrer todos os exercícios de uma vez.

══════════════════════════════════════════
RELATÓRIOS (PDF e EXCEL) — estrutura do template institucional:
══════════════════════════════════════════
• Vale tanto para "relatório em PDF" quanto para "relatório em Excel/planilha (.xlsx)": o sistema
  mostra AUTOMATICAMENTE o botão certo ("Baixar PDF" e/ou "Baixar Excel") abaixo da sua resposta,
  gerado a partir do MESMO conteúdo. Estruture a resposta igual nos dois casos.
• Se o usuário pedir um relatório (PDF ou Excel), produza o conteúdo NESTA ordem exata:
  1. TÍTULO em nível 1 — "# Título descritivo do relatório" (ex.: # Histórico Mensal de Arrecadação por Ano)
  2. Uma linha de SUBTÍTULO (um parágrafo curto) descrevendo o que o relatório apresenta.
  3. Seção de DESTAQUES para virar os cards do topo — exatamente assim:
       ## Destaques
       - <Rótulo curto>: <valor>
       - <Rótulo curto>: <valor>
     REGRAS DOS CARDS (importante):
       • 2 a 4 itens, cada um vira um card (KPI).
       • RÓTULO curto (1–3 palavras). VALOR curto, COMPLETO e quantificável — um número, valor em R$,
         percentual ou código. NUNCA uma frase ou texto cortado.
         BOM: "- Total Lançado 2026: R$ 4.488,44" | "- Arrecadado: 60%" | "- Inscrição: SE11161203.000"
         RUIM: "- Histórico de: 100% em dia nos últimos" | "- Localização: AL Via Láctea, nº" (frases/cortados)
       • Use SOMENTE métricas que façam sentido como KPI para a análise pedida.
       • Se a análise NÃO tiver KPIs numéricos claros, OMITA a seção "## Destaques" (o relatório fica sem cards).
  4. Insights em texto (2–4 frases analíticas).
  5. Uma ou mais TABELAS markdown (| col | col |) com os dados detalhados.
• O sistema exibe AUTOMATICAMENTE o botão de download (PDF e/ou Excel) logo abaixo da sua resposta,
  gerando o arquivo no template da Prefeitura (cabeçalho, cores, cards, tabelas). Portanto: NÃO diga
  que não consegue gerar PDF/Excel, NÃO invente links de download, NÃO gere o arquivo você mesmo —
  apenas escreva o conteúdo (as TABELAS markdown são essenciais, principalmente para o Excel).

${REGRAS_NEGOCIO}
══════════════════════════════════════════
${catalogContext ? catalogContext + '\n\n' : '⚠️  Catálogo semântico não gerado ainda. Acesse /catalogo para gerar.\n\n'}══════════════════════════════════════════
SCHEMA TÉCNICO COMPLETO — pref_aruja_sp:
══════════════════════════════════════════
${schemaContext}
══════════════════════════════════════════`
}

export async function POST(req: NextRequest) {
  const session = getSession()
  if (!session) return new Response('Não autenticado', { status: 401 })

  const { messages, forceRefreshSchema } = await req.json()

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  async function send(payload: object) {
    await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
  }

  async function run() {
    try {
      const schemaContext = await getSchemaContext(forceRefreshSchema ?? false)
      const catalog = getCatalog()
      const catalogContext = catalog ? catalogToPromptContext(catalog) : ''
      const systemPrompt = buildSystemPrompt(schemaContext, catalogContext) + restricaoChat(session!.role)

      const msgs: Anthropic.MessageParam[] = [...messages]
      let queryCount = 0
      let answered = false
      const MAX_QUERIES = 6

      for (let turn = 0; turn < 12; turn++) {
        let response: Anthropic.Message | null = null
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            response = await client.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4096,
              system: systemPrompt,
              tools: queryCount >= MAX_QUERIES ? [] : TOOLS,
              messages: msgs,
            })
            break
          } catch (err: unknown) {
            const status = (err as { status?: number }).status
            if (status === 529 && attempt < 3) {
              const wait = (attempt + 1) * 8000
              await send({ type: 'text', text: `_(API sobrecarregada, tentando novamente em ${wait / 1000}s…)_\n` })
              await new Promise(r => setTimeout(r, wait))
              continue
            }
            throw err
          }
        }
        if (!response) throw new Error('Falha após 4 tentativas (API overloaded)')

        let temTexto = false
        for (const block of response.content) {
          if (block.type === 'text' && block.text) {
            temTexto = true
            await send({ type: 'text', text: block.text })
          }
        }

        if (response.stop_reason === 'end_turn') {
          if (temTexto) answered = true
          msgs.push({ role: 'assistant', content: response.content })
          break
        }

        if (response.stop_reason === 'tool_use') {
          msgs.push({ role: 'assistant', content: response.content })
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const block of response.content) {
            if (block.type !== 'tool_use' || block.name !== 'executar_query') continue

            queryCount++
            const input = block.input as { sql: string; limit?: number }

            await send({ type: 'tool_start', name: 'executar_query', sql: input.sql })

            let resultContent: string
            try {
              const result = await agentQuery(input.sql, input.limit ?? 200)
              resultContent = JSON.stringify(result)
              await send({ type: 'tool_end', name: 'executar_query', rows: result.count })
            } catch (e) {
              resultContent = JSON.stringify({ error: String(e) })
              await send({ type: 'tool_end', name: 'executar_query', error: String(e) })
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: resultContent,
            })
          }

          msgs.push({ role: 'user', content: toolResults })
        }
      }

      // Rede de segurança: se terminou sem resposta final (ex.: atingiu o limite
      // de consultas), força uma conclusão com os dados já coletados.
      if (!answered) {
        msgs.push({
          role: 'user',
          content: 'Com base apenas nos dados já retornados acima, escreva agora a resposta final seguindo a estrutura obrigatória (insights em texto e depois a tabela markdown). NÃO use ferramentas e não peça mais consultas.',
        })
        const final = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: msgs,
        })
        for (const block of final.content) {
          if (block.type === 'text' && block.text) await send({ type: 'text', text: block.text })
        }
      }
    } catch (e) {
      await send({ type: 'error', text: `Erro: ${String(e)}` })
    } finally {
      await send({ type: 'done' })
      await writer.close()
    }
  }

  run()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
