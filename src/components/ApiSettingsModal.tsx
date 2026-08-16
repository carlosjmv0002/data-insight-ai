import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Save,
  Cpu,
  X,
} from 'lucide-react';
import { ServerConfigInfo } from '../types';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverConfig: ServerConfigInfo | null;
  onKeysSaved: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  serverConfig,
  onKeysSaved,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiKey.trim() ? geminiKey.trim() : undefined,
          openRouterApiKey: openRouterKey.trim() ? openRouterKey.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao salvar chaves.');
      }

      setSaveStatus('success');
      setStatusMessage('Chaves de API atualizadas e ativas na sessão!');
      onKeysSaved();
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setStatusMessage(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Configuração de APIs de IA</h3>
              <p className="text-xs text-slate-500">Defina suas chaves pela interface ou use o arquivo .env</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current status indicators */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Google Gemini</span>
              {serverConfig?.configured.gemini ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Configurado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Não configurado
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Gemini 3.7 Flash & 3.1 Pro</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">OpenRouter (Free)</span>
              {serverConfig?.configured.openrouter ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Configurado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Não configurado
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Gemma 4, Nemotron, GPT-OSS (Free)</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* OpenRouter Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                OpenRouter API Key (Recomendado para Modelos Gratuitos)
              </label>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5"
              >
                Obter Chave <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
            <input
              type="password"
              placeholder={serverConfig?.configured.openrouter ? '•••••••••••••••••••••••• (Já configurada)' : 'sk-or-v1-...'}
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Permite usar todos os modelos gratuitos (Google Gemma 4, Cohere, Nemotron, OpenAI gpt-oss).
            </p>
          </div>

          {/* Gemini Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Google Gemini API Key (Opcional)
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5"
              >
                Google AI Studio <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
            <input
              type="password"
              placeholder={serverConfig?.configured.gemini ? '•••••••••••••••••••••••• (Já configurada)' : 'AIzaSy...'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Utilizado para os modelos Gemini 3.7 Flash e Gemini 3.1 Pro.
            </p>
          </div>

          {/* Status feedback */}
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={isSaving || (!geminiKey.trim() && !openRouterKey.trim())}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? 'Salvando...' : 'Salvar Chaves'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
