import React from 'react';
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  BrainCircuit,
} from 'lucide-react';
import { AutomatedInsight } from '../types';

interface AutoInsightsProps {
  insights: AutomatedInsight[];
}

export const AutoInsights: React.FC<AutoInsightsProps> = ({ insights }) => {
  const getIcon = (type: AutomatedInsight['type']) => {
    switch (type) {
      case 'highlight':
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />;
      case 'anomaly':
        return <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />;
      case 'trend':
        return <TrendingUp className="h-5 w-5 text-indigo-600 shrink-0" />;
      default:
        return <Sparkles className="h-5 w-5 text-indigo-600 shrink-0" />;
    }
  };

  const getBadgeStyle = (type: AutomatedInsight['type']) => {
    switch (type) {
      case 'highlight':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'anomaly':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'trend':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getTypeLabel = (type: AutomatedInsight['type']) => {
    switch (type) {
      case 'highlight':
        return 'Destaque Positivo';
      case 'warning':
        return 'Atenção';
      case 'anomaly':
        return 'Possível Anomalia';
      case 'trend':
        return 'Tendência Temporal';
      default:
        return 'Insight';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-indigo-600" />
          Principais Insights Analíticos Automáticos
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Conclusões derivadas estritamente do perfilamento estatístico em DuckDB processadas pela IA.
        </p>
      </div>

      {insights.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-xs">
          Nenhum insight gerado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {insights.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${getBadgeStyle(
                      item.type
                    )}`}
                  >
                    {getTypeLabel(item.type)}
                  </span>
                  {item.datasetName && (
                    <span className="text-[11px] text-slate-400 font-mono truncate">
                      {item.datasetName}
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3 mt-3">
                  <div className="mt-0.5">{getIcon(item.type)}</div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
