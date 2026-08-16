import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileArchive,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Database,
  BookOpen,
  Layers,
  ArrowRight,
  Key,
  Cpu,
  Settings,
  HardDrive,
} from 'lucide-react';
import { ServerConfigInfo } from '../types';
import { ApiSettingsModal } from './ApiSettingsModal';

interface UploadZoneProps {
  onUploadSuccess: () => void;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: (err: string | null) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onUploadSuccess,
  isLoading,
  setIsLoading,
  setError,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfigInfo | null>(null);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchServerConfig = () => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: ServerConfigInfo) => {
        setServerConfig(data);
      })
      .catch((err) => console.warn('Erro ao obter config do servidor:', err));
  };

  useEffect(() => {
    fetchServerConfig();
  }, []);

  const maxMb = serverConfig?.maxUploadMb || 25;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Formato inválido. Por favor, envie um arquivo com extensão .ZIP.');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(`O arquivo (${(file.size / 1024 / 1024).toFixed(1)}MB) excede o limite configurado de ${maxMb}MB.`);
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 413) {
        throw new Error(`O arquivo excede o limite suportado pelo servidor (${maxMb}MB). Em ambiente local, aumente MAX_UPLOAD_SIZE_MB no .env.`);
      }

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : { error: await res.text() };

      if (!res.ok) {
        const errorText = typeof data.error === 'string' && data.error.includes('<html')
          ? 'Ocorreu um erro no servidor ao processar o arquivo. Verifique o formato do ZIP.'
          : (data.error || 'Erro ao processar arquivo ZIP.');
        throw new Error(errorText);
      }

      onUploadSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Falha ao conectar com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSample = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notas_fiscais' }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : { error: await res.text() };

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar dados de demonstração.');
      }

      onUploadSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Falha ao carregar dados de exemplo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Top Bar with API Keys status & Configure button */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">Status das APIs de IA:</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                {serverConfig?.configured.openrouter ? 'OpenRouter Ativo (Free Models)' : 'Pronto'}
              </span>
              {serverConfig?.configured.gemini && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                  <Sparkles className="h-3 w-3" /> Gemini Ativo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              DuckDB Analytics Engine • Limite de Ingestão: <span className="font-semibold text-slate-700">{maxMb}MB</span> (ajustável no .env local)
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsApiModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 hover:border-indigo-200 transition-colors shadow-2xs"
        >
          <Key className="h-3.5 w-3.5 text-indigo-600" />
          Configurar Chaves de API
        </button>
      </div>

      {/* Hero Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          EDA Agent Inteligente com DuckDB + LLMs
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          DataInsight AI
        </h1>
        <p className="mt-2 text-base text-slate-600 max-w-2xl mx-auto">
          Análise exploratória inteligente de arquivos CSV. Envie um arquivo ZIP contendo seus datasets e, opcionalmente, um dicionário de dados para perfilamento automático e consultas em linguagem natural.
        </p>
      </div>

      {/* Upload Box */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div
          id="dropzone-box"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
              : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelected(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <UploadCloud className="h-7 w-7" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800">
                Arraste seu arquivo ZIP aqui
              </p>
              <p className="text-sm text-slate-500 mt-1">
                ou clique para selecionar do seu computador
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
              <span className="flex items-center gap-1">
                <FileArchive className="h-3.5 w-3.5" /> Arquivo .ZIP
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" /> Limite: {maxMb}MB
              </span>
            </div>
          </div>
        </div>

        {/* Selected File Status */}
        {selectedFile && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white font-medium text-xs">
                ZIP
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            <button
              id="process-zip-btn"
              onClick={handleUploadSubmit}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processando DuckDB...
                </>
              ) : (
                <>
                  Processar e Analisar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Quick Sample Button */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-6">
          <div className="text-left">
            <h4 className="text-sm font-semibold text-slate-800">Não tem um arquivo ZIP agora?</h4>
            <p className="text-xs text-slate-500">
              Teste instantaneamente com nosso dataset modelo brasileiro (Notas Fiscais, Produtos e Dicionário de Dados).
            </p>
          </div>

          <button
            id="load-sample-btn"
            onClick={handleLoadSample}
            disabled={isLoading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-xs disabled:opacity-50 transition-colors shrink-0"
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            Carregar Dataset de Exemplo
          </button>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 mb-3">
            <Layers className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Múltiplos CSVs & Dicionário</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Identifica recursivamente tabelas, encodings, formatos brasileiros de números e datas, e conecta o dicionário semântico.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mb-3">
            <Database className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">DuckDB como Motor de Verdade</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Execução de cálculos analíticos exatos, IQR para detecção de outliers e agregações velozes em memória.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 mb-3">
            <BookOpen className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Modelos Livres & Gemini</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Suporte nativo aos modelos gratuitos da OpenRouter (Google Gemma 4, Nemotron, GPT-OSS) e Google AI Studio.
          </p>
        </div>
      </div>

      {/* API Settings Modal */}
      <ApiSettingsModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        serverConfig={serverConfig}
        onKeysSaved={() => {
          fetchServerConfig();
        }}
      />
    </div>
  );
};
