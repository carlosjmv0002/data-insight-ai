import {
  DatasetCatalogItem,
  DatasetProfile,
  DataDictionaryEntry,
  ChatMessage,
  ChartDataPayload,
  QueryTransparencyDetails,
  AutomatedInsight,
} from '../../src/types';
import { DuckDBManager } from '../duckdb/db';
import { SafeQueryBuilder } from '../tools/queryBuilder';

export interface OpenRouterModelOption {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  description: string;
  isFree: boolean;
}

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B (Free)',
    provider: 'Google DeepMind',
    contextLength: 262144,
    description: '30.7B multimodal com raciocínio e function calling nativo',
    isFree: true,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google Gemma 4 26B MoE (Free)',
    provider: 'Google DeepMind',
    contextLength: 262144,
    description: 'Mixture-of-Experts ultrarrápido com 3.8B parâmetros ativos',
    isFree: true,
  },
  {
    id: 'openai/gpt-oss-20b:free',
    name: 'OpenAI gpt-oss-20b (Free)',
    provider: 'OpenAI',
    contextLength: 131072,
    description: '21B MoE da OpenAI com suporte a tool use e JSON schemas',
    isFree: true,
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere North Mini Code (Free)',
    provider: 'Cohere',
    contextLength: 256000,
    description: '30B MoE otimizado para geração de código SQL e tarefas agênticas',
    isFree: true,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'NVIDIA Nemotron 3 Super (Free)',
    provider: 'NVIDIA',
    contextLength: 262144,
    description: '120B MoE (12B ativos) para raciocínio analítico e multi-agent',
    isFree: true,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA Nemotron 3 Ultra (Free)',
    provider: 'NVIDIA',
    contextLength: 1000000,
    description: '550B MoE (55B ativos) para raciocínio complexo e 1M contexto',
    isFree: true,
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'NVIDIA Nemotron 3 Nano (Free)',
    provider: 'NVIDIA',
    contextLength: 256000,
    description: '30B MoE leve e rápido para consultas ágeis',
    isFree: true,
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Auto-Router',
    provider: 'OpenRouter',
    contextLength: 200000,
    description: 'Roteador inteligente automático entre os melhores modelos gratuitos',
    isFree: true,
  },
];

export class OpenRouterEdaAgent {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKeyOverride?: string) {
    this.apiKey = apiKeyOverride || process.env.OPENROUTER_API_KEY || '';
    this.defaultModel =
      process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
  }

  public setApiKey(key: string) {
    this.apiKey = key || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * OpenAI-compatible tool specifications for OpenRouter
   */
  private getToolsDefinition() {
    return [
      {
        type: 'function',
        function: {
          name: 'execute_sql_query',
          description:
            'Executa consulta SQL (SELECT / WITH) analítica direta no DuckDB. Use para calcular somas (SUM), médias (AVG), medianas (MEDIAN), contagens (COUNT), agrupamentos (GROUP BY), rankings (ORDER BY ... DESC LIMIT N), séries temporais e filtros condicionais (WHERE). Retorna os dados exatos do banco de dados.',
          parameters: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description:
                  'Consulta SQL a executar. Ex: SELECT NOME_FORNECEDOR, SUM(VLR_NF) AS TOTAL FROM "notas_fiscais_2024" WHERE STATUS_PAGTO = \'Pago\' GROUP BY 1 ORDER BY 2 DESC LIMIT 5. Para datas mensais use: strftime(CAST("DT_EMISSAO" AS TIMESTAMP), \'%Y-%m\') ou SUBSTRING(CAST("DT_EMISSAO" AS VARCHAR), 1, 7)',
              },
              explanation: {
                type: 'string',
                description: 'Objetivo da consulta em 1 frase.',
              },
            },
            required: ['sql'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generate_chart',
          description:
            'Configura um gráfico interativo (barras, linha, pizza, área) para ilustrar os resultados calculados no DuckDB.',
          parameters: {
            type: 'object',
            properties: {
              chartType: {
                type: 'string',
                enum: ['bar', 'line', 'pie', 'area', 'scatter'],
                description: 'Tipo de gráfico ideal para a métrica.',
              },
              title: {
                type: 'string',
                description: 'Título claro do gráfico.',
              },
              xAxis: {
                type: 'string',
                description: 'Nome da coluna para o eixo X (dimensão ou período).',
              },
              yAxis: {
                type: 'string',
                description: 'Nome da coluna de valor numérico para o eixo Y.',
              },
              description: {
                type: 'string',
                description: 'Breve nota explicativa do gráfico.',
              },
            },
            required: ['chartType', 'title', 'xAxis', 'yAxis'],
          },
        },
      },
    ];
  }

  /**
   * Builds system prompt incorporating catalog metadata, dictionary, and profiles
   */
  private buildSystemPrompt(
    catalog: DatasetCatalogItem[],
    dictionary: Record<string, DataDictionaryEntry>,
    profiles: Record<string, DatasetProfile>
  ): string {
    let prompt = `Você é o **DataInsight AI Specialist**, um agente autônomo de inteligência de dados e Análise Exploratória (EDA) integrado ao **DuckDB**.\n\n`;

    prompt += `### DIRETRIZES FUNDAMENTAIS:\n`;
    prompt += `1. **PRECISÃO ARITMÉTICA EXATA:** Para QUALQUER pergunta que envolva valores, totais, contagens, médias, rankings, agrupamentos ou filtros, você DEVE chamar a ferramenta \`execute_sql_query\` para obter os números exatos do DuckDB. Nunca invente ou estime valores.\n`;
    prompt += `2. **DIALETO DUCKDB:**\n`;
    prompt += `   - Para agrupar por mês/ano: use \`strftime(CAST("COLUNA_DATA" AS TIMESTAMP), '%Y-%m')\` ou \`SUBSTRING(CAST("COLUNA_DATA" AS VARCHAR), 1, 7)\`.\n`;
    prompt += `   - Sempre use aspas duplas para tabelas e colunas: \`SELECT "NOME_FORNECEDOR", SUM("VLR_NF") FROM "notas_fiscais_2024" GROUP BY 1 ORDER BY 2 DESC LIMIT 10\`.\n`;
    prompt += `3. **RESPOSTA ANALÍTICA RICA EM PORTUGUÊS:**\n`;
    prompt += `   - Ao receber o resultado da tool, elabore uma resposta estruturada, profissional e detalhada em Português do Brasil.\n`;
    prompt += `   - Formate valores monetários em R$ (ex: R$ 1.234.567,89) e percentuais com 1 casa decimal.\n`;
    prompt += `   - Destaque o líder, o total geral, a média e a lista detalhada mês a mês ou categoria por categoria.\n\n`;

    prompt += `### TABELAS E ESTRUTURAS DISPONÍVEIS NO DUCKDB:\n`;
    for (const ds of catalog) {
      prompt += `\n- **Tabela \`"${ds.name}"\`** (${ds.rowCount.toLocaleString()} linhas, ${ds.columnCount} colunas):\n`;
      for (const col of ds.columns) {
        const dict = dictionary[col.name.toUpperCase()];
        const desc = dict?.description ? ` — ${dict.description}` : '';
        const unit = dict?.unit ? ` [${dict.unit}]` : '';
        prompt += `  • \`"${col.name}"\` (${col.type}, semântica: ${col.semanticType})${unit}${desc}\n`;
      }
    }

    return prompt;
  }

  /**
   * Main interaction loop with OpenRouter
   */
  public async handleUserMessage(
    userMessage: string,
    history: { sender: string; text: string }[],
    catalog: DatasetCatalogItem[],
    dictionary: Record<string, DataDictionaryEntry>,
    profiles: Record<string, DatasetProfile>,
    db: DuckDBManager,
    requestedModel?: string
  ): Promise<ChatMessage> {
    const candidateModels = [
      requestedModel || this.defaultModel,
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
      'openai/gpt-oss-20b:free',
      'cohere/north-mini-code:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openrouter/free',
    ];
    const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

    const systemPrompt = this.buildSystemPrompt(catalog, dictionary, profiles);
    const tools = this.getToolsDefinition();

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Append recent history
    for (const h of history.slice(-6)) {
      messages.push({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    let lastError: any = null;
    let queryResultData: Record<string, any>[] | null = null;
    let tableColumns: string[] | null = null;
    let chartPayload: ChartDataPayload | undefined = undefined;
    let transparency: QueryTransparencyDetails | undefined = undefined;
    let successfulModel = '';

    for (const model of uniqueModels) {
      try {
        console.log(`[OpenRouter] Sending request using model: ${model}`);
        const res1 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai.studio',
            'X-Title': 'DataInsight AI DuckDB Explorer',
          },
          body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(9000),
        });

        if (!res1.ok) {
          const errData = await res1.json().catch(() => ({}));
          throw new Error(`OpenRouter Error ${res1.status}: ${JSON.stringify(errData)}`);
        }

        const data1 = await res1.json();
        const choice1 = data1.choices?.[0];
        const assistantMsg = choice1?.message;

        if (!assistantMsg) {
          throw new Error('Resposta vazia recebida do OpenRouter.');
        }

        successfulModel = model;

        // Check if model invoked tool calls
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          messages.push(assistantMsg);

          for (const toolCall of assistantMsg.tool_calls) {
            const funcName = toolCall.function?.name;
            let args: any = {};
            try {
              args = JSON.parse(toolCall.function?.arguments || '{}');
            } catch {
              args = {};
            }

            if (funcName === 'execute_sql_query') {
              try {
                const sqlResult = await SafeQueryBuilder.executeRawSqlQuery(db, args.sql);
                queryResultData = sqlResult.data;
                tableColumns = sqlResult.data.length > 0 ? Object.keys(sqlResult.data[0]) : [];
                transparency = sqlResult.transparency;

                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    success: true,
                    rowCount: sqlResult.data.length,
                    columns: tableColumns,
                    data: sqlResult.data.slice(0, 50),
                  }),
                });
              } catch (sqlErr: any) {
                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    error: sqlErr.message,
                    suggestion: 'Ajuste a sintaxe SQL para conformidade DuckDB.',
                  }),
                });
              }
            } else if (funcName === 'generate_chart') {
              chartPayload = {
                chartType: args.chartType || 'bar',
                title: args.title || 'Gráfico Analítico',
                xAxis: args.xAxis,
                yAxis: args.yAxis,
                data: queryResultData || [],
                description: args.description,
              };

              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ success: true }),
              });
            }
          }

          // Step 2: Request final analytical text response
          const res2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://ai.studio',
              'X-Title': 'DataInsight AI DuckDB Explorer',
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.2,
            }),
            signal: AbortSignal.timeout(7000),
          });

          let finalText = '';
          if (res2.ok) {
            const data2 = await res2.json();
            finalText = data2.choices?.[0]?.message?.content?.trim() || '';
          }

          // If text is brief or generic, synthesize an exhaustive analytical summary
          if (!finalText || finalText.length < 25 || finalText.includes('sucesso')) {
            if (queryResultData && queryResultData.length > 0) {
              finalText = this.synthesizeDetailedAnalysis(
                userMessage,
                queryResultData,
                tableColumns || Object.keys(queryResultData[0])
              );
            }
          }

          // Auto create chart if not present and series is suitable
          if (queryResultData && queryResultData.length > 1 && !chartPayload && tableColumns && tableColumns.length >= 2) {
            const xCol = tableColumns[0];
            const yCol = tableColumns.find((c, i) => i > 0 && typeof queryResultData![0][c] === 'number') || tableColumns[1];
            const isTime = /mes|periodo|ano|data|dt_|dia|month|date/i.test(xCol);

            chartPayload = {
              chartType: isTime ? 'line' : 'bar',
              title: isTime ? `Evolução Mensal (${yCol})` : `Distribuição por ${xCol}`,
              xAxis: xCol,
              yAxis: yCol,
              data: queryResultData,
            };
          }

          return {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text: finalText || 'Análise concluída com sucesso no DuckDB.',
            timestamp: new Date().toISOString(),
            tableData: queryResultData || undefined,
            tableColumns: tableColumns || undefined,
            chart: chartPayload,
            transparency,
          };
        } else {
          // Direct text answer without tools (or conversational)
          const text = assistantMsg.content || 'Consulta processada com sucesso.';
          return {
            id: `msg_agent_${Date.now()}`,
            sender: 'agent',
            text,
            timestamp: new Date().toISOString(),
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[OpenRouter] Model ${model} failed:`, err?.message || err);
      }
    }

    throw lastError || new Error('Não foi possível obter resposta dos modelos OpenRouter.');
  }

  /**
   * Synthesizes rich Portuguese analysis for DuckDB rows
   */
  private synthesizeDetailedAnalysis(
    userMessage: string,
    data: Record<string, any>[],
    columns: string[]
  ): string {
    if (!data || data.length === 0) {
      return 'Nenhum registro retornado para a consulta especificada.';
    }

    if (data.length === 1) {
      const row = data[0];
      let text = `### 📊 Resumo Analítico dos Indicadores\n\n`;
      text += `Cálculos exatos realizados no DuckDB:\n\n`;
      for (const [k, v] of Object.entries(row)) {
        const valNum = Number(v);
        const isNum = !isNaN(valNum) && typeof v !== 'boolean' && v !== null;
        const isCurrency = /vlr|valor|total|faturado|preco|soma/i.test(k);
        const formattedVal = isNum
          ? isCurrency
            ? valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : valNum.toLocaleString('pt-BR')
          : String(v);

        text += `• **${k.replace(/_/g, ' ').toUpperCase()}:** **${formattedVal}**\n`;
      }
      return text;
    }

    const firstCol = columns[0];
    const isMonthlyOrTemporal = /mes|periodo|ano|data|dt_|dia|month|date/i.test(firstCol);
    let metricCol = columns.find((c, idx) => idx > 0 && typeof data[0][c] === 'number') || columns[1] || columns[0];
    const isCurrency = /vlr|valor|total|faturado|montante|preco|soma/i.test(metricCol);
    const fmt = (n: number) =>
      isCurrency
        ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    const totalSum = data.reduce((acc, r) => acc + (Number(r[metricCol]) || 0), 0);
    const avg = totalSum / (data.length || 1);

    let maxRow = data[0];
    let minRow = data[0];
    for (const r of data) {
      const val = Number(r[metricCol]) || 0;
      if (val > (Number(maxRow[metricCol]) || 0)) maxRow = r;
      if (val < (Number(minRow[metricCol]) || Infinity)) minRow = r;
    }

    if (isMonthlyOrTemporal) {
      const firstPeriod = data[0][firstCol];
      const lastPeriod = data[data.length - 1][firstCol];

      let text = `### 📈 Evolução Mensal e Totais por Período\n\n`;
      text += `Análise temporal detalhada calculada no DuckDB cobrindo o período de **${firstPeriod} a ${lastPeriod}** (${data.length} meses):\n\n`;
      text += `• **Total Geral no Período:** **${fmt(totalSum)}**\n`;
      text += `• **Média Mensal:** **${fmt(avg)}**\n`;
      text += `• **Mês de Maior Volume (Pico):** **${maxRow[firstCol]}** com **${fmt(Number(maxRow[metricCol]))}** (${((Number(maxRow[metricCol]) / (totalSum || 1)) * 100).toFixed(1)}% do total)\n`;
      text += `• **Mês de Menor Volume:** **${minRow[firstCol]}** com **${fmt(Number(minRow[metricCol]))}**\n\n`;

      text += `**Detalhamento Mês a Mês:**\n`;
      data.forEach((r, idx) => {
        const val = Number(r[metricCol]) || 0;
        const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
        text += `${idx + 1}. **${r[firstCol]}**: ${fmt(val)} (${pct}%)\n`;
      });

      return text;
    }

    let text = `### 🏆 Distribuição e Ranking por **${firstCol.replace(/_/g, ' ').toUpperCase()}**\n\n`;
    text += `Resultados consolidados calculados diretamente no DuckDB (${data.length} registros exibidos):\n\n`;
    text += `• **Total Consolidado:** **${fmt(totalSum)}**\n`;
    text += `• **Principal Destaque (1º Lugar):** **${maxRow[firstCol]}** com **${fmt(Number(maxRow[metricCol]))}** (${((Number(maxRow[metricCol]) / (totalSum || 1)) * 100).toFixed(1)}% do total)\n\n`;

    text += `**Rankings / Valores por Categoria:**\n`;
    data.slice(0, 15).forEach((r, idx) => {
      const val = Number(r[metricCol]) || 0;
      const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
      text += `${idx + 1}. **${r[firstCol]}**: ${fmt(val)} (${pct}%)\n`;
    });

    return text;
  }
}
