import React, { useState } from 'react';
import { Search, Calculator, Download, ArrowUpDown } from 'lucide-react';
import { DatasetProfile } from '../types';

interface StatisticsTableProps {
  profile?: DatasetProfile;
}

export const StatisticsTable: React.FC<StatisticsTableProps> = ({ profile }) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!profile) {
    return (
      <div className="p-8 text-center text-slate-400">
        Nenhum perfil estatístico disponível.
      </div>
    );
  }

  const numericColumns = profile.columns.filter((c) => c.isNumeric);

  const filtered = numericColumns.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatStat = (val: number | undefined, isCurrency?: boolean) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    if (isCurrency) {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return val.toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-4">
      {/* Header and search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-indigo-600" />
            Estatísticas Descritivas das Colunas Numéricas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cálculos estatísticos exatos executados em DuckDB com quartis e desvio padrão.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar colunas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhuma coluna numérica encontrada com o termo "{searchTerm}".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Campo / Coluna</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Mínimo</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Q1 (25%)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Média</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Mediana</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Q3 (75%)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Máximo</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Desvio Padrão</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Soma Total</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Outliers (IQR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                {filtered.map((col) => {
                  const isCurr = col.semanticType === 'currency';
                  return (
                    <tr key={col.name} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold font-mono text-slate-900">{col.name}</div>
                        {col.description && (
                          <div className="text-[11px] text-slate-400 max-w-xs truncate">{col.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{formatStat(col.min, isCurr)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatStat(col.q1, isCurr)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 bg-slate-50/50">
                        {formatStat(col.mean, isCurr)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-indigo-700 bg-indigo-50/30">
                        {formatStat(col.median, isCurr)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatStat(col.q3, isCurr)}</td>
                      <td className="px-4 py-3 text-right">{formatStat(col.max, isCurr)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{formatStat(col.stdDev)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {formatStat(col.sum, isCurr)}
                      </td>
                      <td className="px-4 py-3 text-right font-sans">
                        {col.outlierCount && col.outlierCount > 0 ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 text-[11px]">
                            {col.outlierCount}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
