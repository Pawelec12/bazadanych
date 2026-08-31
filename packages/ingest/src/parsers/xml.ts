import { XMLParser } from "fast-xml-parser";
import type { FileParser, ParseResult, ParserOptions } from "../types";

function flattenProduct(node: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenProduct(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

export const xmlParser: FileParser = {
  parse(buffer: Buffer, options: ParserOptions = {}): ParseResult {
    const errors: string[] = [];
    const rootElement = options.rootElement ?? "product";

    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        trimValues: true,
      });

      const parsed = parser.parse(buffer.toString("utf8")) as Record<string, unknown>;
      const container = parsed[rootElement] ?? parsed.products ?? parsed.catalog ?? parsed;
      const items = Array.isArray(container) ? container : container ? [container] : [];

      const rows = items.map((item, index) => ({
        sourceRow: index + 1,
        rawFields: flattenProduct(item as Record<string, unknown>),
        parseErrors: [] as string[],
      }));

      return { rows, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "XML parse failed");
      return { rows: [], errors };
    }
  },
};
