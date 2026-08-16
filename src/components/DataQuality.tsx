import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Copy,
  TrendingDown,
  CheckCircle,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { DatasetProfile } from '../types';

interface DataQualityProps {
  profile?: DatasetProfile;
}

export const DataQuality: React.FC<DataQualityProps> = ({ profile }) => {
  if (!profile) {
    return (
      <div className="p-8 text-center text-slate-400">
        Nenhum perfil de qualidade disponível para este dataset.
      </div>
    );
  }

  const { quality, columns } = profile;

  return (
    <div className="space-y-6">
      {/* Header Quality Score Hero */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 font-bold text-xl border border-emerald-100">
            {quality.overallScore}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Score de Qualidade Geral</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Avaliação de integridade, nulos, duplicatas e outliers
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 font-bold text-xl border border-amber-100">
            {quality.nullRate}%
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Taxa Geral de Nulos</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {quality.totalNulls.toLocaleString('pt-BR')} células sem preenchimento
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-xl border border-indigo-100">
            {quality.duplicateRowsEstimate}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Possíveis Linhas Duplicadas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificadas com valores idênticos em todas as colunas
            </p>
          </div>
        </div>
      </div>

      {/* Two columns: Nulls per Column & Outliers detected */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Nulls breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Preenchimento & Nulos por Coluna
            </h4>
            <span className="text-xs text-slate-400">Total: {columns.length} colunas</span>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {columns.map((col) => {
              const filledPercentage = Number((100 - col.nullPercentage).toFixed(1));
              return (
                <div key={col.name} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="font-mono text-slate-700">{col.name}</span>
                    <span className={col.nullPercentage > 10 ? 'text-amber-600' : 'text-slate-500'}>
                      {col.nullCount > 0 ? `${col.nullCount} nulos (${col.nullPercentage}%)` : '100% preenchido'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full transition-all ${
                        col.nullPercentage === 0
                          ? 'bg-emerald-500'
                          : col.nullPercentage < 15
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${filledPercentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Outlier Detection via IQR */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-indigo-600" />
              Detecção de Outliers (Intervalo Interquartil - IQR 1.5x)
            </h4>
          </div>

          {quality.columnsWithOutliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-xl">
              <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-slate-800">Nenhum outlier crítico detectado</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                As variáveis numéricas apresentam distribuições dentro dos limites estatísticos normais.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {quality.columnsWithOutliers.map((item) => {
                const colProfile = columns.find((c) => c.name === item.column);
                return (
                  <div
                    key={item.column}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span className="font-mono">{item.column}</span>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 text-[11px]">
                        {item.outlierCount} outliers ({item.outlierPercentage}%)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400">Limite Inferior:</span>{' '}
                        {colProfile?.outlierThresholdLow?.toLocaleString('pt-BR') ?? 'N/A'}
                      </div>
                      <div>
                        <span className="text-slate-400">Limite Superior:</span>{' '}
                        {colProfile?.outlierThresholdHigh?.toLocaleString('pt-BR') ?? 'N/A'}
                      </div>
                      <div>
                        <span className="text-slate-400">Q1 (25%):</span>{' '}
                        {colProfile?.q1?.toLocaleString('pt-BR') ?? 'N/A'}
                      </div>
                      <div>
                        <span className="text-slate-400">Q3 (75%):</span>{' '}
                        {colProfile?.q3?.toLocaleString('pt-BR') ?? 'N/A'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Automated Quality Recommendations */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          Recomendações e Diagnósticos Automáticos
        </h4>
        <ul className="space-y-2 text-xs text-slate-700">
          {quality.recommendations.map((rec, idx) => (
            <li key={idx} className="flex items-start gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
