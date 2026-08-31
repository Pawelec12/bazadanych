import { eq, and, inArray, sql } from "drizzle-orm";
import type { Database } from "@pkb/db";
import {
  categories,
  importRuns,
  manufacturers,
  products,
  rawImportRows,
} from "@pkb/db";
import {
  loadManufacturerConfig,
  matchConfigForFile,
  type ManufacturerConfig,
} from "./config";
import { computeFileHash } from "./hash";
import { normalizeRows, type NormalizedProduct } from "./normalize";
import { getParserForFileName } from "./parsers/index";
import { chunk } from "./batch";

export interface IngestOptions {
  manufacturerSlug?: string;
  configPath?: string;
  configs?: ManufacturerConfig[];
  force?: boolean;
  deactivateMissing?: boolean;
}

export interface IngestResult {
  importRunId: string;
  fileHash: string;
  rowCount: number;
  processedCount: number;
  rejectedCount: number;
  skipped: boolean;
  errors: string[];
  changedProductIds: string[];
  incomingCatalogNumbers: string[];
  deactivatedCount: number;
}

async function ensureManufacturer(
  db: Database,
  config: ManufacturerConfig,
  configPath: string
) {
  const existing = await db.query.manufacturers.findFirst({
    where: eq(manufacturers.slug, config.manufacturer),
  });

  if (existing) return existing;

  const [created] = await db
    .insert(manufacturers)
    .values({
      slug: config.manufacturer,
      name: config.displayName ?? config.manufacturer,
      configPath,
    })
    .returning();

  return created;
}

async function ensureCategory(db: Database, slug: string) {
  const normalizedSlug = slug.replace(/\//g, "-");
  const existing = await db.query.categories.findFirst({
    where: eq(categories.slug, normalizedSlug),
  });
  if (existing) return existing;

  const parts = slug.split("/");
  const name = parts[parts.length - 1];
  const [created] = await db
    .insert(categories)
    .values({
      slug: normalizedSlug,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      path: slug,
    })
    .returning();

  return created;
}

async function resolveCategoryIds(
  db: Database,
  normalized: NormalizedProduct[]
): Promise<Map<string, string>> {
  const slugs = [...new Set(normalized.map((p) => p.categorySlug).filter(Boolean))] as string[];
  const map = new Map<string, string>();

  for (const slug of slugs) {
    const category = await ensureCategory(db, slug);
    map.set(slug, category.id);
  }

  return map;
}

async function batchUpsertProducts(
  db: Database,
  manufacturerId: string,
  importRunId: string,
  items: Array<NormalizedProduct & { categoryId: string | null }>,
  existingHashes: Map<string, string>
): Promise<{ changedProductIds: string[]; upsertedCount: number }> {
  const changedProductIds: string[] = [];
  const toUpsert = items.filter((item) => {
    const prev = existingHashes.get(item.catalogNumber);
    return prev === undefined || prev !== item.contentHash;
  });

  if (toUpsert.length === 0) {
    return { changedProductIds, upsertedCount: 0 };
  }

  for (const batch of chunk(toUpsert)) {
    const upserted = await db
      .insert(products)
      .values(
        batch.map((item) => ({
          manufacturerId,
          categoryId: item.categoryId,
          catalogNumber: item.catalogNumber,
          mpn: item.mpn,
          gtin: item.gtin,
          name: item.name,
          description: item.description,
          attributes: item.attributes,
          contentHash: item.contentHash,
          lastImportRunId: importRunId,
          status: "active" as const,
        }))
      )
      .onConflictDoUpdate({
        target: [products.manufacturerId, products.catalogNumber],
        set: {
          categoryId: sql`excluded.category_id`,
          mpn: sql`excluded.mpn`,
          gtin: sql`excluded.gtin`,
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          attributes: sql`excluded.attributes`,
          contentHash: sql`excluded.content_hash`,
          lastImportRunId: sql`excluded.last_import_run_id`,
          status: sql`'active'::product_status`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id, catalogNumber: products.catalogNumber });

    for (const row of upserted) {
      changedProductIds.push(row.id);
    }
  }

  return { changedProductIds, upsertedCount: toUpsert.length };
}

async function deactivateMissingProducts(
  db: Database,
  manufacturerId: string,
  incomingCatalogNumbers: Set<string>
): Promise<number> {
  const existing = await db.query.products.findMany({
    where: and(
      eq(products.manufacturerId, manufacturerId),
      eq(products.status, "active")
    ),
    columns: { id: true, catalogNumber: true },
  });

  const toDeactivate = existing.filter((p) => !incomingCatalogNumbers.has(p.catalogNumber));
  if (toDeactivate.length === 0) return 0;

  for (const batch of chunk(toDeactivate)) {
    await db
      .update(products)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(inArray(products.id, batch.map((p) => p.id)));
  }

  return toDeactivate.length;
}

export async function ingestFile(
  db: Database,
  fileName: string,
  buffer: Buffer,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const fileHash = computeFileHash(buffer);
  const configs = options.configs ?? [];
  const config =
    options.configPath
      ? loadManufacturerConfig(options.configPath)
      : matchConfigForFile(configs, fileName);

  if (!config) {
    throw new Error(`No manufacturer config matched file: ${fileName}`);
  }

  const configPath = options.configPath ?? config.manufacturer;
  const manufacturer = await ensureManufacturer(db, config, configPath);

  if (!options.force) {
    const existingRun = await db.query.importRuns.findFirst({
      where: and(
        eq(importRuns.manufacturerId, manufacturer.id),
        eq(importRuns.fileHash, fileHash)
      ),
    });

    if (existingRun?.status === "completed") {
      return {
        importRunId: existingRun.id,
        fileHash,
        rowCount: existingRun.rowCount,
        processedCount: existingRun.processedCount,
        rejectedCount: existingRun.rejectedCount,
        skipped: true,
        errors: [],
        changedProductIds: [],
        incomingCatalogNumbers: [],
        deactivatedCount: 0,
      };
    }
  }

  const [importRun] = await db
    .insert(importRuns)
    .values({
      manufacturerId: manufacturer.id,
      fileName,
      fileHash,
      status: "processing",
    })
    .returning();

  try {
    const parser = getParserForFileName(fileName);
    const parseResult = parser.parse(buffer, {
      delimiter: config.delimiter,
      encoding: config.encoding,
      sheetName: config.sheetName,
      rootElement: config.rootElement,
    });

    const errors = [...parseResult.errors];
    const { products: normalized, rejected } = normalizeRows(parseResult.rows, config);
    const rejectedSourceRows = new Set(rejected.map((r) => r.row.sourceRow));

    const stagingRows = parseResult.rows.map((row) => ({
      importRunId: importRun.id,
      sourceRow: row.sourceRow,
      rawFields: row.rawFields,
      parseErrors: rejected.find((r) => r.row.sourceRow === row.sourceRow)?.errors ?? row.parseErrors,
      status: (rejectedSourceRows.has(row.sourceRow) ? "rejected" : "staged") as "rejected" | "staged",
    }));

    for (const batch of chunk(stagingRows)) {
      await db.insert(rawImportRows).values(batch);
    }

    const categoryMap = await resolveCategoryIds(db, normalized);
    const existingProducts = await db.query.products.findMany({
      where: eq(products.manufacturerId, manufacturer.id),
      columns: { catalogNumber: true, contentHash: true },
    });
    const existingHashes = new Map(
      existingProducts.map((p) => [p.catalogNumber, p.contentHash])
    );

    const withCategories = normalized.map((item) => ({
      ...item,
      categoryId: item.categorySlug ? categoryMap.get(item.categorySlug) ?? null : null,
    }));

    const { changedProductIds } = await batchUpsertProducts(
      db,
      manufacturer.id,
      importRun.id,
      withCategories,
      existingHashes
    );

    const incomingCatalogNumbers = normalized.map((p) => p.catalogNumber);
    let deactivatedCount = 0;

    if (options.deactivateMissing) {
      deactivatedCount = await deactivateMissingProducts(
        db,
        manufacturer.id,
        new Set(incomingCatalogNumbers)
      );
    }

    await db
      .update(importRuns)
      .set({
        status: errors.length > 0 && normalized.length === 0 ? "failed" : "completed",
        rowCount: parseResult.rows.length,
        processedCount: normalized.length,
        rejectedCount: rejected.length,
        errors,
        completedAt: new Date(),
      })
      .where(eq(importRuns.id, importRun.id));

    return {
      importRunId: importRun.id,
      fileHash,
      rowCount: parseResult.rows.length,
      processedCount: normalized.length,
      rejectedCount: rejected.length,
      skipped: false,
      errors,
      changedProductIds,
      incomingCatalogNumbers,
      deactivatedCount,
    };
  } catch (error) {
    await db
      .update(importRuns)
      .set({
        status: "failed",
        errors: [error instanceof Error ? error.message : "Ingest failed"],
        completedAt: new Date(),
      })
      .where(eq(importRuns.id, importRun.id));
    throw error;
  }
}
