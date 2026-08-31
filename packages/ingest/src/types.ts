export interface RawRow {
  sourceRow: number;
  rawFields: Record<string, unknown>;
  parseErrors: string[];
}

export interface ParseResult {
  rows: RawRow[];
  errors: string[];
}

export interface ParserOptions {
  delimiter?: string;
  encoding?: string;
  sheetName?: string;
  rootElement?: string;
}

export interface FileParser {
  parse(buffer: Buffer, options?: ParserOptions): ParseResult;
}
