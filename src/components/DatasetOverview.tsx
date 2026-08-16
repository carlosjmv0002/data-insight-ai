import React, { useState } from 'react';
import {
  Table,
  FileText,
  Hash,
  Calendar,
  AlertTriangle,
  Layers,
  BookOpen,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { DatasetCatalogItem, DatasetProfile, DataDictionaryEntry } from '../types';

interface DatasetOverviewProps {
  dataset: DatasetCatalogItem;
  profile?: DatasetProfile;
  dictionary: Record<string, DataDictionaryEntry>;
}

export const DatasetOverview: React.FC<DatasetOverviewProps> = ({
  dataset,
  profile,
  dictionary,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'schema' | 'preview'>('schema');
  const [previewPage, setPreviewPage] = useState(1);
  const rowsPerPage = 10;

  const dateCol = profile?.columns.find((c) => c.isDate);
  const timeSpan = dateCol?.minDate && dateCol?.maxDate ? `${dateCol.minDate} até ${dateCol.maxDate}` : 'Sem campo data';

  const previewRows = profile?.previewRows || [];
  const totalPreviewPages = Math.ceil(previewRows.length / rowsPerPage);
  const displayedPreviewRows = previewRows.slice((previewPage - 1) * rowsPerPage, previewPage * rowsPerPage);

  const getSemanticBadge = (type: string) => {
    switch (type) {
      case 'currency':
        return <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Moeda (R$)</span>;
      case 'date':
        return <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">Data</span>;
      case 'category':
        return <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">Categoria</span>;
      case 'identifier':
        return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">Identificador</span>;
      case 'percentage':
        return <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Percentual (%)</span>;
      case 'number':
        return <span className="rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700">Numérico</span>;
      default:
        return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Texto</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Registros</span>
            <Hash className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {dataset.rowCount.toLocaleString('pt-BR')}
          </p>
          <span className="text-[11px] text-slate-400">Total de linhas</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Colunas</span>
            <Layers className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dataset.columnCount}</p>
          <span className="text-[11px] text-slate-400">Variáveis mapeadas</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Saúde dos Dados</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {profile?.quality.overallScore || 100}<span className="text-sm font-normal text-slate-400">/100</span>
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">Índice de Qualidade</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Valores Nulos</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {profile?.quality.nullRate || 0}%
          </p>
          <span className="text-[11px] text-slate-400">{profile?.quality.totalNulls || 0} células vazias</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Período</span>
            <Calendar className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-sm font-bold text-slate-900 truncate" title={timeSpan}>
            {timeSpan}
          </p>
          <span className="text-[11px] text-slate-400">Intervalo temporal</span>
        </div>
      </div>

      {/* Sub-tab view: Schema / Preview */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('schema')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeSubTab === 'schema'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Catálogo & Dicionário de Dados
            </button>
            <button
              onClick={() => setActiveSubTab('preview')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeSubTab === 'preview'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Amostra de Dados ({previewRows.length} linhas)
            </button>
          </div>
        </div>

        {activeSubTab === 'schema' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3">Coluna</th>
                  <th className="px-4 py-3">Tipo DuckDB</th>
                  <th className="px-4 py-3">Tipo Semântico</th>
                  <th className="px-4 py-3">Descrição / Dicionário</th>
                  <th className="px-4 py-3 text-right">Valores Distintos</th>
                  <th className="px-4 py-3 text-right">Nulos (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {profile?.columns.map((col) => {
                  const dict = dictionary[col.name.toUpperCase()];
                  return (
                    <tr key={col.name} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {col.name}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-800">
                          {col.type}
                        </code>
                      </td>
                      <td className="px-4 py-3">{getSemanticBadge(col.semanticType)}</td>
                      <td className="px-4 py-3 max-w-xs text-slate-700">
                        {dict ? (
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="h-3 w-3 text-indigo-600 shrink-0" />
                            <span>{dict.description}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Inferência automática</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {col.distinctCount.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-medium ${
                            col.nullPercentage > 15 ? 'text-amber-600' : 'text-slate-600'
                          }`}
                        >
                          {col.nullPercentage}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {previewRows.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">Nenhuma amostra disponível.</p>
            ) : (
              <>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((key) => (
                        <th key={key} className="px-4 py-3 font-mono whitespace-nowrap">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                    {displayedPreviewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        {Object.values(row).map((val: any, cIdx) => (
                          <td key={cIdx} className="px-4 py-2.5 whitespace-nowrap">
                            {val === null || val === undefined ? (
                              <span className="text-slate-300 italic">null</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {totalPreviewPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
                    <span>
                      Página {previewPage} de {totalPreviewPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                        disabled={previewPage === 1}
                        className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                        disabled={previewPage === totalPreviewPages}
                        className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
