import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Table as TableIcon,
  BarChart3,
  Loader2,
  RefreshCw,
  Cpu,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { ChatMessage, SessionState, ModelOption } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { QueryDetails } from './QueryDetails';

interface ChatInterfaceProps {
  session: SessionState;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  session,
  messages,
  setMessages,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('google/gemma-4-31b-it:free');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load available models from /api/models
  useEffect(() => {
    fetch('/api/models')
      .then((res) => res.json())
      .then((data) => {
        if (data.models && data.models.length > 0) {
          setModels(data.models);
          if (data.currentDefault) {
            setSelectedModel(data.currentDefault);
          }
        }
      })
      .catch((err) => console.warn('Erro ao carregar lista de modelos:', err));
  }, []);

  const suggestedQuestions = [
    'Qual fornecedor teve o maior valor?',
    'Quais são os 5 maiores fornecedores?',
    'Qual foi o total por mês?',
    'Existem valores atípicos?',
    'Quais colunas possuem dados faltantes?',
    'Faça uma análise exploratória dos dados.',
    'Mostre um gráfico dos 10 maiores fornecedores.',
    'Compare o volume por categoria.',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSubmitting]);

  const handleSendMessage = async (queryText?: string) => {
    const text = (queryText || inputQuery).trim();
    if (!text || isSubmitting) return;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsSubmitting(true);

    try {
      // Send only recent lightweight text history to avoid oversized JSON payloads
      const sanitizedHistory = messages.slice(-8).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: sanitizedHistory,
          model: selectedModel,
        }),
      });

      if (res.status === 413) {
        throw new Error('A mensagem ou o histórico é muito extenso. Tente limpar o chat ou fazer uma pergunta mais específica.');
      }

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : { error: await res.text() };

      if (!res.ok) {
        const errorText = typeof data.error === 'string' && data.error.includes('<html')
          ? 'Erro de comunicação com o servidor de IA.'
          : (data.error || 'Erro ao consultar o agente.');
        throw new Error(errorText);
      }

      if (data.response) {
        setMessages((prev) => [...prev, data.response]);
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'agent',
        text: `Ocorreu um erro ao processar sua consulta: ${err.message || 'Erro de comunicação com o servidor.'}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const activeModelObj = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Chat Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900">Agente EDA Inteligente</h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                DuckDB Ativo
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {session.datasets.length} dataset{session.datasets.length > 1 ? 's' : ''} indexado{session.datasets.length > 1 ? 's' : ''} em memória
            </p>
          </div>
        </div>

        {/* Model Selector & Actions */}
        <div className="flex items-center gap-2">
          {models.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-2xs hover:border-indigo-300 hover:bg-slate-50 transition-colors"
                title="Selecionar modelo de IA para inferência"
              >
                <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                <span className="max-w-[160px] truncate">
                  {activeModelObj ? activeModelObj.name : selectedModel}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {isModelDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsModelDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Modelos de IA Disponíveis
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {models.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedModel(m.id);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`w-full text-left rounded-lg px-2.5 py-2 text-xs transition-colors flex items-start justify-between ${
                            selectedModel === m.id
                              ? 'bg-indigo-50 text-indigo-950 font-semibold'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span>{m.name}</span>
                              {m.isFree && (
                                <span className="rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-bold text-emerald-700">
                                  FREE
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                              {m.provider}
                            </div>
                          </div>
                          {selectedModel === m.id && (
                            <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-200/60 transition-colors"
            title="Limpar histórico de conversa"
          >
            <RefreshCw className="h-3 w-3" />
            Limpar Chat
          </button>
        </div>
      </div>

      {/* Suggested Questions Chips */}
      <div className="border-b border-slate-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-500">
          <Sparkles className="h-3 w-3 text-amber-500" />
          Perguntas Sugeridas:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInputQuery(q);
                handleSendMessage(q);
              }}
              disabled={isSubmitting}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-900 transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-400">
            <Bot className="h-10 w-10 text-indigo-400 mb-3" />
            <h4 className="text-sm font-semibold text-slate-700">Como posso ajudar na sua análise?</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Faça perguntas em linguagem natural sobre valores, rankings, séries temporais, anomalias ou qualidade dos dados. O DuckDB calculará as respostas exatas.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'agent' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs mt-0.5">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-xl p-3.5 text-xs ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-xs'
                    : msg.isError
                    ? 'bg-rose-50 border border-rose-200 text-rose-800'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-xs'
                }`}
              >
                {/* Model Badge */}
                {msg.sender === 'agent' && msg.modelUsed && (
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                    <Cpu className="h-3 w-3 text-indigo-500" />
                    <span>Modelo: {msg.modelUsed}</span>
                  </div>
                )}

                {/* Text Content */}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>

                {/* Interactive Chart if provided */}
                {msg.chart && <ChartRenderer chart={msg.chart} />}

                {/* Table Data if returned */}
                {msg.tableData && msg.tableData.length > 0 && (
                  <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-left text-[11px]">
                      <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                        <tr>
                          {(msg.tableColumns || Object.keys(msg.tableData[0])).map((col) => (
                            <th key={col} className="px-3 py-2 font-mono whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                        {msg.tableData.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50/70">
                            {(msg.tableColumns || Object.keys(row)).map((col, cIdx) => {
                              const val = row[col];
                              return (
                                <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                                  {typeof val === 'number'
                                    ? val.toLocaleString('pt-BR')
                                    : val === null || val === undefined
                                    ? '—'
                                    : String(val)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Query Transparency / How was it obtained */}
                {msg.transparency && <QueryDetails details={msg.transparency} />}
              </div>

              {msg.sender === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white text-xs mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))
        )}

        {/* Loading Spinner */}
        {isSubmitting && (
          <div className="flex gap-3 justify-start items-center">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 shadow-xs">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              <span>
                DuckDB executando SQL & {activeModelObj?.name || 'IA'} analisando os dados...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Pergunte qualquer coisa sobre seus dados..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
          />
          <button
            id="send-chat-btn"
            onClick={() => handleSendMessage()}
            disabled={!inputQuery.trim() || isSubmitting}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0 shadow-xs"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
