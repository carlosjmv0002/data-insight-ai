import React, { useState, useEffect } from 'react';
import {
  UploadZone,
} from './components/UploadZone';
import { Sidebar } from './components/Sidebar';
import { DatasetOverview } from './components/DatasetOverview';
import { DataQuality } from './components/DataQuality';
import { StatisticsTable } from './components/StatisticsTable';
import { DistributionsView } from './components/DistributionsView';
import { TemporalAnalysisView } from './components/TemporalAnalysisView';
import { AutoInsights } from './components/AutoInsights';
import { ChatInterface } from './components/ChatInterface';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { SessionState, ChatMessage, ServerConfigInfo } from './types';
import { Sparkles, CheckCircle2, AlertCircle, RefreshCw, Key } from 'lucide-react';

export function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfigInfo | null>(null);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);

  const fetchServerConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setServerConfig(data);
      }
    } catch (e) {
      console.warn('Could not fetch server config:', e);
    }
  };

  // Check initial session
  const fetchSession = async () => {
    try {
      const res = await fetch('/api/session');
      if (!res.ok) return;
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const data = await res.json();
      if (data.session && data.session.datasets.length > 0) {
        setSession(data.session);
        setSelectedDatasetId(data.session.datasets[0]?.id || '');
      }
    } catch (e) {
      console.warn('No active session found on boot.');
    }
  };

  useEffect(() => {
    fetchSession();
    fetchServerConfig();
  }, []);

  const handleUploadSuccess = async () => {
    await fetchSession();
    setActiveTab('overview');
  };

  const handleNewUpload = () => {
    setSession(null);
    setMessages([]);
    setError(null);
  };

  const currentDataset =
    session?.datasets.find((d) => d.id === selectedDatasetId) || session?.datasets[0];
  const currentProfile = currentDataset ? session?.profiles[currentDataset.id] : undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans antialiased">
      {session && session.datasets.length > 0 ? (
        <div className="flex w-full min-h-screen">
          {/* Left Navigation Sidebar */}
          <Sidebar
            session={session}
            selectedDatasetId={selectedDatasetId}
            onSelectDataset={(id) => setSelectedDatasetId(id)}
            activeTab={activeTab}
            onSelectTab={(tab) => setActiveTab(tab)}
            onNewUpload={handleNewUpload}
          />

          {/* Main Dashboard Workspace */}
          <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            {/* Top Workspace Header */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3.5 backdrop-blur-xs">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    {currentDataset?.displayName}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-normal text-slate-600">
                      {currentDataset?.name}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    {currentDataset?.rowCount.toLocaleString('pt-BR')} registros • {currentDataset?.columnCount} colunas
                  </p>
                </div>
              </div>

              {/* Header Right Actions & Quick Tab Switcher */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsApiModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Configurar Chaves de API"
                >
                  <Key className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">APIs</span>
                </button>

                <div className="hidden md:flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-medium">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'overview' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Visão Geral
                  </button>
                  <button
                    onClick={() => setActiveTab('quality')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'quality' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Qualidade
                  </button>
                  <button
                    onClick={() => setActiveTab('statistics')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'statistics' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Estatísticas
                  </button>
                  <button
                    onClick={() => setActiveTab('distributions')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'distributions' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Distribuições
                  </button>
                  <button
                    onClick={() => setActiveTab('temporal')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'temporal' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tendências
                  </button>
                  <button
                    onClick={() => setActiveTab('insights')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'insights' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Insights
                  </button>
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-xs' : 'text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100'
                    }`}
                  >
                    Pergunte aos Dados
                  </button>
                </div>
              </div>
            </header>

            {/* Dashboard Content Canvas */}
            <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
              {/* Ready Welcome Card Banner */}
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/60 p-4 shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs mt-0.5">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Seus dados estão prontos para análise exploratória.
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                        Encontrei <span className="font-semibold text-slate-900">{session.datasets.length} dataset{session.datasets.length > 1 ? 's' : ''}</span> com um total de{' '}
                        <span className="font-semibold text-slate-900">
                          {session.datasets.reduce((acc, d) => acc + d.rowCount, 0).toLocaleString('pt-BR')} registros
                        </span>
                        . O DuckDB e o agente inteligente estão calibrados para consultas.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('chat')}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs transition-colors shrink-0"
                  >
                    Fazer Pergunta
                  </button>
                </div>
              </div>

              {/* Dynamic View rendering based on active tab */}
              {activeTab === 'overview' && currentDataset && (
                <DatasetOverview
                  dataset={currentDataset}
                  profile={currentProfile}
                  dictionary={session.dictionary}
                />
              )}

              {activeTab === 'quality' && (
                <DataQuality profile={currentProfile} />
              )}

              {activeTab === 'statistics' && (
                <StatisticsTable profile={currentProfile} />
              )}

              {activeTab === 'distributions' && (
                <DistributionsView profile={currentProfile} />
              )}

              {activeTab === 'temporal' && (
                <TemporalAnalysisView profile={currentProfile} />
              )}

              {activeTab === 'insights' && (
                <AutoInsights insights={session.insights} />
              )}

              {activeTab === 'chat' && (
                <ChatInterface
                  session={session}
                  messages={messages}
                  setMessages={setMessages}
                />
              )}
            </div>
          </main>
        </div>
      ) : (
        /* Upload & Welcome View */
        <div className="flex-1 flex flex-col justify-center items-center py-12">
          {error && (
            <div className="mb-6 flex max-w-xl items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs font-medium text-rose-800 shadow-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <UploadZone
            onUploadSuccess={handleUploadSuccess}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            setError={setError}
          />
        </div>
      )}

      {/* Global API Settings Modal */}
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
}

export default App;
