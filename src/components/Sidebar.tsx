import React from 'react';
import {
  Database,
  FileSpreadsheet,
  BookOpen,
  Sparkles,
  RefreshCw,
  PlusCircle,
  BarChart3,
  ShieldCheck,
  Table,
  LineChart,
  BrainCircuit,
  MessageSquare,
  ChevronRight,
} from 'lucide-react';
import { DatasetCatalogItem, SessionState } from '../types';

interface SidebarProps {
  session: SessionState;
  selectedDatasetId: string;
  onSelectDataset: (id: string) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onNewUpload: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  selectedDatasetId,
  onSelectDataset,
  activeTab,
  onSelectTab,
  onNewUpload,
}) => {
  const currentDataset = session.datasets.find((d) => d.id === selectedDatasetId) || session.datasets[0];
  const dictTermCount = Object.keys(session.dictionary).length;

  const navItems = [
    { id: 'overview', label: 'Visão Geral', icon: Table },
    { id: 'quality', label: 'Qualidade dos Dados', icon: ShieldCheck },
    { id: 'statistics', label: 'Estatísticas', icon: BarChart3 },
    { id: 'distributions', label: 'Distribuições', icon: BarChart3 },
    { id: 'temporal', label: 'Tendências', icon: LineChart },
    { id: 'insights', label: 'Insights Automáticos', icon: BrainCircuit },
    { id: 'chat', label: 'Pergunte aos Dados', icon: MessageSquare, highlight: true },
  ];

  return (
    <aside className="w-64 flex-col border-r border-slate-200 bg-white flex shrink-0 h-screen sticky top-0">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-base shadow-xs">
            DI
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">DataInsight AI</h1>
            <p className="text-[11px] text-slate-500 font-medium">EDA Agent & Natural Query</p>
          </div>
        </div>

        {/* Agent Status Badge */}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-200 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-medium text-slate-700">DuckDB + Gemini</span>
          </div>
          <span className="text-[10px] uppercase font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
            Ativo
          </span>
        </div>
      </div>

      {/* Dataset Selection Section */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Datasets Carregados ({session.datasets.length})
          </span>
        </div>

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {session.datasets.map((ds) => (
            <button
              key={ds.id}
              onClick={() => onSelectDataset(ds.id)}
              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                ds.id === selectedDatasetId
                  ? 'bg-indigo-50 text-indigo-950 font-medium border border-indigo-200'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileSpreadsheet className={`h-4 w-4 shrink-0 ${ds.id === selectedDatasetId ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className="truncate">{ds.displayName}</span>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                {ds.rowCount > 1000 ? `${(ds.rowCount / 1000).toFixed(0)}k` : ds.rowCount} linhas
              </span>
            </button>
          ))}
        </div>

        {/* Data Dictionary Status Card */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <BookOpen className={`h-3.5 w-3.5 ${session.dictionaryFound ? 'text-emerald-600' : 'text-amber-500'}`} />
            <span className="font-medium text-slate-800">
              {session.dictionaryFound ? 'Dicionário Conectado' : 'Dicionário Semântico'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {dictTermCount > 0
              ? `${dictTermCount} colunas com descrições semânticas vinculadas.`
              : 'Inferência semântica automática ativa.'}
          </p>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 block mb-1">
          Módulos de Análise
        </span>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : item.highlight
                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : item.highlight ? 'text-indigo-600' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </div>
              {isActive && <ChevronRight className="h-3.5 w-3.5 text-indigo-200" />}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Actions */}
      <div className="p-3 border-t border-slate-200 space-y-2">
        <button
          id="new-upload-sidebar-btn"
          onClick={onNewUpload}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
        >
          <PlusCircle className="h-3.5 w-3.5 text-indigo-600" />
          Novo Arquivo ZIP
        </button>
      </div>
    </aside>
  );
};
