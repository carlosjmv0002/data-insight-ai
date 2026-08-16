import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import {
  AutomatedInsight,
  ChatMessage,
  DatasetCatalogItem,
  DatasetProfile,
  DataDictionaryEntry,
  ChartDataPayload,
  QueryTransparencyDetails,
} from '../../src/types';
import { DuckDBManager } from '../duckdb/db';
import { SafeQueryBuilder, StructuredQueryInput } from '../tools/queryBuilder';
import { ProfilingService } from '../services/profilingService';

export class GeminiEdaAgent {
  private ai: GoogleGenAI;
  private modelName: string;
  private customApiKey?: string;

  constructor(apiKeyOverride?: string) {
    const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
    this.customApiKey = apiKey;
    this.modelName = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    this.ai = new GoogleGenAI({
      apiKey: apiKey || 'dummy-key-for-init',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  public setApiKey(apiKey: string) {
    this.customApiKey = apiKey;
    this.ai = new GoogleGenAI({
      apiKey: apiKey || 'dummy-key-for-init',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  public isConfigured(): boolean {
    const key = this.customApiKey || process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('dummy-key'));
  }

  /**
   * Tool Declarations for Gemini Function Calling
   */
  private getToolDeclarations(): FunctionDeclaration[] {
    const executeSqlQueryDecl: FunctionDeclaration = {
      name: 'execute_sql_query',
      description:
        'Executa uma consulta SQL analítica direta (SELECT / WITH) no DuckDB com suporte a JOINs, WHERE, GROUP BY, ORDER BY, subconsultas, cálculos condicionais e funções estatísticas (SUM, AVG, MEDIAN, COUNT, MIN, MAX). Retorna os dados exatos calculados pelo DuckDB. Para agrupamento mensal por data: use strftime(CAST("DT_EMISSAO" AS TIMESTAMP), \'%Y-%m\') ou SUBSTRING(CAST("DT_EMISSAO" AS VARCHAR), 1, 7).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sql: {
            type: Type.STRING,
            description:
              'Consulta SQL analítica (SELECT/WITH) a executar no DuckDB. Exemplo: SELECT NOME_FORNECEDOR, SUM(VLR_NF) AS TOTAL_FATURADO, COUNT(*) AS QTD_NOTAS FROM "notas_fiscais_2024" WHERE STATUS_PAGTO = \'Pago\' GROUP BY 1 ORDER BY 2 DESC LIMIT 5',
          },
          explanation: {
            type: Type.STRING,
            description: 'Breve explicação do que esta consulta calcula para o usuário.',
          },
        },
        required: ['sql'],
      },
    };

    const listDatasetsDecl: FunctionDeclaration = {
      name: 'list_datasets',
      description: 'Retorna a lista de datasets (tabelas) disponíveis no DuckDB, quantidade de linhas, colunas e descrições do dicionário.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    };

    const inspectDatasetDecl: FunctionDeclaration = {
      name: 'inspect_dataset',
      description: 'Inspeciona um dataset específico retornando seu schema, tipos semânticos, descrições do dicionário e uma amostra de 5 linhas.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          datasetName: {
            type: Type.STRING,
            description: 'Nome da tabela/dataset (ex: notas_fiscais, produtos)',
          },
        },
        required: ['datasetName'],
      },
    };

    const profileDatasetDecl: FunctionDeclaration = {
      name: 'profile_dataset',
      description: 'Retorna o perfil exploratório completo (EDA) de um dataset: contagens, nulos, estatísticas numéricas (média, mediana, IQR, outliers), cardinalidade e qualidade.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          datasetName: {
            type: Type.STRING,
            description: 'Nome da tabela/dataset',
          },
        },
        required: ['datasetName'],
      },
    };

    const queryDatasetDecl: FunctionDeclaration = {
      name: 'query_dataset',
      description: 'Executa consultas analíticas estruturadas no DuckDB (top_n, agregação, agrupamento, séries temporais, crescimento percentual, filtros). O DuckDB calcula os dados reais.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          dataset: {
            type: Type.STRING,
            description: 'Nome do dataset/tabela para consultar',
          },
          operation: {
            type: Type.STRING,
            enum: ['top_n', 'aggregate', 'group_by', 'time_series', 'growth', 'percent_share', 'filter_select'],
            description: 'Tipo de operação analítica',
          },
          dimension: {
            type: Type.STRING,
            description: 'Coluna categórica para agrupar (ex: fornecedor, categoria, produto, filial)',
          },
          metric: {
            type: Type.STRING,
            description: 'Coluna numérica para calcular (ex: valor, quantidade, preco, total)',
          },
          aggregation: {
            type: Type.STRING,
            enum: ['sum', 'avg', 'count', 'count_distinct', 'min', 'max', 'median'],
            description: 'Função de agregação desejada',
          },
          timeColumn: {
            type: Type.STRING,
            description: 'Coluna de data para análises temporais',
          },
          timeGranularity: {
            type: Type.STRING,
            enum: ['month', 'year', 'quarter', 'day'],
            description: 'Granularidade de tempo',
          },
          orderByDirection: {
            type: Type.STRING,
            enum: ['ASC', 'DESC'],
            description: 'Direção da ordenação (padrão: DESC)',
          },
          limit: {
            type: Type.INTEGER,
            description: 'Quantidade máxima de resultados a retornar (padrão: 10)',
          },
        },
        required: ['dataset', 'operation'],
      },
    };

    const analyzeDataQualityDecl: FunctionDeclaration = {
      name: 'analyze_data_quality',
      description: 'Analisa a qualidade dos dados do dataset (nulos, possíveis duplicidades, outliers via critério IQR e inconsistências).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          datasetName: {
            type: Type.STRING,
            description: 'Nome do dataset',
          },
        },
        required: ['datasetName'],
      },
    };

    const generateChartDecl: FunctionDeclaration = {
      name: 'generate_chart',
      description: 'Solicita a renderização de um gráfico interativo no frontend a partir dos dados obtidos da consulta.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          chartType: {
            type: Type.STRING,
            enum: ['bar', 'line', 'pie', 'area', 'scatter'],
            description: 'Tipo de gráfico ideal para a visualização',
          },
          title: {
            type: Type.STRING,
            description: 'Título claro do gráfico',
          },
          xAxis: {
            type: Type.STRING,
            description: 'Nome da chave/coluna para o eixo X (ou rótulo categórico)',
          },
          yAxis: {
            type: Type.STRING,
            description: 'Nome da chave/coluna para o eixo Y (métrica numérica agregada)',
          },
          description: {
            type: Type.STRING,
            description: 'Breve descrição do insight visual',
          },
        },
        required: ['chartType', 'title', 'xAxis', 'yAxis'],
      },
    };

    return [
      executeSqlQueryDecl,
      listDatasetsDecl,
      inspectDatasetDecl,
      profileDatasetDecl,
      queryDatasetDecl,
      analyzeDataQualityDecl,
      generateChartDecl,
    ];
  }

  /**
   * Builds the comprehensive agent system instructions.
   */
  private getSystemInstruction(
    catalog: DatasetCatalogItem[],
    dictionary: Record<string, DataDictionaryEntry>
  ): string {
    const catalogSummary = catalog
      .map(
        (d) =>
          `- Tabela '${d.name}' (${d.displayName}): ${d.rowCount} linhas, ${d.columnCount} colunas. Colunas: [${d.columns
            .map((c) => `${c.name} (${c.type}/${c.semanticType}${dictionary?.[c.name?.toUpperCase()] ? `: ${dictionary[c.name.toUpperCase()].description}` : ''})`)
            .join(', ')}]`
      )
      .join('\n');

    return `Você é o **DataInsight AI Agent**, um cientista de dados e analista sênior em Análise Exploratória de Dados (EDA) e inteligência analítica para datasets tabulares.

Você trabalha EXCLUSIVAMENTE com os dados reais carregados no banco analítico DuckDB em memória.
Tabelas disponíveis no DuckDB:
${catalogSummary}

### DIRETRIZES DE PRECISÃO E CÁLCULO:
1. **PRECISÃO MATEMÁTICA ABSOLUTA:**
   - NUNCA invente ou estime valores, médias, totais ou rankings de cabeça.
   - SEMPRE execute consultas SQL no DuckDB através de \`execute_sql_query\` ou \`query_dataset\` para obter os dados exatos.
   - Cite os valores exatos retornados na sua resposta.

2. **USO DE FERRAMENTAS SQL (\`execute_sql_query\`):**
   - Para perguntas sobre totais, rankings, médias, agrupamentos, filtros (ex: apenas notas pagas, vendas em SP, produtos de uma categoria) ou cruzamento entre tabelas (JOINs), use a ferramenta \`execute_sql_query\`.
   - Exemplo: \`SELECT NOME_FORNECEDOR, SUM(VLR_NF) AS TOTAL FROM "notas_fiscais_2024" WHERE STATUS_PAGTO = 'Pago' GROUP BY 1 ORDER BY 2 DESC LIMIT 5\`
   - **DIALETO DUCKDB PARA DATAS/SÉRIES TEMPORAIS:**
     - Para extrair ano-mês, use: \`strftime(CAST("DT_EMISSAO" AS TIMESTAMP), '%Y-%m')\` ou \`SUBSTRING(CAST("DT_EMISSAO" AS VARCHAR), 1, 7)\`.
     - Nunca passe formato como primeiro parâmetro sem CAST.
   - Envolva nomes de tabelas e colunas com aspas duplas se contiverem caracteres especiais ou números.

3. **VISUALIZAÇÃO DE DADOS (\`generate_chart\`):**
   - Quando a resposta envolver rankings, comparações categóricas ou séries temporais, chame também \`generate_chart\` indicando o tipo (bar, line, pie, area) e os nomes exatos das colunas do resultado para xAxis e yAxis.

4. **FORMATAÇÃO E APRESENTAÇÃO:**
   - Formate valores monetários em Real brasileiro: \`R$ 1.234,56\`.
   - Formate números decimais com vírgula: \`12,34\`.
   - Formate percentuais: \`12,34%\`.
   - Destaque os principais achados em tópicos com marcadores (bullet points) para fácil leitura pelo usuário.

5. **LIMITES DE ESCOPO:**
   - Se o usuário perguntar algo totalmente não relacionado aos dados (ex: piadas, fofocas, código genérico), responda educadamente que seu foco é a análise dos dados disponíveis no projeto.`;
  }

  /**
   * Generates automated high-level insights from the initial dataset profiling.
   */
  public async generateInitialInsights(
    profiles: Record<string, DatasetProfile>,
    dictionary: Record<string, DataDictionaryEntry>
  ): Promise<AutomatedInsight[]> {
    const insights: AutomatedInsight[] = [];
    const profileList = Object.values(profiles);

    if (profileList.length === 0) return insights;

    // First generate factual algorithmic insights from DuckDB profiles
    for (const p of profileList) {
      // 1. Overall volume
      insights.push({
        id: `vol_${p.datasetId}`,
        title: `Dataset ${p.displayName} Carregado`,
        description: `Total de ${p.rowCount.toLocaleString('pt-BR')} registros e ${p.columnCount} variáveis identificadas e perfiladas com sucesso.`,
        type: 'highlight',
        datasetName: p.displayName,
      });

      // 2. High null warning
      if (p.quality.columnsWithHighNulls.length > 0) {
        insights.push({
          id: `nulls_${p.datasetId}`,
          title: `Campos com Valores Ausentes`,
          description: `Identificados campos com alta taxa de nulos: ${p.quality.columnsWithHighNulls
            .map((c) => `${c.column} (${c.nullPercentage}%)`)
            .join(', ')}.`,
          type: 'warning',
          datasetName: p.displayName,
        });
      }

      // 3. Outlier detection
      if (p.quality.columnsWithOutliers.length > 0) {
        const topOutlier = p.quality.columnsWithOutliers[0];
        insights.push({
          id: `outlier_${p.datasetId}`,
          title: `Detecção de Outliers Estatísticos`,
          description: `Identificados ${topOutlier.outlierCount} possíveis outliers no campo '${topOutlier.column}' (${topOutlier.outlierPercentage}% dos dados) baseado no critério IQR 1.5x.`,
          type: 'anomaly',
          datasetName: p.displayName,
        });
      }

      // 4. Temporal trend if available
      if (p.temporalDistributions.length > 0 && p.temporalDistributions[0].data.length > 1) {
        const tData = p.temporalDistributions[0].data;
        const first = tData[0];
        const last = tData[tData.length - 1];
        insights.push({
          id: `trend_${p.datasetId}`,
          title: `Série Histórica Identificada`,
          description: `Período registrado de ${first.period} até ${last.period} (${tData.length} períodos mensais monitorados).`,
          type: 'trend',
          datasetName: p.displayName,
        });
      }

      // 5. Categorical concentration
      const catCol = p.columns.find((c) => c.isCategorical && c.topCategories && c.topCategories.length > 0);
      if (catCol && catCol.topCategories && catCol.topCategories[0]) {
        const topCat = catCol.topCategories[0];
        insights.push({
          id: `cat_${p.datasetId}`,
          title: `Concentração em ${catCol.name}`,
          description: `A categoria mais frequente é '${topCat.value}' com ${topCat.count.toLocaleString('pt-BR')} ocorrências (${topCat.percentage}% do total).`,
          type: 'highlight',
          datasetName: p.displayName,
        });
      }
    }

    // Try enhancing with Gemini if API key is valid
    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Analise os dados estruturados de perfilamento abaixo e gere de 3 a 5 insights analíticos concisos e de alto impacto para tomada de decisão (em formato JSON):
Perfil resumido:
${JSON.stringify(
  profileList.map((p) => ({
    dataset: p.displayName,
    rows: p.rowCount,
    cols: p.columns.map((c) => ({
      name: c.name,
      type: c.semanticType,
      min: c.min,
      max: c.max,
      mean: c.mean,
      topCat: c.topCategories?.[0],
      outliers: c.outlierCount,
      nulls: c.nullPercentage,
    })),
  }))
)}

Retorne um array JSON com objetos contendo: title (título curto), description (explicação com dados exatos), type ("highlight"|"warning"|"trend"|"anomaly").`;

        const response = await this.executeWithModelFallback({
          contents: [prompt],
          config: {
            responseMimeType: 'application/json',
          },
        });

        if (response && response.text) {
          const parsed = JSON.parse(response.text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item: any, idx: number) => ({
              id: `ai_insight_${idx}`,
              title: item.title || 'Insight Analítico',
              description: item.description || '',
              type: item.type || 'highlight',
              datasetName: profileList[0]?.displayName,
            }));
          }
        }
      } catch {
        // Fallback gracefully to DuckDB statistical insights if Gemini quota or server is unavailable
      }
    }

    return insights;
  }

  /**
   * Helper to execute Gemini requests with fallback models
   */
  private async executeWithModelFallback(params: {
    contents: any[];
    config?: any;
  }): Promise<any> {
    const modelsToTry = [this.modelName, 'gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];
    const uniqueModels = [...new Set(modelsToTry)];

    let lastError: any = null;
    for (const model of uniqueModels) {
      try {
        const res = await this.ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return res;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || '';
        if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('503')) {
          console.warn(`Model ${model} hit rate limit/unavailable, attempting fallback...`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } else {
          console.warn(`Model ${model} failed: ${errMsg}, trying next model...`);
        }
      }
    }
    throw lastError;
  }

  /**
   * Processes a user chat message with multi-step tool execution.
   */
  public async handleUserMessage(
    userMessage: string,
    history: ChatMessage[],
    catalog: DatasetCatalogItem[],
    dictionary: Record<string, DataDictionaryEntry>,
    profiles: Record<string, DatasetProfile>,
    db: DuckDBManager
  ): Promise<ChatMessage> {
    const tools = this.getToolDeclarations();
    const systemInstruction = this.getSystemInstruction(catalog, dictionary);

    let executedTransparency: QueryTransparencyDetails | undefined;
    let queryResultData: Record<string, any>[] | undefined;
    let chartPayload: ChartDataPayload | undefined;
    let tableColumns: string[] | undefined;

    // If no API key is set, provide smart deterministic execution based on tools
    if (!process.env.GEMINI_API_KEY) {
      return this.handleDeterministicQuery(userMessage, catalog, profiles, db);
    }

    try {
      // Format chat contents
      const contents: any[] = [];

      // Add recent history context (up to 4 turns)
      const recentHistory = history.slice(-4);
      for (const h of recentHistory) {
        contents.push({
          role: h.sender === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }],
        });
      }

      // Add current user turn
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      // Step 1: Initial call to Gemini to select tools
      const initialResponse = await this.executeWithModelFallback({
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: tools }],
        },
      });

      const functionCalls = initialResponse.functionCalls;

      // If model chose not to call any tools
      if (!functionCalls || functionCalls.length === 0) {
        const textResponse = initialResponse.text || 'Não foi possível processar a consulta com os dados fornecidos.';
        return {
          id: `msg_${Date.now()}`,
          sender: 'agent',
          text: textResponse,
          timestamp: new Date().toISOString(),
        };
      }

      // Step 2: Execute all function calls against DuckDB / Profiles
      const toolResponsesParts: any[] = [];

      for (const call of functionCalls) {
        const toolName = call.name;
        const args = (call.args as Record<string, any>) || {};

        let toolResult: any = null;

        try {
          if (toolName === 'execute_sql_query') {
            const rawSql = args.sql || '';
            const queryOutput = await SafeQueryBuilder.executeRawSqlQuery(db, rawSql);
            queryResultData = queryOutput.data;
            executedTransparency = queryOutput.transparency;
            toolResult = {
              status: 'success',
              linhasRetornadas: queryOutput.data.length,
              dados: queryOutput.data,
              sqlExecutado: queryOutput.transparency.generatedSql,
            };

            if (queryOutput.data.length > 0) {
              tableColumns = Object.keys(queryOutput.data[0]);
            }
          } else if (toolName === 'list_datasets') {
            toolResult = catalog.map((d) => ({
              nome: d.name,
              nomeOriginal: d.displayName,
              linhas: d.rowCount,
              colunas: d.columns.map((c) => `${c.name} (${c.type})`),
            }));
          } else if (toolName === 'inspect_dataset') {
            const ds = catalog.find((c) => c.name.toLowerCase() === (args.datasetName || '').toLowerCase()) || catalog[0];
            if (ds) {
              const sample = await db.query(`SELECT * FROM "${ds.name}" LIMIT 5`);
              toolResult = {
                dataset: ds.name,
                colunas: ds.columns,
                amostra: sample,
              };
            } else {
              toolResult = { erro: `Dataset ${args.datasetName} não encontrado.` };
            }
          } else if (toolName === 'profile_dataset') {
            const dsName = (args.datasetName || catalog[0]?.name || '').toLowerCase();
            const prof = Object.values(profiles).find((p) => p.datasetName.toLowerCase() === dsName) || Object.values(profiles)[0];
            toolResult = prof || { erro: 'Perfil não disponível.' };
          } else if (toolName === 'query_dataset') {
            const parsedInput: StructuredQueryInput = {
              dataset: args.dataset || catalog[0]?.name,
              operation: args.operation || 'top_n',
              dimension: args.dimension,
              metric: args.metric,
              aggregation: args.aggregation || 'sum',
              timeColumn: args.timeColumn,
              timeGranularity: args.timeGranularity || 'month',
              orderByDirection: args.orderByDirection || 'DESC',
              limit: args.limit || 10,
            };

            const queryOutput = await SafeQueryBuilder.executeStructuredQuery(db, parsedInput, catalog);
            queryResultData = queryOutput.data;
            executedTransparency = queryOutput.transparency;
            toolResult = {
              linhasRetornadas: queryOutput.data.length,
              dados: queryOutput.data,
              sqlExecutado: queryOutput.transparency.generatedSql,
            };

            if (queryOutput.data.length > 0) {
              tableColumns = Object.keys(queryOutput.data[0]);
            }
          } else if (toolName === 'analyze_data_quality') {
            const dsName = (args.datasetName || catalog[0]?.name || '').toLowerCase();
            const prof = Object.values(profiles).find((p) => p.datasetName.toLowerCase() === dsName) || Object.values(profiles)[0];
            toolResult = prof?.quality || { erro: 'Relatório de qualidade não encontrado.' };
          } else if (toolName === 'generate_chart') {
            chartPayload = {
              chartType: args.chartType || 'bar',
              title: args.title || 'Visualização dos Dados',
              xAxis: args.xAxis,
              yAxis: args.yAxis,
              data: queryResultData || [],
              description: args.description,
            };
            toolResult = { status: 'ok', message: 'Gráfico configurado com sucesso para exibição.' };
          }
        } catch (toolError: any) {
          console.error(`Erro ao executar tool ${toolName}:`, toolError);
          toolResult = { erro: toolError.message || 'Erro ao executar a consulta no DuckDB.' };
        }

        toolResponsesParts.push({
          functionResponse: {
            name: toolName,
            response: toolResult,
          },
        });
      }

      // Step 3: Pass tool outputs back to Gemini for final interpretation
      const candidateContent = initialResponse.candidates?.[0]?.content;
      const followUpContents = [
        ...contents,
        candidateContent,
        {
          role: 'user',
          parts: toolResponsesParts,
        },
      ];

      const finalResponse = await this.executeWithModelFallback({
        contents: followUpContents,
        config: {
          systemInstruction,
        },
      });

      let finalText = finalResponse.text?.trim() || '';

      // Check if model returned secondary function calls in turn 2 (e.g., generate_chart)
      if (finalResponse.functionCalls && finalResponse.functionCalls.length > 0) {
        for (const fCall of finalResponse.functionCalls) {
          if (fCall.name === 'generate_chart') {
            const args = (fCall.args as Record<string, any>) || {};
            chartPayload = {
              chartType: args.chartType || 'bar',
              title: args.title || 'Visualização dos Dados',
              xAxis: args.xAxis,
              yAxis: args.yAxis,
              data: queryResultData || [],
              description: args.description,
            };
          }
        }
      }

      // If response text is empty, too terse or generic, synthesize an exhaustive analytical summary
      if (!finalText || finalText.length < 25 || finalText === 'Consulta concluída com sucesso.') {
        if (queryResultData && queryResultData.length > 0) {
          finalText = this.synthesizeDetailedAnalysis(
            userMessage,
            queryResultData,
            tableColumns || Object.keys(queryResultData[0]),
            catalog
          );
        } else {
          finalText = 'Consulta executada no DuckDB com sucesso, porém nenhum registro foi retornado para os critérios informados.';
        }
      }

      // Auto create chart if appropriate and missing
      if (queryResultData && queryResultData.length > 1 && !chartPayload && tableColumns && tableColumns.length >= 2) {
        const xCol = tableColumns[0];
        const yCol = tableColumns[1];
        const isTime = /mes|ano|data|periodo|dt_/i.test(xCol);

        chartPayload = {
          chartType: isTime ? 'line' : 'bar',
          title: isTime ? `Evolução Mensal (${yCol})` : `Distribuição por ${xCol}`,
          xAxis: xCol,
          yAxis: yCol,
          data: queryResultData,
        };
      } else if (chartPayload && (!chartPayload.data || chartPayload.data.length === 0) && queryResultData) {
        chartPayload.data = queryResultData;
      }

      return {
        id: `msg_${Date.now()}`,
        sender: 'agent',
        text: finalText,
        timestamp: new Date().toISOString(),
        tableData: queryResultData && queryResultData.length > 0 ? queryResultData : undefined,
        tableColumns,
        chart: chartPayload,
        transparency: executedTransparency,
      };
    } catch (err: any) {
      console.error('Error in Gemini Agent loop, executing precision deterministic query:', err?.message || err);
      // Seamlessly fall back to high-precision deterministic query execution
      return this.handleDeterministicQuery(userMessage, catalog, profiles, db);
    }
  }

  /**
   * High-Precision Semantic Deterministic Engine
   * Formulates exact DuckDB SQL from natural language entities, filters, and metrics.
   */
  private async handleDeterministicQuery(
    message: string,
    catalog: DatasetCatalogItem[],
    profiles: Record<string, DatasetProfile>,
    db: DuckDBManager
  ): Promise<ChatMessage> {
    const rawMsg = message;
    const msg = message.toLowerCase();

    if (catalog.length === 0) {
      return {
        id: `msg_${Date.now()}`,
        sender: 'agent',
        text: 'Nenhum dataset carregado. Por favor envie um arquivo ZIP contendo seus arquivos CSV.',
        timestamp: new Date().toISOString(),
        isError: true,
      };
    }

    // 1. Identify most relevant dataset
    let targetDs = catalog[0];
    for (const ds of catalog) {
      const nameKeywords = ds.name.toLowerCase().split('_');
      if (nameKeywords.some((kw) => kw.length > 3 && msg.includes(kw))) {
        targetDs = ds;
        break;
      }
      if (msg.includes('produto') || msg.includes('catalogo') || msg.includes('estoque') || msg.includes('preco')) {
        const prodDs = catalog.find((c) => c.name.toLowerCase().includes('prod') || c.name.toLowerCase().includes('catalogo'));
        if (prodDs) targetDs = prodDs;
      } else if (msg.includes('nota') || msg.includes('fiscal') || msg.includes('fornecedor') || msg.includes('pagamento')) {
        const nfDs = catalog.find((c) => c.name.toLowerCase().includes('nota') || c.name.toLowerCase().includes('nf'));
        if (nfDs) targetDs = nfDs;
      }
    }

    const dsProfile = Object.values(profiles).find((p) => p.datasetName.toLowerCase() === targetDs.name.toLowerCase()) || Object.values(profiles)[0];

    // Out of scope check
    if (/^(quem [ée]|como fazer|receita|tempo hoje|clima|futebol|piada)/i.test(msg)) {
      return {
        id: `msg_${Date.now()}`,
        sender: 'agent',
        text: 'Essa pergunta não pode ser respondida com os dados carregados. Posso ajudar com análises, métricas, rankings e diagnósticos sobre os datasets disponíveis.',
        timestamp: new Date().toISOString(),
      };
    }

    // EDA / General Summary
    if (/an[aá]lise explorat[oó]ria|eda|resumo geral|perfil dos dados|vis[aã]o geral/i.test(msg)) {
      let text = `### 📊 Análise Exploratória dos Dados — ${targetDs.displayName}\n\n`;
      text += `• **Volume:** **${targetDs.rowCount.toLocaleString('pt-BR')} linhas** e **${targetDs.columnCount} variáveis** catalogadas no DuckDB.\n`;
      text += `• **Qualidade Geral:** Pontuação de **${dsProfile?.quality.overallScore || 95}/100**, com **${dsProfile?.quality.nullRate || 0}%** de células nulas.\n`;

      if (dsProfile?.quality.columnsWithOutliers.length) {
        text += `• **Anomalias/Outliers:** Identificados nos campos ${dsProfile.quality.columnsWithOutliers.map((c) => `\`${c.column}\` (${c.outlierCount} reg)`).join(', ')}.\n`;
      }

      const numCols = dsProfile?.columns.filter((c) => c.isNumeric) || [];
      if (numCols.length > 0) {
        text += `\n**Estatísticas das Principais Variáveis:**\n`;
        numCols.slice(0, 3).forEach((m) => {
          const isCurr = m.semanticType === 'currency';
          const fmt = (v?: number) => (v !== undefined ? v.toLocaleString('pt-BR', { style: isCurr ? 'currency' : 'decimal', currency: 'BRL' }) : '—');
          text += `- **${m.name}:** Média: ${fmt(m.mean)} | Mediana: ${fmt(m.median)} | Mín: ${fmt(m.min)} | Máx: ${fmt(m.max)}\n`;
        });
      }

      return {
        id: `msg_${Date.now()}`,
        sender: 'agent',
        text,
        timestamp: new Date().toISOString(),
        tableData: dsProfile?.previewRows.slice(0, 8),
        tableColumns: targetDs.columns.map((c) => c.name),
      };
    }

    // Quality / Nulls / Duplicates
    if (/nulo|faltante|ausente|qualidade|duplicad|outlier|anomalia|inconsist/i.test(msg)) {
      const q = dsProfile?.quality;
      let text = `### 🛡️ Diagnóstico de Qualidade dos Dados — ${targetDs.displayName}\n\n`;
      text += `• **Índice de Saúde:** **${q?.overallScore || 95}/100**\n`;
      text += `• **Taxa de Células Vazias:** **${q?.nullRate || 0}%** (${q?.totalNulls?.toLocaleString('pt-BR')} células)\n`;
      text += `• **Duplicidades Estimadas:** **${q?.duplicateRowsEstimate || 0}** linhas\n\n`;

      if (q?.columnsWithOutliers && q.columnsWithOutliers.length > 0) {
        text += `**Campos com Outliers (Critério IQR 1.5x):**\n`;
        q.columnsWithOutliers.forEach((o) => {
          text += `- \`${o.column}\`: ${o.outlierCount} registros fora do padrão (${o.outlierPercentage}% do dataset)\n`;
        });
        text += '\n';
      }

      if (q?.recommendations && q.recommendations.length > 0) {
        text += `**Recomendações Analíticas:**\n` + q.recommendations.map((r) => `- ${r}`).join('\n');
      }

      return {
        id: `msg_${Date.now()}`,
        sender: 'agent',
        text,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Identify Dimension Column (Prioritizing descriptive text/name columns over IDs/Codes)
    let selectedDimension = targetDs.columns.find((c) => {
      const cLower = c.name.toLowerCase();
      if (msg.includes('fornecedor')) {
        return cLower.includes('nome_forn') || cLower.includes('razao') || cLower === 'fornecedor';
      }
      if (msg.includes('produto')) {
        return cLower.includes('nome_prod') || cLower.includes('descricao') || cLower === 'produto';
      }
      if (msg.includes('categoria')) {
        return cLower.includes('categoria') || cLower.includes('cat');
      }
      if (msg.includes('uf') || msg.includes('estado')) {
        return cLower.includes('uf') || cLower.includes('estado');
      }
      if (msg.includes('status') || msg.includes('situa')) {
        return cLower.includes('status') || cLower.includes('situacao');
      }
      return false;
    });

    // Secondary fallback for dimension matching if specific name column wasn't matched
    if (!selectedDimension) {
      selectedDimension = targetDs.columns.find((c) => {
        const cLower = c.name.toLowerCase();
        if (msg.includes('fornecedor') && cLower.includes('forn')) return true;
        if (msg.includes('produto') && cLower.includes('prod')) return true;
        if (msg.includes('categoria') && cLower.includes('cat')) return true;
        if ((msg.includes('uf') || msg.includes('estado')) && (cLower.includes('uf') || cLower.includes('estado'))) return true;
        if (msg.includes('status') && cLower.includes('status')) return true;
        return false;
      });
    }

    if (!selectedDimension) {
      selectedDimension = targetDs.columns.find((c) => (c.semanticType === 'category' || c.type === 'VARCHAR') && !c.name.toLowerCase().includes('num_') && !c.name.toLowerCase().includes('id_'));
    }

    // 3. Identify Metric Column
    let selectedMetric = targetDs.columns.find((c) => {
      const cLower = c.name.toLowerCase();
      if ((msg.includes('desconto') || msg.includes('abatimento')) && cLower.includes('desconto')) return true;
      if ((msg.includes('preco') || msg.includes('preço') || msg.includes('unitario')) && cLower.includes('preco')) return true;
      if ((msg.includes('estoque') || msg.includes('saldo')) && cLower.includes('estoque')) return true;
      if ((msg.includes('quantidade') || msg.includes('itens') || msg.includes('volume')) && (cLower.includes('qtd') || cLower.includes('quant'))) return true;
      if ((msg.includes('valor') || msg.includes('total') || msg.includes('faturamento') || msg.includes('venda') || msg.includes('gasto')) && (cLower.includes('vlr') || cLower.includes('val') || cLower.includes('total'))) return true;
      return false;
    });

    if (!selectedMetric) {
      selectedMetric = targetDs.columns.find((c) => c.semanticType === 'currency' || c.semanticType === 'number' || c.type.includes('DOUBLE') || c.type.includes('INT'));
    }

    // 4. Identify Date Column for Temporal Analysis
    const dateCol = targetDs.columns.find((c) => c.semanticType === 'date' || c.type.includes('DATE') || c.name.toLowerCase().includes('dt_') || c.name.toLowerCase().includes('data'));

    // 5. Detect Filters (WHERE conditions)
    const filters: string[] = [];
    if (/pago|liquidado/i.test(msg) && targetDs.columns.some((c) => c.name.toLowerCase().includes('status'))) {
      filters.push(`STATUS_PAGTO = 'Pago'`);
    } else if (/cancelad/i.test(msg) && targetDs.columns.some((c) => c.name.toLowerCase().includes('status'))) {
      filters.push(`STATUS_PAGTO = 'Cancelado'`);
    } else if (/pendente/i.test(msg) && targetDs.columns.some((c) => c.name.toLowerCase().includes('status'))) {
      filters.push(`STATUS_PAGTO = 'Pendente'`);
    }

    // State / UF filter detection
    const ufs = ['SP', 'MG', 'RJ', 'PR', 'RS', 'SC', 'PE', 'CE', 'BA', 'GO', 'DF', 'ES', 'AM', 'PA'];
    for (const uf of ufs) {
      const ufRegex = new RegExp(`\\b${uf}\\b`, 'i');
      if (ufRegex.test(rawMsg) && targetDs.columns.some((c) => c.name.toLowerCase().includes('uf'))) {
        filters.push(`UF_DESTINO = '${uf.toUpperCase()}'`);
        break;
      }
    }

    const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // 6. Detect Limit / Top N
    let limitCount = 5;
    const limitMatch = msg.match(/top\s*(\d+)|(\d+)\s*maiores|(\d+)\s*principais/i);
    if (limitMatch) {
      limitCount = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3] || '5', 10);
    }

    // Case A: Time Series / Evolution
    if ((/m[eê]s|tempo|per[ií]odo|evolu[cç][aã]o|s[eé]rie|temporal|ao longo do ano/i.test(msg)) && dateCol) {
      try {
        const safeTime = `"${dateCol.name}"`;
        const metricExpr = selectedMetric
          ? `ROUND(SUM(CAST("${selectedMetric.name}" AS DOUBLE)), 2) AS "total_${selectedMetric.name.toLowerCase()}", COUNT(*) AS "quantidade_registros"`
          : `COUNT(*) AS "quantidade_registros"`;

        const sql = `
          SELECT 
            SUBSTRING(CAST(${safeTime} AS VARCHAR), 1, 7) AS "periodo",
            ${metricExpr}
          FROM "${targetDs.name}"
          ${whereSql}
          ${whereSql ? 'AND' : 'WHERE'} ${safeTime} IS NOT NULL
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 24
        `;

        const startTime = Date.now();
        const data = await db.query<Record<string, any>>(sql);
        const executionTimeMs = Date.now() - startTime;

        const metricKey = selectedMetric ? `total_${selectedMetric.name.toLowerCase()}` : 'quantidade_registros';
        const isCurr = selectedMetric?.semanticType === 'currency';

        let text = `### 📈 Evolução Temporal Mensal — ${targetDs.displayName}\n\n`;
        text += `Consulta executada no DuckDB com base no campo de data **\`${dateCol.name}\`**${filters.length ? ` com filtro (${filters.join(', ')})` : ''}.\n\n`;

        if (data.length > 0) {
          const totalAccum = data.reduce((acc, r) => acc + (Number(r[metricKey]) || 0), 0);
          const firstPeriod = data[0].periodo || data[0].PERIODO || Object.values(data[0])[0];
          const lastPeriod = data[data.length - 1].periodo || data[data.length - 1].PERIODO || Object.values(data[data.length - 1])[0];
          text += `• **Total Acumulado no Período:** **${totalAccum.toLocaleString('pt-BR', { style: isCurr ? 'currency' : 'decimal', currency: 'BRL' })}**\n`;
          text += `• **Meses Analisados:** ${firstPeriod} até ${lastPeriod} (${data.length} meses)\n`;
        }

        const chart: ChartDataPayload = {
          chartType: 'area',
          title: `Evolução Mensal (${selectedMetric?.name || 'Volume'})`,
          xAxis: 'periodo',
          yAxis: metricKey,
          data,
        };

        const transparency: QueryTransparencyDetails = {
          dataset: targetDs.name,
          operation: 'time_series',
          generatedSql: sql.trim().replace(/\s+/g, ' '),
          executionTimeMs,
        };

        return {
          id: `msg_${Date.now()}`,
          sender: 'agent',
          text,
          timestamp: new Date().toISOString(),
          tableData: data,
          tableColumns: Object.keys(data[0] || {}),
          chart,
          transparency,
        };
      } catch (e: any) {
        console.error('Error executing deterministic time query:', e);
      }
    }

    // Case B: Simple Aggregate (Total, Média, Geral)
    if (/^(qual o valor total|qual o total|quanto foi|faturamento total|m[eé]dia geral|quantas notas|quantos registros)/i.test(msg) && !msg.includes('por ') && selectedMetric) {
      try {
        const safeMetric = `"${selectedMetric.name}"`;
        const isCurr = selectedMetric.semanticType === 'currency';

        const sql = `
          SELECT 
            COUNT(*) AS "total_registros",
            ROUND(SUM(CAST(${safeMetric} AS DOUBLE)), 2) AS "soma_total",
            ROUND(AVG(CAST(${safeMetric} AS DOUBLE)), 2) AS "media",
            ROUND(MEDIAN(CAST(${safeMetric} AS DOUBLE)), 2) AS "mediana",
            ROUND(MIN(CAST(${safeMetric} AS DOUBLE)), 2) AS "minimo",
            ROUND(MAX(CAST(${safeMetric} AS DOUBLE)), 2) AS "maximo"
          FROM "${targetDs.name}"
          ${whereSql}
        `;

        const startTime = Date.now();
        const data = await db.query<Record<string, any>>(sql);
        const executionTimeMs = Date.now() - startTime;
        const res = data[0];

        const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: isCurr ? 'currency' : 'decimal', currency: 'BRL' });

        let text = `### 💰 Totalização e Métricas de **${selectedMetric.name}**\n\n`;
        text += `Cálculos analíticos exatos realizados no DuckDB para a tabela **${targetDs.displayName}**${filters.length ? ` (Filtro: ${filters.join(', ')})` : ''}:\n\n`;
        text += `• **Soma Total:** **${fmt(res.soma_total)}**\n`;
        text += `• **Média por Registro:** **${fmt(res.media)}**\n`;
        text += `• **Mediana:** **${fmt(res.mediana)}**\n`;
        text += `• **Faixa de Valores:** de **${fmt(res.minimo)}** até **${fmt(res.maximo)}**\n`;
        text += `• **Volume de Registros:** **${Number(res.total_registros).toLocaleString('pt-BR')} registros**`;

        const transparency: QueryTransparencyDetails = {
          dataset: targetDs.name,
          operation: 'aggregate',
          metric: selectedMetric.name,
          generatedSql: sql.trim().replace(/\s+/g, ' '),
          executionTimeMs,
        };

        return {
          id: `msg_${Date.now()}`,
          sender: 'agent',
          text,
          timestamp: new Date().toISOString(),
          tableData: data,
          tableColumns: Object.keys(res),
          transparency,
        };
      } catch (e: any) {
        console.error('Error executing aggregate query:', e);
      }
    }

    // Case C: Group By / Ranking (Top N, Distribuição, Por fornecedor / categoria / UF / produto)
    if (selectedDimension) {
      try {
        const safeDim = `"${selectedDimension.name}"`;
        const metricExpr = selectedMetric
          ? `ROUND(SUM(CAST("${selectedMetric.name}" AS DOUBLE)), 2) AS "total_${selectedMetric.name.toLowerCase()}", COUNT(*) AS "qtd_registros"`
          : `COUNT(*) AS "qtd_registros"`;

        const orderExpr = selectedMetric ? `2 DESC` : `2 DESC`;

        const sql = `
          SELECT 
            CAST(${safeDim} AS VARCHAR) AS "${selectedDimension.name}",
            ${metricExpr}
          FROM "${targetDs.name}"
          ${whereSql}
          ${whereSql ? 'AND' : 'WHERE'} ${safeDim} IS NOT NULL
          GROUP BY 1
          ORDER BY ${orderExpr}
          LIMIT ${limitCount}
        `;

        const startTime = Date.now();
        const data = await db.query<Record<string, any>>(sql);
        const executionTimeMs = Date.now() - startTime;

        if (data.length > 0) {
          const topRow = data[0];
          const metricKey = selectedMetric ? `total_${selectedMetric.name.toLowerCase()}` : 'qtd_registros';
          const isCurr = selectedMetric?.semanticType === 'currency';

          const fmt = (v: any) => Number(v).toLocaleString('pt-BR', { style: isCurr ? 'currency' : 'decimal', currency: 'BRL' });

          let text = `### 🏆 Ranking por **${selectedDimension.name}** (Top ${data.length})\n\n`;
          text += `Consulta calculada com precisão no DuckDB sobre a tabela **${targetDs.displayName}**${filters.length ? ` (Filtro: ${filters.join(', ')})` : ''}:\n\n`;
          text += `• O principal destaque é **${topRow[selectedDimension.name]}** com **${fmt(topRow[metricKey])}** (${Number(topRow.qtd_registros || 0).toLocaleString('pt-BR')} registros).\n\n`;

          text += `**Top Resultados:**\n`;
          data.forEach((r, idx) => {
            text += `${idx + 1}. **${r[selectedDimension.name]}**: ${fmt(r[metricKey])} (${Number(r.qtd_registros || 0)} reg)\n`;
          });

          const chart: ChartDataPayload = {
            chartType: 'bar',
            title: `Top ${data.length} ${selectedDimension.name} por ${selectedMetric?.name || 'Volume'}`,
            xAxis: selectedDimension.name,
            yAxis: metricKey,
            data,
          };

          const transparency: QueryTransparencyDetails = {
            dataset: targetDs.name,
            operation: 'top_n',
            groupBy: selectedDimension.name,
            metric: selectedMetric?.name,
            generatedSql: sql.trim().replace(/\s+/g, ' '),
            executionTimeMs,
          };

          return {
            id: `msg_${Date.now()}`,
            sender: 'agent',
            text,
            timestamp: new Date().toISOString(),
            tableData: data,
            tableColumns: Object.keys(topRow),
            chart,
            transparency,
          };
        }
      } catch (e: any) {
        console.error('Error executing deterministic ranking query:', e);
      }
    }

    // Default Fallback
    return {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      text: `O dataset **${targetDs.displayName}** possui **${targetDs.rowCount.toLocaleString('pt-BR')} registros** e **${targetDs.columnCount} colunas**. Experimente perguntar pelos maiores fornecedores, faturamento total, notas pagas por estado (UF) ou evolução temporal mensal.`,
      timestamp: new Date().toISOString(),
      tableData: dsProfile?.previewRows.slice(0, 5),
      tableColumns: targetDs.columns.map((c) => c.name),
    };
  }

  /**
   * Synthesizes an exhaustive, highly structured analytical response
   * from actual DuckDB execution rows when the model's text is missing or generic.
   */
  private synthesizeDetailedAnalysis(
    userMessage: string,
    data: Record<string, any>[],
    columns: string[],
    catalog: DatasetCatalogItem[]
  ): string {
    if (!data || data.length === 0) {
      return 'Nenhum registro retornado para a consulta especificada.';
    }

    // 1. If single row aggregate (e.g. COUNT, SUM, AVG)
    if (data.length === 1) {
      const row = data[0];
      let text = `### 📊 Resumo Analítico dos Dados\n\n`;
      text += `Abaixo estão os indicadores calculados com precisão no banco de dados DuckDB:\n\n`;
      for (const [k, v] of Object.entries(row)) {
        const valNum = Number(v);
        const isNum = !isNaN(valNum) && typeof v !== 'boolean' && v !== null;
        const isCurrency = /vlr|valor|total|faturado|preco|preco_total|soma/i.test(k);
        const formattedVal = isNum
          ? isCurrency
            ? valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : valNum.toLocaleString('pt-BR')
          : String(v);

        text += `• **${k.replace(/_/g, ' ').toUpperCase()}:** **${formattedVal}**\n`;
      }
      return text;
    }

    // 2. Identify key columns (Dimension / Period & Metric)
    const firstCol = columns[0];
    const isMonthlyOrTemporal = /mes|periodo|ano|data|dt_|dia|month|date/i.test(firstCol);

    // Find primary numeric column
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

    // 3. Categorical Ranking / Distribution (e.g. Fornecedores, Status, Categorias, UF)
    let text = `### 🏆 Distribuição e Ranking por **${firstCol.replace(/_/g, ' ').toUpperCase()}**\n\n`;
    text += `Resultados agregados diretamente do banco de dados DuckDB (${data.length} registros exibidos):\n\n`;
    text += `• **Total Consolidado:** **${fmt(totalSum)}**\n`;
    text += `• **Principal Destaque (1º Lugar):** **${maxRow[firstCol]}** representando **${fmt(Number(maxRow[metricCol]))}** (${((Number(maxRow[metricCol]) / (totalSum || 1)) * 100).toFixed(1)}% do total)\n\n`;

    text += `**Rankings / Valores por Categoria:**\n`;
    data.slice(0, 15).forEach((r, idx) => {
      const val = Number(r[metricCol]) || 0;
      const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
      text += `${idx + 1}. **${r[firstCol]}**: ${fmt(val)} (${pct}%)\n`;
    });

    return text;
  }
}

