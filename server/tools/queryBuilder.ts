import { z } from 'zod';
import { DatasetCatalogItem, QueryTransparencyDetails } from '../../src/types';
import { DuckDBManager } from '../duckdb/db';

export const StructuredQuerySchema = z.object({
  dataset: z.string().describe('Name of the dataset table to query'),
  operation: z.enum([
    'top_n',
    'aggregate',
    'group_by',
    'time_series',
    'growth',
    'percent_share',
    'data_quality',
    'distribution',
    'filter_select',
  ]).describe('Analytical operation type'),
  dimension: z.string().optional().describe('Primary dimension or categorical column to group by'),
  groupBy: z.union([z.string(), z.array(z.string())]).optional().describe('Column(s) to group by'),
  metric: z.string().optional().describe('Numerical column to aggregate'),
  aggregation: z.enum(['sum', 'avg', 'count', 'count_distinct', 'min', 'max', 'median']).optional().default('sum').describe('Aggregation function to apply'),
  timeColumn: z.string().optional().describe('Date column for temporal analysis'),
  timeGranularity: z.enum(['month', 'year', 'quarter', 'day', 'week']).optional().default('month').describe('Time grouping interval'),
  filters: z.array(
    z.object({
      column: z.string(),
      operator: z.enum(['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'is_null', 'is_not_null']),
      value: z.any().optional(),
    })
  ).optional().describe('Filters to apply'),
  orderByDirection: z.enum(['ASC', 'DESC']).optional().default('DESC').describe('Sort direction'),
  limit: z.number().int().min(1).max(500).optional().default(10).describe('Max records to return'),
});

export type StructuredQueryInput = {
  dataset: string;
  operation: 'top_n' | 'aggregate' | 'group_by' | 'time_series' | 'growth' | 'percent_share' | 'data_quality' | 'distribution' | 'filter_select';
  dimension?: string;
  groupBy?: string | string[];
  metric?: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max' | 'median';
  timeColumn?: string;
  timeGranularity?: 'month' | 'year' | 'quarter' | 'day' | 'week';
  filters?: {
    column: string;
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'in' | 'is_null' | 'is_not_null';
    value?: any;
  }[];
  orderByDirection?: 'ASC' | 'DESC';
  limit?: number;
};

export class SafeQueryBuilder {
  /**
   * Validates table and column names against the dataset catalog to prevent SQL injection.
   */
  public static validateIdentifiers(
    input: StructuredQueryInput,
    catalog: DatasetCatalogItem[]
  ): { datasetItem: DatasetCatalogItem; validColumns: Set<string> } {
    const datasetItem = catalog.find(
      (d) => d.name.toLowerCase() === input.dataset.toLowerCase() || d.id === input.dataset
    );

    if (!datasetItem) {
      throw new Error(`Dataset '${input.dataset}' não encontrado no catálogo. Datasets disponíveis: ${catalog.map((d) => d.name).join(', ')}`);
    }

    const validColumns = new Set(datasetItem.columns.map((c) => c.name.toLowerCase()));

    const checkCol = (colName?: string) => {
      if (!colName) return;
      if (!validColumns.has(colName.toLowerCase())) {
        throw new Error(`Coluna '${colName}' não encontrada no dataset '${datasetItem.name}'. Colunas disponíveis: ${datasetItem.columns.map((c) => c.name).join(', ')}`);
      }
    };

    if (input.dimension) checkCol(input.dimension);
    if (input.metric) checkCol(input.metric);
    if (input.timeColumn) checkCol(input.timeColumn);

    if (input.groupBy) {
      const groups = Array.isArray(input.groupBy) ? input.groupBy : [input.groupBy];
      groups.forEach(checkCol);
    }

    if (input.filters) {
      input.filters.forEach((f) => checkCol(f.column));
    }

    return { datasetItem, validColumns };
  }

  /**
   * Helper to build safe WHERE clause
   */
  private static buildWhereClause(filters: StructuredQueryInput['filters']): string {
    if (!filters || filters.length === 0) return '';
    const clauses: string[] = [];

    for (const f of filters) {
      const colSafe = `"${f.column.replace(/"/g, '""')}"`;
      if (f.operator === 'is_null') {
        clauses.push(`${colSafe} IS NULL`);
      } else if (f.operator === 'is_not_null') {
        clauses.push(`${colSafe} IS NOT NULL`);
      } else if (f.operator === 'in' && Array.isArray(f.value)) {
        const inVals = f.value.map((v) => (typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`)).join(', ');
        clauses.push(`${colSafe} IN (${inVals})`);
      } else if (f.operator === 'like') {
        clauses.push(`LOWER(CAST(${colSafe} AS VARCHAR)) LIKE LOWER('%${String(f.value).replace(/'/g, "''")}%')`);
      } else {
        const valStr = typeof f.value === 'number' ? f.value : `'${String(f.value).replace(/'/g, "''")}'`;
        clauses.push(`${colSafe} ${f.operator} ${valStr}`);
      }
    }

    return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  }

  /**
   * Sanitizes and adapts standard SQL dialects to DuckDB compatibility.
   */
  public static adaptSqlToDuckDb(sql: string): string {
    let adapted = sql;

    // 1. Fix strftime('format', column) -> strftime(CAST(column AS TIMESTAMP), 'format')
    adapted = adapted.replace(
      /strftime\s*\(\s*(['"][^'"]+['"])\s*,\s*([a-zA-Z0-9_."]+)\s*\)/gi,
      (match, fmt, col) => `strftime(CAST(${col} AS TIMESTAMP), ${fmt})`
    );

    // 2. Fix strftime(column, 'format') -> strftime(CAST(column AS TIMESTAMP), 'format')
    adapted = adapted.replace(
      /strftime\s*\(\s*([a-zA-Z0-9_."]+)\s*,\s*(['"][^'"]+['"])\s*\)/gi,
      (match, col, fmt) => {
        // If col already has CAST or is format, don't duplicate
        if (col.toUpperCase().includes('CAST')) return match;
        return `strftime(CAST(${col} AS TIMESTAMP), ${fmt})`;
      }
    );

    // 3. Fix TO_CHAR(column, 'YYYY-MM') -> strftime(CAST(column AS TIMESTAMP), '%Y-%m')
    adapted = adapted.replace(
      /to_char\s*\(\s*([a-zA-Z0-9_."]+)\s*,\s*['"]YYYY-MM['"]\s*\)/gi,
      (match, col) => `strftime(CAST(${col} AS TIMESTAMP), '%Y-%m')`
    );

    return adapted;
  }

  /**
   * Validates and executes a safe read-only SQL query directly in DuckDB.
   */
  public static async executeRawSqlQuery(
    db: DuckDBManager,
    sqlQuery: string
  ): Promise<{
    data: Record<string, any>[];
    transparency: QueryTransparencyDetails;
  }> {
    const trimmedSql = sqlQuery.trim();
    const cleanSql = trimmedSql.replace(/;+$/, '').trim();

    // Enforce read-only queries
    const upper = cleanSql.toUpperCase();
    const forbiddenKeywords = [
      'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
      'ATTACH', 'DETACH', 'COPY', 'EXPORT', 'IMPORT', 'INSTALL', 'LOAD',
      'PRAGMA DATABASE_LIST', 'CALL'
    ];

    for (const kw of forbiddenKeywords) {
      // Check if word boundary exists
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(upper) && !upper.startsWith('EXPLAIN') && !upper.startsWith('DESCRIBE')) {
        throw new Error(`Operação SQL não permitida por motivos de segurança: ${kw}`);
      }
    }

    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && !upper.startsWith('DESCRIBE') && !upper.startsWith('EXPLAIN')) {
      throw new Error('Apenas consultas de leitura (SELECT / WITH) são permitidas.');
    }

    // Apply DuckDB dialect optimizations & fixes
    let finalSql = this.adaptSqlToDuckDb(cleanSql);

    // Ensure reasonable limit if missing
    if (!/\bLIMIT\s+\d+/i.test(finalSql)) {
      finalSql += ' LIMIT 100';
    }

    const startTime = Date.now();
    let data: Record<string, any>[] = [];

    try {
      data = await db.query<Record<string, any>>(finalSql);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      // If error is related to strftime or date casting, try an aggressive fallback with SUBSTRING
      if (errMsg.includes('strftime') || errMsg.includes('Binder Error') && errMsg.includes('TIME')) {
        const fallbackSql = finalSql.replace(
          /strftime\s*\([^,]+,\s*[^)]+\)|strftime\s*\([^)]+\)/gi,
          (m) => {
            // Extract column if possible
            const match = m.match(/([a-zA-Z0-9_."]+)/g);
            const col = match && match.length > 1 ? match[match.length - 1] : 'data';
            return `SUBSTRING(CAST(${col} AS VARCHAR), 1, 7)`;
          }
        );
        try {
          data = await db.query<Record<string, any>>(fallbackSql);
          finalSql = fallbackSql;
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const executionTimeMs = Date.now() - startTime;

    const transparency: QueryTransparencyDetails = {
      dataset: 'sql_custom',
      operation: 'custom_sql',
      generatedSql: finalSql,
      executionTimeMs,
    };

    return { data, transparency };
  }

  /**
   * Builds and executes safe DuckDB SQL query.
   */
  public static async executeStructuredQuery(
    db: DuckDBManager,
    input: StructuredQueryInput,
    catalog: DatasetCatalogItem[]
  ): Promise<{
    data: Record<string, any>[];
    transparency: QueryTransparencyDetails;
  }> {
    const { datasetItem } = this.validateIdentifiers(input, catalog);
    const tableName = datasetItem.name;
    const whereClause = this.buildWhereClause(input.filters);

    let sql = '';
    const aggMap: Record<string, string> = {
      sum: 'SUM',
      avg: 'AVG',
      count: 'COUNT',
      count_distinct: 'COUNT(DISTINCT',
      min: 'MIN',
      max: 'MAX',
      median: 'MEDIAN',
    };

    const aggFunc = aggMap[input.aggregation || 'sum'] || 'SUM';
    const sortDir = input.orderByDirection || 'DESC';
    const recordLimit = input.limit || 10;

    if (input.operation === 'top_n' || input.operation === 'group_by') {
      const groupCol = input.dimension || (Array.isArray(input.groupBy) ? input.groupBy[0] : input.groupBy);
      if (!groupCol) {
        throw new Error('Dimensão (groupBy ou dimension) é obrigatória para operação top_n / group_by');
      }

      const safeGroup = `"${groupCol.replace(/"/g, '""')}"`;
      let metricExpr = 'COUNT(*)';
      let metricAlias = 'quantidade';

      if (input.metric) {
        const safeMetric = `"${input.metric.replace(/"/g, '""')}"`;
        if (aggFunc.startsWith('COUNT(DISTINCT')) {
          metricExpr = `COUNT(DISTINCT ${safeMetric})`;
        } else {
          metricExpr = `ROUND(${aggFunc}(CAST(${safeMetric} AS DOUBLE)), 2)`;
        }
        metricAlias = `${input.aggregation || 'sum'}_${input.metric.toLowerCase()}`;
      }

      sql = `
        SELECT 
          CAST(${safeGroup} AS VARCHAR) as "${groupCol}",
          ${metricExpr} as "${metricAlias}"
        FROM "${tableName}"
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} ${safeGroup} IS NOT NULL
        GROUP BY 1
        ORDER BY 2 ${sortDir}
        LIMIT ${recordLimit}
      `;
    } else if (input.operation === 'time_series') {
      const timeCol = input.timeColumn || datasetItem.primaryDateColumn || datasetItem.columns.find((c) => c.type.includes('DATE') || c.type.includes('TIME'))?.name;
      if (!timeCol) {
        throw new Error('Coluna de data (timeColumn) não especificada e nenhuma coluna de data encontrada no dataset');
      }

      const safeTime = `"${timeCol.replace(/"/g, '""')}"`;
      let timeExpr = `SUBSTRING(CAST(${safeTime} AS VARCHAR), 1, 7)`; // default month 'YYYY-MM'
      if (input.timeGranularity === 'year') {
        timeExpr = `SUBSTRING(CAST(${safeTime} AS VARCHAR), 1, 4)`;
      } else if (input.timeGranularity === 'day') {
        timeExpr = `SUBSTRING(CAST(${safeTime} AS VARCHAR), 1, 10)`;
      }

      let metricExpr = 'COUNT(*) as "quantidade"';
      if (input.metric) {
        const safeMetric = `"${input.metric.replace(/"/g, '""')}"`;
        metricExpr = `ROUND(${aggFunc}(CAST(${safeMetric} AS DOUBLE)), 2) as "${input.aggregation}_${input.metric.toLowerCase()}", COUNT(*) as "quantidade_registros"`;
      }

      sql = `
        SELECT 
          ${timeExpr} as "periodo",
          ${metricExpr}
        FROM "${tableName}"
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} ${safeTime} IS NOT NULL
        GROUP BY 1
        ORDER BY 1 ASC
        LIMIT ${input.limit || 36}
      `;
    } else if (input.operation === 'growth') {
      const timeCol = input.timeColumn || datasetItem.primaryDateColumn || datasetItem.columns.find((c) => c.type.includes('DATE'))?.name;
      if (!timeCol || !input.metric) {
        throw new Error('Coluna de data e métrica são obrigatórias para análise de crescimento (growth)');
      }

      const safeTime = `"${timeCol.replace(/"/g, '""')}"`;
      const safeMetric = `"${input.metric.replace(/"/g, '""')}"`;

      sql = `
        WITH monthly_agg AS (
          SELECT 
            SUBSTRING(CAST(${safeTime} AS VARCHAR), 1, 7) as periodo,
            ROUND(${aggFunc}(CAST(${safeMetric} AS DOUBLE)), 2) as valor_atual
          FROM "${tableName}"
          ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} ${safeTime} IS NOT NULL
          GROUP BY 1
          ORDER BY 1 ASC
        )
        SELECT 
          periodo,
          valor_atual,
          LAG(valor_atual) OVER (ORDER BY periodo ASC) as valor_anterior,
          ROUND(((valor_atual - LAG(valor_atual) OVER (ORDER BY periodo ASC)) / NULLIF(LAG(valor_atual) OVER (ORDER BY periodo ASC), 0)) * 100, 2) as crescimento_pct
        FROM monthly_agg
        LIMIT ${input.limit || 36}
      `;
    } else if (input.operation === 'percent_share') {
      const groupCol = input.dimension || (Array.isArray(input.groupBy) ? input.groupBy[0] : input.groupBy);
      if (!groupCol || !input.metric) {
        throw new Error('Dimensão e métrica são obrigatórias para percent_share');
      }

      const safeGroup = `"${groupCol.replace(/"/g, '""')}"`;
      const safeMetric = `"${input.metric.replace(/"/g, '""')}"`;

      sql = `
        WITH totals AS (
          SELECT SUM(CAST(${safeMetric} AS DOUBLE)) as total_geral
          FROM "${tableName}"
          ${whereClause}
        )
        SELECT 
          CAST(${safeGroup} AS VARCHAR) as "${groupCol}",
          ROUND(SUM(CAST(${safeMetric} AS DOUBLE)), 2) as "valor_total",
          ROUND((SUM(CAST(${safeMetric} AS DOUBLE)) / MAX(totals.total_geral)) * 100, 2) as "participacao_pct"
        FROM "${tableName}", totals
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} ${safeGroup} IS NOT NULL
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT ${input.limit}
      `;
    } else if (input.operation === 'aggregate') {
      if (!input.metric) {
        sql = `SELECT COUNT(*) as total_registros FROM "${tableName}" ${whereClause}`;
      } else {
        const safeMetric = `"${input.metric.replace(/"/g, '""')}"`;
        sql = `
          SELECT 
            COUNT(*) as total_registros,
            ROUND(SUM(CAST(${safeMetric} AS DOUBLE)), 2) as soma_total,
            ROUND(AVG(CAST(${safeMetric} AS DOUBLE)), 2) as media,
            ROUND(MEDIAN(CAST(${safeMetric} AS DOUBLE)), 2) as mediana,
            ROUND(MIN(CAST(${safeMetric} AS DOUBLE)), 2) as valor_minimo,
            ROUND(MAX(CAST(${safeMetric} AS DOUBLE)), 2) as valor_maximo
          FROM "${tableName}"
          ${whereClause}
        `;
      }
    } else {
      // filter_select preview
      sql = `SELECT * FROM "${tableName}" ${whereClause} LIMIT ${input.limit || 20}`;
    }

    const startTime = Date.now();
    const data = await db.query<Record<string, any>>(sql);
    const executionTimeMs = Date.now() - startTime;

    const transparency: QueryTransparencyDetails = {
      dataset: datasetItem.name,
      operation: input.operation,
      groupBy: input.dimension || input.groupBy,
      metric: input.metric,
      aggregation: input.aggregation,
      filters: input.filters,
      orderBy: input.dimension || input.metric,
      orderDirection: input.orderByDirection,
      limit: input.limit,
      generatedSql: sql.trim().replace(/\s+/g, ' '),
      executionTimeMs,
    };

    return { data, transparency };
  }
}
