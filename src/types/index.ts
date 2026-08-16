export interface ColumnMetadata {
  name: string;
  type: string; // DuckDB SQL type (e.g. VARCHAR, DOUBLE, BIGINT, DATE, TIMESTAMP)
  semanticType: 'currency' | 'number' | 'percentage' | 'date' | 'category' | 'identifier' | 'text';
  description?: string;
  unit?: string;
  businessRules?: string;
}

export interface DatasetCatalogItem {
  id: string;
  name: string; // sanitized table name in DuckDB
  originalFilename: string;
  displayName: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnMetadata[];
  primaryDateColumn?: string;
  primaryMetricColumn?: string;
  primaryCategoryColumn?: string;
}

export interface ColumnProfile {
  name: string;
  type: string;
  semanticType: 'currency' | 'number' | 'percentage' | 'date' | 'category' | 'identifier' | 'text';
  description?: string;
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  sampleValues: any[];
  // Numeric statistics
  isNumeric: boolean;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  sum?: number;
  outlierCount?: number;
  outlierPercentage?: number;
  outlierThresholdLow?: number;
  outlierThresholdHigh?: number;
  // Categorical statistics
  isCategorical: boolean;
  topCategories?: { value: string; count: number; percentage: number }[];
  // Date statistics
  isDate: boolean;
  minDate?: string;
  maxDate?: string;
  dateSpanDays?: number;
}

export interface DataQualityReport {
  overallScore: number; // 0 to 100
  totalCells: number;
  totalNulls: number;
  nullRate: number;
  duplicateRowsEstimate: number;
  columnsWithHighNulls: { column: string; nullPercentage: number }[];
  columnsWithOutliers: { column: string; outlierCount: number; outlierPercentage: number }[];
  typeIssues: { column: string; issue: string }[];
  recommendations: string[];
}

export interface TemporalDistribution {
  dateColumn: string;
  metricColumn?: string;
  data: { period: string; count: number; sum?: number; avg?: number }[];
}

export interface DatasetProfile {
  datasetId: string;
  datasetName: string;
  displayName: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  quality: DataQualityReport;
  temporalDistributions: TemporalDistribution[];
  previewRows: Record<string, any>[];
  generatedAt: string;
}

export interface AutomatedInsight {
  id: string;
  title: string;
  description: string;
  type: 'highlight' | 'warning' | 'trend' | 'quality' | 'anomaly';
  datasetName?: string;
  metric?: string;
}

export interface DataDictionaryEntry {
  columnName: string;
  description: string;
  type?: string;
  unit?: string;
  businessRules?: string;
  synonyms?: string[];
}

export interface ChartDataPayload {
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'scatter';
  title: string;
  xAxis: string;
  yAxis: string | string[];
  data: Record<string, any>[];
  description?: string;
}

export interface QueryTransparencyDetails {
  dataset: string;
  operation: string;
  groupBy?: string | string[];
  metric?: string;
  aggregation?: string;
  filters?: Record<string, any>[];
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  limit?: number;
  generatedSql?: string;
  executionTimeMs?: number;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  description?: string;
  isFree?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  tableData?: Record<string, any>[];
  tableColumns?: string[];
  chart?: ChartDataPayload;
  transparency?: QueryTransparencyDetails;
  insights?: string[];
  isError?: boolean;
  modelUsed?: string;
}

export interface ApiKeysConfig {
  geminiApiKey?: string;
  openRouterApiKey?: string;
}

export interface ServerConfigInfo {
  maxUploadMb: number;
  configured: {
    gemini: boolean;
    openrouter: boolean;
  };
  currentDefault: string;
}

export interface SessionState {
  sessionId: string;
  datasets: DatasetCatalogItem[];
  dictionary: Record<string, DataDictionaryEntry>;
  profiles: Record<string, DatasetProfile>;
  insights: AutomatedInsight[];
  dictionaryFound: boolean;
  dictionaryFilename?: string;
  createdAt: string;
}
