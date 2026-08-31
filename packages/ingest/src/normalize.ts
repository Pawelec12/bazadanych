import type { CategoryRule, ColumnMapping, ManufacturerConfig } from "./config";
import { computeContentHash } from "./hash";
import { applyTransforms } from "./transforms";
import type { RawRow } from "./types";

export interface NormalizedProduct {
  catalogNumber: string;
  mpn: string | null;
  gtin: string | null;
  name: string;
  description: string | null;
  categorySlug: string | null;
  attributes: Record<string, unknown>;
  contentHash: string;
  sourceRow: number;
  rawFields: Record<string, unknown>;
}

export interface NormalizationResult {
  product: NormalizedProduct | null;
  errors: string[];
}

function resolveColumnMapping(mapping: ColumnMapping | string): ColumnMapping {
  if (typeof mapping === "string") {
    return { source: mapping };
  }
  return mapping;
}

function mapField(
  rawFields: Record<string, unknown>,
  mapping: ColumnMapping | string
): unknown {
  const resolved = resolveColumnMapping(mapping);
  const rawValue = rawFields[resolved.source];
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }
  if (resolved.transform?.length) {
    return applyTransforms(rawValue, resolved.transform);
  }
  return rawValue;
}

function resolveCategory(
  rawFields: Record<string, unknown>,
  rules: CategoryRule[] = []
): string | null {
  for (const rule of rules) {
    const value = String(rawFields[rule.match.column] ?? "");
    if (rule.match.equals && value === rule.match.equals) {
      return rule.category;
    }
    if (rule.match.contains && value.toLowerCase().includes(rule.match.contains.toLowerCase())) {
      return rule.category;
    }
  }
  return null;
}

export function normalizeRow(
  row: RawRow,
  config: ManufacturerConfig
): NormalizationResult {
  const errors: string[] = [];
  const raw = row.rawFields;

  const catalogNumber = String(
    mapField(raw, config.columns.catalog_number ?? { source: "catalog_number" }) ?? ""
  ).trim();
  const name = String(
    mapField(raw, config.columns.name ?? { source: "name" }) ?? ""
  ).trim();

  if (!catalogNumber) errors.push("Missing catalog_number");
  if (!name) errors.push("Missing name");

  for (const field of config.requiredFields ?? []) {
    const value = mapField(raw, config.columns[field] ?? { source: field });
    if (value === null || value === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { product: null, errors };
  }

  const mpn = mapField(raw, config.columns.mpn ?? { source: "mpn" });
  const gtin = mapField(raw, config.columns.gtin ?? { source: "gtin" });
  const description = mapField(raw, config.columns.description ?? { source: "description" });

  const attributes: Record<string, unknown> = { _raw: {} };
  const rawSnapshot: Record<string, unknown> = {};

  for (const [targetKey, mapping] of Object.entries(config.columns)) {
    if (["catalog_number", "mpn", "gtin", "name", "description"].includes(targetKey)) {
      continue;
    }
    const value = mapField(raw, mapping);
    if (value !== null && value !== "") {
      attributes[targetKey] = value;
      const sourceKey = resolveColumnMapping(mapping).source;
      rawSnapshot[sourceKey] = raw[sourceKey];
    }
  }

  attributes._raw = rawSnapshot;

  const categorySlug = resolveCategory(raw, config.categoryRules);

  const hashPayload = {
    catalogNumber,
    mpn,
    gtin,
    name,
    description,
    categorySlug,
    attributes: { ...attributes, _raw: undefined },
  };

  const product: NormalizedProduct = {
    catalogNumber,
    mpn: mpn ? String(mpn) : null,
    gtin: gtin ? String(gtin) : null,
    name,
    description: description ? String(description) : null,
    categorySlug,
    attributes,
    contentHash: computeContentHash(hashPayload),
    sourceRow: row.sourceRow,
    rawFields: raw,
  };

  return { product, errors: [] };
}

export function normalizeRows(
  rows: RawRow[],
  config: ManufacturerConfig
): { products: NormalizedProduct[]; rejected: Array<{ row: RawRow; errors: string[] }> } {
  const products: NormalizedProduct[] = [];
  const rejected: Array<{ row: RawRow; errors: string[] }> = [];

  for (const row of rows) {
    const result = normalizeRow(row, config);
    if (result.product) {
      products.push(result.product);
    } else {
      rejected.push({ row, errors: result.errors });
    }
  }

  return { products, rejected };
}
