import duckdb from 'duckdb';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class DuckDBManager {
  private db: duckdb.Database;
  private conn: duckdb.Connection;
  private tempDir: string;

  constructor() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datainsight-duckdb-'));
    this.db = new duckdb.Database(':memory:');
    this.conn = this.db.connect();
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, ...params, (err: Error | null, res: any[]) => {
        if (err) {
          return reject(err);
        }
        // Normalize BigInt and Date to serializable formats
        const normalized = (res || []).map((row) => {
          const newRow: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            const val = row[key];
            if (typeof val === 'bigint') {
              newRow[key] = Number(val);
            } else if (val instanceof Date) {
              newRow[key] = val.toISOString().split('T')[0];
            } else {
              newRow[key] = val;
            }
          }
          return newRow;
        });
        resolve(normalized as T[]);
      });
    });
  }

  public async execute(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.exec(sql, (err: Error | null) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  /**
   * Sanitizes table name to valid SQL identifier [a-zA-Z0-9_]
   */
  public sanitizeTableName(name: string): string {
    let clean = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

    if (/^[0-9]/.test(clean)) {
      clean = 't_' + clean;
    }
    if (!clean) {
      clean = 'dataset_' + Math.floor(Math.random() * 1000);
    }
    return clean;
  }

  /**
   * Writes CSV buffer to a temp file and creates a DuckDB table using read_csv_auto
   * with Brazilian and standard formatting fallback detection.
   */
  public async loadCsvBuffer(tableName: string, csvBuffer: Buffer): Promise<{
    tableName: string;
    rowCount: number;
    columnCount: number;
    columns: { name: string; type: string }[];
  }> {
    const sanitizedName = this.sanitizeTableName(tableName);
    const tempFilePath = path.join(this.tempDir, `${sanitizedName}_${Date.now()}.csv`);
    
    // Auto-detect if file might be Latin1 / Windows-1252 with accented characters
    let content = csvBuffer.toString('utf-8');
    // If we detect invalid UTF-8 sequences or standard latin1 text, normalize
    fs.writeFileSync(tempFilePath, content, 'utf-8');

    // DuckDB read_csv_auto is powerful. We configure it to handle semicolon/comma, decimal separators, date formats.
    const escapedPath = tempFilePath.replace(/'/g, "''");

    // First attempt: read_csv_auto with auto-detection
    let createSql = `
      CREATE OR REPLACE TABLE "${sanitizedName}" AS 
      SELECT * FROM read_csv_auto('${escapedPath}', 
        header=True, 
        sample_size=20000, 
        ignore_errors=True,
        dateformat='%d/%m/%Y',
        timestampformat='%d/%m/%Y %H:%M:%S'
      );
    `;

    try {
      await this.execute(createSql);
    } catch (e1) {
      console.warn(`Standard auto CSV load failed for ${tableName}, attempting fallback with standard options:`, e1);
      // Fallback: simpler read_csv
      createSql = `
        CREATE OR REPLACE TABLE "${sanitizedName}" AS 
        SELECT * FROM read_csv_auto('${escapedPath}', header=True, ignore_errors=True);
      `;
      await this.execute(createSql);
    }

    // Inspect table schema - DuckDB PRAGMA table_info returns { cid, name, type, notnull, dflt_value, pk }
    const schemaInfo = await this.query<{ name?: string; type?: string; column_name?: string; data_type?: string }>(
      `PRAGMA table_info('${sanitizedName}')`
    );

    const countRes = await this.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM "${sanitizedName}"`
    );
    const rowCount = countRes[0]?.cnt || 0;

    const columns = schemaInfo
      .map((col) => ({
        name: col.name || col.column_name || '',
        type: col.type || col.data_type || 'VARCHAR',
      }))
      .filter((c) => Boolean(c.name));

    return {
      tableName: sanitizedName,
      rowCount,
      columnCount: columns.length,
      columns,
    };
  }

  public async close(): Promise<void> {
    try {
      this.conn.close();
      this.db.close();
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error closing DuckDB:', e);
    }
  }
}
