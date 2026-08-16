import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { LineChart as LineChartIcon, Calendar, TrendingUp } from 'lucide-react';
import { DatasetProfile } from '../types';

interface TemporalAnalysisViewProps {
  profile?: DatasetProfile;
}

export const TemporalAnalysisView: React.FC<TemporalAnalysisViewProps> = ({ profile }) => {
  const [metricMode, setMetricMode] = useState<'sum' | 'count' | 'avg'>('sum');

  if (!profile || profile.temporalDistributions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-xs">
        <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-700">Nenhuma coluna de data encontrada</p>
        <p className="text-xs text-slate-400 mt-1">
          A análise temporal automática requer ao menos um campo do tipo DATE ou TIMESTAMP no dataset.
        </p>
      </div>
    );
  }

  const tempDist = profile.temporalDistributions[0];
  const chartData = tempDist.data;

  const yKey = metricMode === 'count' ? 'count' : metricMode === 'avg' ? 'avg' : 'sum';
  const labelText =
    metricMode === 'count'
      ? 'Contagem de Registros'
      : metricMode === 'avg'
      ? `Média (${tempDist.metricColumn || 'Valor'})`
      : `Soma Total R$ (${tempDist.metricColumn || 'Valor'})`;

  return (
    <div className="space-y-6">
      {/* Header & metric switch */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            Análise Temporal e Tendências
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Evolução mensal agregada automaticamente pela coluna de data{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800 font-mono">
              {tempDist.dateColumn}
            </code>
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {tempDist.metricColumn && (
            <button
              onClick={() => setMetricMode('sum')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                metricMode === 'sum' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Valor Total (R$)
            </button>
          )}
          {tempDist.metricColumn && (
            <button
              onClick={() => setMetricMode('avg')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                metricMode === 'avg' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Média (R$)
            </button>
          )}
          <button
            onClick={() => setMetricMode('count')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              metricMode === 'count' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Volume de Linhas
          </button>
        </div>
      </div>

      {/* Main Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-700">{labelText}</h4>
          <span className="text-[11px] text-slate-400">{chartData.length} períodos mensais</span>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <defs>
                <linearGradient id="timeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                stroke="#cbd5e1"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(val: any) => [
                  metricMode === 'count'
                    ? `${Number(val).toLocaleString('pt-BR')} registros`
                    : Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                  labelText,
                ]}
              />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke="#4f46e5"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#timeGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Temporal Data Breakdown Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h4 className="text-xs font-semibold text-slate-700 mb-3">Tabela Detalhada por Período</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-2.5">Período</th>
                <th className="px-4 py-2.5 text-right">Volume (Registros)</th>
                {tempDist.metricColumn && <th className="px-4 py-2.5 text-right">Soma Total (R$)</th>}
                {tempDist.metricColumn && <th className="px-4 py-2.5 text-right">Ticket Médio (R$)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
              {chartData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-sans font-medium text-slate-900">{row.period}</td>
                  <td className="px-4 py-2.5 text-right">{row.count.toLocaleString('pt-BR')}</td>
                  {tempDist.metricColumn && (
                    <td className="px-4 py-2.5 text-right font-medium text-indigo-700">
                      {row.sum !== undefined
                        ? row.sum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </td>
                  )}
                  {tempDist.metricColumn && (
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {row.avg !== undefined
                        ? row.avg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
