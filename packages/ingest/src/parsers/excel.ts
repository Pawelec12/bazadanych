import * as XLSX from "xlsx";
import type { FileParser, ParseResult, ParserOptions } from "../types";

export const excelParser: FileParser = {
  parse(buffer: Buffer, options: ParserOptions = {}): ParseResult {
    const errors: string[] = [];

    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = options.sheetName ?? workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        return { rows: [], errors: [`Sheet not found: ${sheetName}`] };
      }

      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });

      const rows = records.map((rawFields, index) => ({
        sourceRow: index + 2,
        rawFields,
        parseErrors: [] as string[],
      }));

      return { rows, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Excel parse failed");
      return { rows: [], errors };
    }
  },
};
