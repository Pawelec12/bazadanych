import { csvParser } from "./csv";
import { excelParser } from "./excel";
import { xmlParser } from "./xml";
import type { FileParser } from "../types";

export function getParserForFileName(fileName: string): FileParser {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return csvParser;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return excelParser;
  if (lower.endsWith(".xml")) return xmlParser;
  throw new Error(`Unsupported file type: ${fileName}`);
}

export { csvParser, excelParser, xmlParser };
