import { DuckDBManager } from '../duckdb/db';
import {
  ColumnProfile,
  DataQualityReport,
  DatasetCatalogItem,
  DatasetProfile,
  TemporalDistribution,
  DataDictionaryEntry,
} from '../../src/types';

export class ProfilingService {
  /**
   * Infers the semantic type of a column based on its SQL type, name, and sample values.
   */
  public static inferSemanticType(
    colName: string,
    sqlType: string,
    dictionaryEntry?: DataDictionaryEntry
  ): 'currency' | 'number' | 'percentage' | 'date' | 'category' | 'identifier' | 'text' {
    const nameLower = colName.toLowerCase();
    const typeUpper = sqlType.toUpperCase();
    const dictDesc = dictionaryEntry?.description?.toLowerCase() || '';

    // Check identifier
    if (
      nameLower.startsWith('id_') ||
      nameLower.endsWith('_id') ||
      nameLower === 'id' ||
      nameLower.startsWith('cod_') ||
      nameLower.startsWith('codigo') ||
      nameLower.includes('cpf') ||
      nameLower.includes('cnpj') ||
      nameLower.includes('uuid') ||
      nameLower.includes('sku')
    ) {
      return 'identifier';
    }

    // Check date / timestamp
    if (
      typeUpper.includes('DATE') ||
      typeUpper.includes('TIME') ||
      nameLower.startsWith('dt_') ||
      nameLower.includes('data') ||
      nameLower.includes('emissao') ||
      nameLower.includes('vencimento') ||
      nameLower.includes('periodo') ||
      nameLower.endsWith('_at')
    ) {
      return 'date';
    }

    // Check currency / monetary
    if (
      (typeUpper.includes('DOUBLE') ||
        typeUpper.includes('DECIMAL') ||
        typeUpper.includes('FLOAT') ||
        typeUpper.includes('INT') ||
        typeUpper.includes('NUMERIC')) &&
      (nameLower.includes('vlr') ||
        nameLower.includes('valor') ||
        nameLower.includes('preco') ||
        nameLower.includes('custo') ||
        nameLower.includes('total') ||
        nameLower.includes('receita') ||
        nameLower.includes('faturamento') ||
        nameLower.includes('pagamento') ||
        nameLower.includes('price') ||
        nameLower.includes('amount') ||
        dictDesc.includes('valor') ||
        dictDesc.includes('reais') ||
        dictDesc.includes('r$'))
    ) {
      return 'currency';
    }

    // Check percentage
    if (
      nameLower.includes('taxa') ||
      nameLower.includes('pct') ||
      nameLower.includes('percentual') ||
      nameLower.includes('desconto_pct') ||
      nameLower.includes('aliquota') ||
      nameLower.includes('rate') ||
      dictDesc.includes('porcentagem') ||
      dictDesc.includes('%')
    ) {
      return 'percentage';
    }

    // Check standard numbers
    if (
      typeUpper.includes('INT') ||
      typeUpper.includes('DOUBLE') ||
      typeUpper.includes('FLOAT') ||
      typeUpper.includes('DECIMAL') ||
      typeUpper.includes('NUMERIC') ||
      typeUpper.includes('HUGEINT')
    ) {
      return 'number';
    }

    return 'category';
  }

  /**
   * Executes in-depth automated profiling for a dataset in DuckDB.
   */
  public static async profileDataset(
    db: DuckDBManager,
    dataset: DatasetCatalogItem,
    dictionary: Record<string, DataDictionaryEntry> = {}
  ): Promise<DatasetProfile> {
    const tableName = dataset.name;
    const rowCount = dataset.rowCount;
    const columnProfiles: ColumnProfile[] = [];

    let totalNullCount = 0;
    const columnsWithHighNulls: { column: string; nullPercentage: number }[] = [];
    const columnsWithOutliers: { column: string; outlierCount: number; outlierPercentage: number }[] = [];
    const typeIssues: { column: string; issue: string }[] = [];

    // Profile each column
    for (const col of dataset.columns) {
      const colName = col.name;
      const sqlType = col.type;
      const dictEntry = dictionary[colName.toUpperCase()];
      const semanticType = this.inferSemanticType(colName, sqlType, dictEntry);

      // Null and distinct count query
      const safeCol = `"${colName.replace(/"/g, '""')}"`;
      const basicStatsQuery = `
        SELECT 
          COUNT(*) - COUNT(${safeCol}) as null_count,
          COUNT(DISTINCT ${safeCol}) as distinct_count
        FROM "${tableName}"
      `;

      let nullCount = 0;
      let distinctCount = 0;
      try {
        const basicRes = await db.query<{ null_count: number; distinct_count: number }>(basicStatsQuery);
        nullCount = basicRes[0]?.null_count || 0;
        distinctCount = basicRes[0]?.distinct_count || 0;
      } catch (e) {
        console.warn(`Error getting basic stats for ${colName}:`, e);
      }

      totalNullCount += nullCount;
      const nullPercentage = rowCount > 0 ? Number(((nullCount / rowCount) * 100).toFixed(2)) : 0;

      if (nullPercentage > 25) {
        columnsWithHighNulls.push({ column: colName, nullPercentage });
      }

      // Sample values
      let sampleValues: any[] = [];
      try {
        const sampleQuery = `
          SELECT ${safeCol} as val 
          FROM "${tableName}" 
          WHERE ${safeCol} IS NOT NULL 
          LIMIT 5
        `;
        const sampleRes = await db.query<{ val: any }>(sampleQuery);
        sampleValues = sampleRes.map((r) => r.val);
      } catch (e) {
        // ignore
      }

      const isNumeric = ['number', 'currency', 'percentage'].includes(semanticType) ||
        ['INT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'BIGINT', 'TINYINT', 'SMALLINT', 'HUGEINT'].some(t => sqlType.toUpperCase().includes(t));

      const isDate = semanticType === 'date' || sqlType.toUpperCase().includes('DATE') || sqlType.toUpperCase().includes('TIME');
      const isCategorical = !isNumeric && !isDate;

      const profile: ColumnProfile = {
        name: colName,
        type: sqlType,
        semanticType,
        description: dictEntry?.description || col.description,
        nullCount,
        nullPercentage,
        distinctCount,
        sampleValues,
        isNumeric,
        isCategorical,
        isDate,
      };

      // Numeric deep profiling (Min, Max, Avg, Mediana, Q1, Q3, Outliers via IQR)
      if (isNumeric && rowCount > 0) {
        try {
          const numStatsQuery = `
            SELECT 
              MIN(${safeCol}) as min_val,
              MAX(${safeCol}) as max_val,
              AVG(${safeCol}) as avg_val,
              MEDIAN(${safeCol}) as median_val,
              STDDEV_SAMP(${safeCol}) as std_val,
              QUANTILE_CONT(${safeCol}, 0.25) as q1_val,
              QUANTILE_CONT(${safeCol}, 0.75) as q3_val,
              SUM(${safeCol}) as sum_val
            FROM "${tableName}"
            WHERE ${safeCol} IS NOT NULL
          `;
          const numStats = await db.query<any>(numStatsQuery);
          const r = numStats[0];

          if (r) {
            profile.min = r.min_val !== null ? Number(Number(r.min_val).toFixed(2)) : undefined;
            profile.max = r.max_val !== null ? Number(Number(r.max_val).toFixed(2)) : undefined;
            profile.mean = r.avg_val !== null ? Number(Number(r.avg_val).toFixed(2)) : undefined;
            profile.median = r.median_val !== null ? Number(Number(r.median_val).toFixed(2)) : undefined;
            profile.stdDev = r.std_val !== null ? Number(Number(r.std_val).toFixed(2)) : undefined;
            profile.q1 = r.q1_val !== null ? Number(Number(r.q1_val).toFixed(2)) : undefined;
            profile.q3 = r.q3_val !== null ? Number(Number(r.q3_val).toFixed(2)) : undefined;
            profile.sum = r.sum_val !== null ? Number(Number(r.sum_val).toFixed(2)) : undefined;

            if (profile.q1 !== undefined && profile.q3 !== undefined) {
              const iqr = profile.q3 - profile.q1;
              profile.iqr = Number(iqr.toFixed(2));
              const lowBound = profile.q1 - 1.5 * iqr;
              const highBound = profile.q3 + 1.5 * iqr;
              profile.outlierThresholdLow = Number(lowBound.toFixed(2));
              profile.outlierThresholdHigh = Number(highBound.toFixed(2));

              // Count outliers
              const outlierQuery = `
                SELECT COUNT(*) as outlier_cnt
                FROM "${tableName}"
                WHERE ${safeCol} < ${lowBound} OR ${safeCol} > ${highBound}
              `;
              const outlierRes = await db.query<{ outlier_cnt: number }>(outlierQuery);
              const outlierCount = outlierRes[0]?.outlier_cnt || 0;
              profile.outlierCount = outlierCount;
              profile.outlierPercentage = rowCount > 0 ? Number(((outlierCount / rowCount) * 100).toFixed(2)) : 0;

              if (outlierCount > 0) {
                columnsWithOutliers.push({
                  column: colName,
                  outlierCount,
                  outlierPercentage: profile.outlierPercentage,
                });
              }
            }
          }
        } catch (e) {
          console.warn(`Error running numeric profiling on ${colName}:`, e);
        }
      }

      // Categorical Top 10 frequency
      if (isCategorical || (distinctCount > 0 && distinctCount <= 50)) {
        try {
          const catQuery = `
            SELECT 
              CAST(${safeCol} AS VARCHAR) as cat_val,
              COUNT(*) as cat_cnt
            FROM "${tableName}"
            WHERE ${safeCol} IS NOT NULL
            GROUP BY 1
            ORDER BY 2 DESC
            LIMIT 10
          `;
          const catRes = await db.query<{ cat_val: string; cat_cnt: number }>(catQuery);
          profile.topCategories = catRes.map((c) => ({
            value: c.cat_val || '(vazio)',
            count: c.cat_cnt,
            percentage: rowCount > 0 ? Number(((c.cat_cnt / rowCount) * 100).toFixed(2)) : 0,
          }));
        } catch (e) {
          // ignore
        }
      }

      // Date ranges
      if (isDate) {
        try {
          const dateStatsQuery = `
            SELECT 
              MIN(CAST(${safeCol} AS VARCHAR)) as min_d,
              MAX(CAST(${safeCol} AS VARCHAR)) as max_d
            FROM "${tableName}"
            WHERE ${safeCol} IS NOT NULL
          `;
          const dateRes = await db.query<{ min_d: string; max_d: string }>(dateStatsQuery);
          profile.minDate = dateRes[0]?.min_d;
          profile.maxDate = dateRes[0]?.max_d;
        } catch (e) {
          // ignore
        }
      }

      columnProfiles.push(profile);
    }

    // Duplicate rows estimate (checking non-null rows count vs distinct rows)
    let duplicateRowsEstimate = 0;
    try {
      const dupQuery = `
        SELECT (COUNT(*) - COUNT(DISTINCT *)) as dups FROM "${tableName}"
      `;
      const dupRes = await db.query<{ dups: number }>(dupQuery);
      duplicateRowsEstimate = Math.max(0, dupRes[0]?.dups || 0);
    } catch (e) {
      // ignore
    }

    // Calculate Data Quality Score (0-100)
    const totalCells = rowCount * dataset.columns.length;
    const nullRate = totalCells > 0 ? Number(((totalNullCount / totalCells) * 100).toFixed(2)) : 0;
    let qualityScore = 100;
    qualityScore -= Math.min(40, nullRate * 0.8);
    if (duplicateRowsEstimate > 0) {
      qualityScore -= Math.min(20, (duplicateRowsEstimate / Math.max(1, rowCount)) * 50);
    }
    if (columnsWithOutliers.length > 0) {
      qualityScore -= Math.min(15, columnsWithOutliers.length * 3);
    }
    const overallScore = Math.max(10, Math.round(qualityScore));

    const recommendations: string[] = [];
    if (columnsWithHighNulls.length > 0) {
      recommendations.push(
        `Campos com alta taxa de nulos detectados: ${columnsWithHighNulls.map((c) => `${c.column} (${c.nullPercentage}%)`).join(', ')}. Considere tratamento ou preenchimento de dados.`
      );
    }
    if (columnsWithOutliers.length > 0) {
      recommendations.push(
        `Foram identificados possíveis outliers nos campos: ${columnsWithOutliers.map((c) => `${c.column} (${c.outlierCount} registros)`).join(', ')} utilizando o critério estatístico IQR 1.5x.`
      );
    }
    if (duplicateRowsEstimate > 0) {
      recommendations.push(`Foram encontradas aproximadamente ${duplicateRowsEstimate} linhas potencialmente duplicadas.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('A qualidade geral do dataset é excelente, com baixa taxa de valores ausentes e boa consistência.');
    }

    const quality: DataQualityReport = {
      overallScore,
      totalCells,
      totalNulls: totalNullCount,
      nullRate,
      duplicateRowsEstimate,
      columnsWithHighNulls,
      columnsWithOutliers,
      typeIssues,
      recommendations,
    };

    // Temporal distributions for any date column
    const temporalDistributions: TemporalDistribution[] = [];
    const dateCol = columnProfiles.find((c) => c.isDate);
    const metricCol = columnProfiles.find((c) => c.semanticType === 'currency' || c.semanticType === 'number');

    if (dateCol) {
      const safeDate = `"${dateCol.name.replace(/"/g, '""')}"`;
      try {
        let tempQuery = '';
        if (metricCol) {
          const safeMetric = `"${metricCol.name.replace(/"/g, '""')}"`;
          tempQuery = `
            SELECT 
              SUBSTRING(CAST(${safeDate} AS VARCHAR), 1, 7) as period,
              COUNT(*) as count,
              ROUND(SUM(CAST(${safeMetric} AS DOUBLE)), 2) as sum,
              ROUND(AVG(CAST(${safeMetric} AS DOUBLE)), 2) as avg
            FROM "${tableName}"
            WHERE ${safeDate} IS NOT NULL
            GROUP BY 1
            ORDER BY 1 ASC
            LIMIT 36
          `;
        } else {
          tempQuery = `
            SELECT 
              SUBSTRING(CAST(${safeDate} AS VARCHAR), 1, 7) as period,
              COUNT(*) as count
            FROM "${tableName}"
            WHERE ${safeDate} IS NOT NULL
            GROUP BY 1
            ORDER BY 1 ASC
            LIMIT 36
          `;
        }
        const tempRes = await db.query<any>(tempQuery);
        if (tempRes && tempRes.length > 0) {
          temporalDistributions.push({
            dateColumn: dateCol.name,
            metricColumn: metricCol?.name,
            data: tempRes.map((r) => ({
              period: r.period || 'N/A',
              count: Number(r.count || 0),
              sum: r.sum !== undefined ? Number(r.sum) : undefined,
              avg: r.avg !== undefined ? Number(r.avg) : undefined,
            })),
          });
        }
      } catch (e) {
        console.warn('Error computing temporal distribution:', e);
      }
    }

    // Preview rows (first 15 rows)
    let previewRows: Record<string, any>[] = [];
    try {
      previewRows = await db.query<Record<string, any>>(`SELECT * FROM "${tableName}" LIMIT 15`);
    } catch (e) {
      console.warn('Error fetching preview rows:', e);
    }

    return {
      datasetId: dataset.id,
      datasetName: tableName,
      displayName: dataset.displayName,
      rowCount,
      columnCount: dataset.columns.length,
      columns: columnProfiles,
      quality,
      temporalDistributions,
      previewRows,
      generatedAt: new Date().toISOString(),
    };
  }
}
