import AdmZip from 'adm-zip';
import { DataDictionaryEntry } from '../../src/types';

export interface ExtractedZipData {
  csvFiles: {
    filename: string;
    buffer: Buffer;
    size: number;
  }[];
  dictionaryFile?: {
    filename: string;
    buffer: Buffer;
  };
  dictionary: Record<string, DataDictionaryEntry>;
}

export class ZipProcessor {
  /**
   * Processes a ZIP buffer, extracting CSVs and identifying the data dictionary.
   */
  public static processZip(zipBuffer: Buffer): ExtractedZipData {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    const csvFiles: { filename: string; buffer: Buffer; size: number }[] = [];
    let potentialDictEntry: AdmZip.IZipEntry | null = null;
    let potentialDictFilename = '';

    const dictionaryKeywords = [
      'dicionario',
      'dicionário',
      'dictionary',
      'data_dictionary',
      'datadictionary',
      'dicionario_dados',
      'metadata',
      'metadados',
      'readme',
    ];

    // Find all CSVs and candidate dictionary files
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      const baseName = entry.name.toLowerCase();

      // Skip macOS metadata and hidden files
      if (
        entryName.startsWith('__MACOSX') ||
        entryName.includes('/.') ||
        baseName.startsWith('.')
      ) {
        continue;
      }

      const isCsv = baseName.endsWith('.csv') || baseName.endsWith('.tsv') || baseName.endsWith('.txt');

      if (isCsv) {
        // Check if this CSV is a dictionary
        const isDictByName = dictionaryKeywords.some((k) => baseName.includes(k));

        if (isDictByName) {
          potentialDictEntry = entry;
          potentialDictFilename = entry.name;
        } else {
          csvFiles.push({
            filename: entry.name,
            buffer: entry.getData(),
            size: entry.header.size,
          });
        }
      } else if (baseName.endsWith('.md') && dictionaryKeywords.some((k) => baseName.includes(k))) {
        potentialDictEntry = entry;
        potentialDictFilename = entry.name;
      }
    }

    // If no explicit dictionary found, check if any CSV file has structure of a dictionary (coluna, descricao, etc.)
    if (!potentialDictEntry && csvFiles.length > 1) {
      for (let i = 0; i < csvFiles.length; i++) {
        const file = csvFiles[i];
        const textSample = file.buffer.toString('utf-8', 0, 500).toLowerCase();
        if (
          (textSample.includes('coluna') || textSample.includes('campo') || textSample.includes('column')) &&
          (textSample.includes('descricao') || textSample.includes('descrição') || textSample.includes('description') || textSample.includes('significado'))
        ) {
          potentialDictEntry = {
            getData: () => file.buffer,
            name: file.filename,
          } as any;
          potentialDictFilename = file.filename;
          csvFiles.splice(i, 1);
          break;
        }
      }
    }

    let dictionary: Record<string, DataDictionaryEntry> = {};
    let dictionaryFile: { filename: string; buffer: Buffer } | undefined;

    if (potentialDictEntry) {
      const dictBuffer = potentialDictEntry.getData();
      dictionaryFile = {
        filename: potentialDictFilename,
        buffer: dictBuffer,
      };
      dictionary = this.parseDataDictionary(dictBuffer, potentialDictFilename);
    }

    return {
      csvFiles,
      dictionaryFile,
      dictionary,
    };
  }

  /**
   * Parses a data dictionary from CSV, text, or Markdown format.
   */
  public static parseDataDictionary(buffer: Buffer, filename: string): Record<string, DataDictionaryEntry> {
    const content = buffer.toString('utf-8');
    const dictionary: Record<string, DataDictionaryEntry> = {};

    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return dictionary;

    // Detect if markdown table or list or CSV
    if (filename.toLowerCase().endsWith('.csv') || filename.toLowerCase().endsWith('.tsv') || filename.toLowerCase().endsWith('.txt')) {
      // Determine separator: comma, semicolon, tab, or pipe
      const headerLine = lines[0];
      let sep = ',';
      if ((headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length) {
        sep = ';';
      } else if ((headerLine.match(/\t/g) || []).length > (headerLine.match(/,/g) || []).length) {
        sep = '\t';
      } else if (headerLine.includes('|')) {
        sep = '|';
      }

      // Check if header exists
      const headerCols = headerLine.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, '').toLowerCase());
      
      let colIdx = headerCols.findIndex((c) => /^(coluna|campo|column|variavel|name|field)$/i.test(c));
      let descIdx = headerCols.findIndex((c) => /^(descricao|descrição|description|significado|meaning|detalhe)$/i.test(c));
      let typeIdx = headerCols.findIndex((c) => /^(tipo|type|datatype)$/i.test(c));
      let unitIdx = headerCols.findIndex((c) => /^(unidade|unit|un)$/i.test(c));
      let rulesIdx = headerCols.findIndex((c) => /^(regras|regra|rules|business_rule|observacao|obs)$/i.test(c));

      // Fallback indices if headers weren't identified
      if (colIdx === -1) colIdx = 0;
      if (descIdx === -1) descIdx = 1 < headerCols.length ? 1 : 0;

      const startIndex = headerCols.some((h) => /coluna|campo|column|descricao|descrição|description/.test(h)) ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        // Split handling quotes
        const parts = line.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, ''));
        if (parts.length > 0 && parts[colIdx]) {
          const colName = parts[colIdx].trim();
          if (!colName || colName.toLowerCase() === 'coluna' || colName.toLowerCase() === 'campo') continue;
          
          const desc = descIdx !== -1 && parts[descIdx] ? parts[descIdx].trim() : '';
          const type = typeIdx !== -1 && parts[typeIdx] ? parts[typeIdx].trim() : undefined;
          const unit = unitIdx !== -1 && parts[unitIdx] ? parts[unitIdx].trim() : undefined;
          const rules = rulesIdx !== -1 && parts[rulesIdx] ? parts[rulesIdx].trim() : undefined;

          dictionary[colName.toUpperCase()] = {
            columnName: colName,
            description: desc || colName,
            type,
            unit,
            businessRules: rules,
          };
        }
      }
    } else {
      // Parse markdown key-values (e.g. - `COL_NAME`: Descrição or COL_NAME = Descrição)
      for (const line of lines) {
        const kvMatch = line.match(/^[-*]?\s*[`"']?([A-Za-z0-9_]+)[`"']?\s*[:=-]\s*(.+)$/);
        if (kvMatch) {
          const colName = kvMatch[1].trim();
          const desc = kvMatch[2].trim();
          dictionary[colName.toUpperCase()] = {
            columnName: colName,
            description: desc,
          };
        }
      }
    }

    return dictionary;
  }
}
