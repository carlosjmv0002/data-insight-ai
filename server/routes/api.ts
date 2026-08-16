import express, { Request, Response } from 'express';
import multer from 'multer';
import { DuckDBManager } from '../duckdb/db';
import { ZipProcessor } from '../services/zipService';
import { ProfilingService } from '../services/profilingService';
import { GeminiEdaAgent } from '../agents/geminiAgent';
import { OpenRouterEdaAgent, OPENROUTER_FREE_MODELS } from '../agents/openRouterAgent';
import {
  DatasetCatalogItem,
  DatasetProfile,
  DataDictionaryEntry,
  SessionState,
  ModelOption,
} from '../../src/types';
import { generateBrazilianSampleZip } from '../services/sampleData';

const router = express.Router();

const maxUploadMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '25', 10) || 25;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
});

// In-memory active session state
let currentDb = new DuckDBManager();
let currentGeminiAgent = new GeminiEdaAgent();
let currentOpenRouterAgent = new OpenRouterEdaAgent();
let runtimeGeminiKey = '';
let runtimeOpenRouterKey = '';
let currentSession: SessionState = {
  sessionId: `sess_${Date.now()}`,
  datasets: [],
  dictionary: {},
  profiles: {},
  insights: [],
  dictionaryFound: false,
  createdAt: new Date().toISOString(),
};

/**
 * Reset DuckDB and session
 */
async function resetSession() {
  await currentDb.close();
  currentDb = new DuckDBManager();
  currentGeminiAgent = new GeminiEdaAgent();
  currentOpenRouterAgent = new OpenRouterEdaAgent();
  currentSession = {
    sessionId: `sess_${Date.now()}`,
    datasets: [],
    dictionary: {},
    profiles: {},
    insights: [],
    dictionaryFound: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Helper to process ZIP buffer into DuckDB and profiling
 */
async function ingestZipBuffer(zipBuffer: Buffer): Promise<SessionState> {
  await resetSession();

  const extracted = ZipProcessor.processZip(zipBuffer);

  if (extracted.csvFiles.length === 0) {
    throw new Error('Não encontramos nenhum arquivo CSV no ZIP enviado.');
  }

  currentSession.dictionary = extracted.dictionary;
  currentSession.dictionaryFound = Boolean(extracted.dictionaryFile);
  currentSession.dictionaryFilename = extracted.dictionaryFile?.filename;

  const catalogItems: DatasetCatalogItem[] = [];
  const profilesMap: Record<string, DatasetProfile> = {};

  for (const csv of extracted.csvFiles) {
    const tableInfo = await currentDb.loadCsvBuffer(csv.filename.replace(/\.[^/.]+$/, ''), csv.buffer);

    const columnsMeta = tableInfo.columns.map((c) => {
      const dictEntry = currentSession.dictionary[c.name.toUpperCase()];
      const semanticType = ProfilingService.inferSemanticType(c.name, c.type, dictEntry);
      return {
        name: c.name,
        type: c.type,
        semanticType,
        description: dictEntry?.description,
        unit: dictEntry?.unit,
        businessRules: dictEntry?.businessRules,
      };
    });

    const primaryDate = columnsMeta.find((c) => c.semanticType === 'date')?.name;
    const primaryMetric = columnsMeta.find((c) => c.semanticType === 'currency' || c.semanticType === 'number')?.name;
    const primaryCategory = columnsMeta.find((c) => c.semanticType === 'category')?.name;

    const catalogItem: DatasetCatalogItem = {
      id: `ds_${tableInfo.tableName}`,
      name: tableInfo.tableName,
      displayName: csv.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
      originalFilename: csv.filename,
      rowCount: tableInfo.rowCount,
      columnCount: tableInfo.columnCount,
      columns: columnsMeta,
      primaryDateColumn: primaryDate,
      primaryMetricColumn: primaryMetric,
      primaryCategoryColumn: primaryCategory,
    };

    catalogItems.push(catalogItem);

    // Run deep automated profiling in DuckDB
    const profile = await ProfilingService.profileDataset(currentDb, catalogItem, currentSession.dictionary);
    profilesMap[catalogItem.id] = profile;
  }

  currentSession.datasets = catalogItems;
  currentSession.profiles = profilesMap;

  // Generate automated insights using DuckDB results + Gemini/fallback
  let insights: any[] = [];
  try {
    insights = await currentGeminiAgent.generateInitialInsights(profilesMap, currentSession.dictionary);
  } catch (err) {
    console.warn('Gemini initial insights failed, generating fallback profiles insights:', err);
    insights = [];
    for (const [dsId, p] of Object.entries(profilesMap)) {
      insights.push({
        id: `ins_${dsId}_1`,
        title: `Volume Carregado: ${p.displayName}`,
        description: `Tabela processada no DuckDB com ${p.rowCount.toLocaleString()} linhas e ${p.columnCount} colunas.`,
        type: 'highlight',
        datasetName: p.displayName,
      });
    }
  }
  currentSession.insights = insights;

  return currentSession;
}

/**
 * POST /api/upload - Ingest ZIP file
 */
router.post(
  '/upload',
  (req: Request, res: Response, next: any) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'O arquivo enviado excede o limite máximo permitido de 25MB.',
          });
        }
        return res.status(400).json({ error: err.message || 'Erro no upload do arquivo.' });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado. Por favor selecione um arquivo ZIP.' });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.zip')) {
        return res.status(400).json({ error: 'Formato inválido. O arquivo deve ter a extensão .zip.' });
      }

      const session = await ingestZipBuffer(req.file.buffer);
      res.json({ success: true, session });
    } catch (error: any) {
      console.error('Error processing upload:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar o arquivo ZIP.' });
    }
  }
);

/**
 * POST /api/sample - Ingest pre-built realistic sample dataset
 */
router.post('/sample', async (req: Request, res: Response) => {
  try {
    const sampleType = req.body?.type || 'notas_fiscais';
    const sampleZipBuffer = generateBrazilianSampleZip(sampleType);
    const session = await ingestZipBuffer(sampleZipBuffer);
    res.json({ success: true, session });
  } catch (error: any) {
    console.error('Error generating sample dataset:', error?.stack || error);
    res.status(500).json({ error: error.message || 'Erro ao carregar o dataset de demonstração.' });
  }
});

/**
 * GET /api/config - Server upload limit and provider status
 */
router.get('/config', (req: Request, res: Response) => {
  const hasGemini = Boolean(
    (runtimeGeminiKey && runtimeGeminiKey.trim().length > 0) ||
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0)
  );
  const hasOpenRouter = Boolean(
    (runtimeOpenRouterKey && runtimeOpenRouterKey.trim().length > 0) ||
    currentOpenRouterAgent.isConfigured()
  );

  res.json({
    maxUploadMb,
    configured: {
      gemini: hasGemini,
      openrouter: hasOpenRouter,
    },
    currentDefault: hasOpenRouter ? 'google/gemma-4-31b-it:free' : 'gemini-3.7-flash',
  });
});

/**
 * POST /api/keys - Save/Update API keys dynamically via UI
 */
router.post('/keys', (req: Request, res: Response) => {
  try {
    const { geminiApiKey, openRouterApiKey } = req.body;

    if (geminiApiKey !== undefined) {
      runtimeGeminiKey = (geminiApiKey || '').trim();
      if (runtimeGeminiKey) {
        currentGeminiAgent.setApiKey(runtimeGeminiKey);
      }
    }

    if (openRouterApiKey !== undefined) {
      runtimeOpenRouterKey = (openRouterApiKey || '').trim();
      if (runtimeOpenRouterKey) {
        currentOpenRouterAgent.setApiKey(runtimeOpenRouterKey);
      }
    }

    const hasGemini = currentGeminiAgent.isConfigured();
    const hasOpenRouter = currentOpenRouterAgent.isConfigured();

    res.json({
      success: true,
      message: 'Chaves de API configuradas com sucesso na sessão do servidor.',
      configured: {
        gemini: hasGemini,
        openrouter: hasOpenRouter,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao configurar chaves de API.' });
  }
});

/**
 * GET /api/models - List available AI models (Gemini + OpenRouter Free Models)
 */
router.get('/models', (req: Request, res: Response) => {
  const hasGemini = currentGeminiAgent.isConfigured();
  const hasOpenRouter = currentOpenRouterAgent.isConfigured();

  const models: ModelOption[] = [];

  // Gemini models
  if (hasGemini) {
    models.push(
      {
        id: 'gemini-3.7-flash',
        name: 'Google Gemini 3.7 Flash',
        provider: 'Google AI Studio',
        description: 'Modelo de raciocínio rápido para análises exploratórias e DuckDB',
        isFree: true,
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Google Gemini 3.1 Pro',
        provider: 'Google AI Studio',
        description: 'Alta capacidade de raciocínio lógico e estruturação de dados',
        isFree: true,
      },
      {
        id: 'gemini-3.1-flash-lite',
        name: 'Google Gemini 3.1 Flash Lite',
        provider: 'Google AI Studio',
        description: 'Leve e de latência ultrabaixa para consultas pontuais',
        isFree: true,
      }
    );
  }

  // OpenRouter Free Models
  if (hasOpenRouter) {
    for (const m of OPENROUTER_FREE_MODELS) {
      models.push({
        id: m.id,
        name: m.name,
        provider: `OpenRouter (${m.provider})`,
        contextLength: m.contextLength,
        description: m.description,
        isFree: true,
      });
    }
  }

  res.json({
    configured: {
      gemini: hasGemini,
      openrouter: hasOpenRouter,
    },
    currentDefault: hasOpenRouter ? 'google/gemma-4-31b-it:free' : 'gemini-3.7-flash',
    models,
  });
});

/**
 * GET /api/session - Get current session
 */
router.get('/session', (req: Request, res: Response) => {
  res.json({ session: currentSession });
});

/**
 * POST /api/chat - Natural language query to AI EDA Agent (Gemini or OpenRouter Free Models)
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, history, model } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'A mensagem da pergunta é obrigatória.' });
    }

    if (currentSession.datasets.length === 0) {
      return res.status(400).json({ error: 'Nenhum dataset carregado. Envie um arquivo ZIP primeiro.' });
    }

    const isOpenRouterRequested = Boolean(model && (model.includes('/') || model.includes(':free') || model.includes('openrouter')));
    const hasOpenRouter = currentOpenRouterAgent.isConfigured();

    let agentResponse;

    if (isOpenRouterRequested && hasOpenRouter) {
      // Use requested OpenRouter Free Model
      console.log(`[Chat Route] Routing to OpenRouter model: ${model}`);
      agentResponse = await currentOpenRouterAgent.handleUserMessage(
        message,
        history || [],
        currentSession.datasets,
        currentSession.dictionary,
        currentSession.profiles,
        currentDb,
        model
      );
      agentResponse.modelUsed = model;
    } else {
      // Try Gemini with fallback to OpenRouter Free Models if Gemini rate-limits or fails
      try {
        console.log(`[Chat Route] Calling Gemini Agent...`);
        agentResponse = await currentGeminiAgent.handleUserMessage(
          message,
          history || [],
          currentSession.datasets,
          currentSession.dictionary,
          currentSession.profiles,
          currentDb
        );
        agentResponse.modelUsed = model || 'gemini-3.7-flash';
      } catch (geminiError: any) {
        if (hasOpenRouter) {
          console.warn('[Chat Route] Gemini failed, falling back to OpenRouter free models:', geminiError.message);
          const fallbackModel = 'google/gemma-4-31b-it:free';
          agentResponse = await currentOpenRouterAgent.handleUserMessage(
            message,
            history || [],
            currentSession.datasets,
            currentSession.dictionary,
            currentSession.profiles,
            currentDb,
            fallbackModel
          );
          agentResponse.modelUsed = `${fallbackModel} (OpenRouter Fallback)`;
        } else {
          throw geminiError;
        }
      }
    }

    res.json({ response: agentResponse });
  } catch (error: any) {
    console.error('Error handling chat message:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar a pergunta do agente.' });
  }
});

/**
 * POST /api/clear - Clear current session and memory
 */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    await resetSession();
    res.json({ success: true, session: currentSession });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
