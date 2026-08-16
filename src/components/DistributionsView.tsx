import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Layers, BarChart2 } from 'lucide-react';
import { DatasetProfile } from '../types';

interface DistributionsViewProps {
  profile?: DatasetProfile;
}

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#f97316', '#6366f1'];

export const DistributionsView: React.FC<DistributionsViewProps> = ({ profile }) => {
  if (!profile) {
    return <div className="p-8 text-center text-slate-400">Nenhum perfil disponível.</div>;
  }

  const categoricalColumns = profile.columns.filter(
    (c) => c.isCategorical && c.topCategories && c.topCategories.length > 0
  );

  const [selectedColName, setSelectedColName] = useState<string>(
    categoricalColumns[0]?.name || ''
  );

  const selectedCol =
    categoricalColumns.find((c) => c.name === selectedColName) || categoricalColumns[0];

  if (categoricalColumns.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-xs">
        Nenhuma coluna categórica com distribuição encontrada no dataset.
      </div>
    );
  }

  const chartData = selectedCol?.topCategories || [];

  return (
    <div className="space-y-6">
      {/* Header and selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-indigo-600" />
            Distribuições e Frequências Categóricas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Top categorias mais frequentes e participação percentual calculadas no DuckDB.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Selecionar Coluna:</span>
          <select
            value={selectedCol?.name || ''}
            onChange={(e) => setSelectedColName(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
          >
            {categoricalColumns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.distinctCount} valores distintos)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart and Table grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recharts Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-700">
              Top 10 Categorias em <span className="font-mono text-indigo-600">{selectedCol?.name}</span>
            </h4>
            <span className="text-[11px] text-slate-400">Contagem de registros</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  dataKey="value"
                  type="category"
                  tick={{ fontSize: 11, fill: '#334155' }}
                  tickFormatter={(v) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(val: any, name: any, item: any) => [
                    `${Number(val).toLocaleString('pt-BR')} registros (${item.payload.percentage}%)`,
                    'Frequência',
                  ]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Frequencies Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h4 className="text-xs font-semibold text-slate-700 mb-3">
            Tabela de Participação: <span className="font-mono text-indigo-600">{selectedCol?.name}</span>
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2 text-right">Ocorrências</th>
                  <th className="px-3 py-2 text-right">Participação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {chartData.map((cat, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={cat.value}>
                      {cat.value}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">
                      {cat.count.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-indigo-600 font-semibold">
                      {cat.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
