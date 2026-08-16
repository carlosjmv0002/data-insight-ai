import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartDataPayload } from '../types';

interface ChartRendererProps {
  chart: ChartDataPayload;
}

const COLORS = [
  '#4f46e5', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#14b8a6', // Teal
];

export const ChartRenderer: React.FC<ChartRendererProps> = ({ chart }) => {
  const { chartType, title, xAxis, yAxis, data, description } = chart;

  if (!data || data.length === 0) {
    return null;
  }

  // Format tick values and tooltips for currency and large numbers
  const formatValue = (val: any) => {
    if (typeof val === 'number') {
      if (Math.abs(val) >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`;
      }
      if (Math.abs(val) >= 1000) {
        return `${(val / 1000).toFixed(1)}k`;
      }
      return val.toLocaleString('pt-BR');
    }
    return val;
  };

  const yAxisKey = Array.isArray(yAxis) ? yAxis[0] : yAxis;

  return (
    <div id="chart-container" className="my-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 uppercase">
          {chartType}
        </span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey={xAxis}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                stroke="#cbd5e1"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={formatValue}
                tickLine={false}
                stroke="#cbd5e1"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px',
                }}
                formatter={(val: any) => [
                  typeof val === 'number' ? val.toLocaleString('pt-BR') : val,
                  yAxisKey,
                ]}
              />
              <Line
                type="monotone"
                dataKey={yAxisKey}
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#4f46e5' }}
                activeDot={{ r: 6, fill: '#3730a3' }}
              />
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={xAxis} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatValue} />
              <Tooltip formatter={(val: any) => [typeof val === 'number' ? val.toLocaleString('pt-BR') : val, yAxisKey]} />
              <Area type="monotone" dataKey={yAxisKey} stroke="#4f46e5" fillOpacity={1} fill="url(#areaGradient)" />
            </AreaChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={yAxisKey}
                nameKey={xAxis}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name ? String(name).slice(0, 12) : ''}: ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(val: any) => [typeof val === 'number' ? val.toLocaleString('pt-BR') : val, yAxisKey]} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey={xAxis}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(val) => (typeof val === 'string' && val.length > 14 ? `${val.slice(0, 12)}…` : val)}
                tickLine={false}
                stroke="#cbd5e1"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={formatValue}
                tickLine={false}
                stroke="#cbd5e1"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px',
                }}
                formatter={(val: any) => [
                  typeof val === 'number' ? val.toLocaleString('pt-BR') : val,
                  yAxisKey,
                ]}
              />
              <Bar dataKey={yAxisKey} fill="#4f46e5" radius={[4, 4, 0, 0]}>
                {data.map((_, index) => (
                  <Cell key={`cell-bar-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
