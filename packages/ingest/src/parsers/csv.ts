import { parse } from "csv-parse/sync";
import type { FileParser, ParseResult, ParserOptions } from "../types";

export const csvParser: FileParser = {
  parse(buffer: Buffer, options: ParserOptions = {}): ParseResult {
    const delimiter = options.delimiter ?? ",";
    const content = buffer.toString(options.encoding === "windows-1250" ? "latin1" : "utf8");
    const errors: string[] = [];

    try {
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter,
        relax_column_count: true,
        trim: true,
      }) as Record<string, unknown>[];

      const rows = records.map((rawFields, index) => ({
        sourceRow: index + 2,
        rawFields,
        parseErrors: [] as string[],
      }));

      return { rows, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "CSV parse failed");
      return { rows: [], errors };
    }
  },
};
