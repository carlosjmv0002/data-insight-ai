import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Database, Clock } from 'lucide-react';
import { QueryTransparencyDetails } from '../types';

interface QueryDetailsProps {
  details: QueryTransparencyDetails;
}

export const QueryDetails: React.FC<QueryDetailsProps> = ({ details }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div id="query-transparency-container" className="my-2 rounded-lg border border-slate-200 bg-slate-50 text-xs">
      <button
        id="toggle-query-transparency-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-100 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-indigo-600" />
          <span>Como a resposta foi obtida (DuckDB)</span>
          {details.executionTimeMs !== undefined && (
            <span className="flex items-center gap-0.5 text-[11px] text-slate-400 font-normal ml-2">
              <Clock className="h-3 w-3" />
              {details.executionTimeMs}ms
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-3 space-y-2 bg-white rounded-b-lg">
          <div className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
            <div>
              <span className="font-semibold text-slate-700">Dataset:</span>{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800">{details.dataset}</code>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Operação:</span>{' '}
              <span className="capitalize">{details.operation}</span>
            </div>
            {details.groupBy && (
              <div>
                <span className="font-semibold text-slate-700">Agrupamento:</span>{' '}
                <span>{Array.isArray(details.groupBy) ? details.groupBy.join(', ') : details.groupBy}</span>
              </div>
            )}
            {details.metric && (
              <div>
                <span className="font-semibold text-slate-700">Métrica:</span>{' '}
                <span>{details.metric} ({details.aggregation?.toUpperCase()})</span>
              </div>
            )}
            {details.limit && (
              <div>
                <span className="font-semibold text-slate-700">Limite:</span> {details.limit} registros
              </div>
            )}
          </div>

          {details.generatedSql && (
            <div className="mt-2">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 mb-1">
                <Terminal className="h-3 w-3 text-slate-500" />
                <span>SQL Executado no DuckDB:</span>
              </div>
              <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-emerald-400 font-mono">
                {details.generatedSql}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
