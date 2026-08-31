import { eq } from "drizzle-orm";
import type { Database } from "@pkb/db";
import {
  discrepancies,
  manufacturers,
  products,
  refreshRuns,
} from "@pkb/db";
import {
  ingestFile,
  loadManufacturerConfigs,
  matchConfigForFile,
  normalizeRows,
  getParserForFileName,
  computeFileHash,
} from "@pkb/ingest";

export interface RefreshOptions {
  configDir: string;
  manufacturerSlug?: string;
}

export interface RefreshResult {
  refreshRunId: string;
  importRunId: string;
  added: number;
  updated: number;
  removed: number;
  conflicts: number;
  skipped: boolean;
  deactivatedCount: number;
}

export interface PolledFile {
  fileName: string;
  buffer: Buffer;
}

export async function runRefreshForFile(
  db: Database,
  file: PolledFile,
  options: RefreshOptions
): Promise<RefreshResult> {
  const configs = loadManufacturerConfigs(options.configDir);
  const config = matchConfigForFile(configs, file.fileName);

  if (!config) {
    throw new Error(`No config matched file: ${file.fileName}`);
  }

  if (options.manufacturerSlug && config.manufacturer !== options.manufacturerSlug) {
    throw new Error(`Manufacturer mismatch for file: ${file.fileName}`);
  }

  const manufacturer = await db.query.manufacturers.findFirst({
    where: eq(manufacturers.slug, config.manufacturer),
  });

  if (!manufacturer) {
    const ingestResult = await ingestFile(db, file.fileName, file.buffer, {
      configs,
      deactivateMissing: true,
    });

    const mfg = await db.query.manufacturers.findFirst({
      where: eq(manufacturers.slug, config.manufacturer),
    });

    const [refreshRun] = await db
      .insert(refreshRuns)
      .values({
        manufacturerId: mfg!.id,
        importRunId: ingestResult.importRunId,
        status: "completed",
        filesProcessed: 1,
        addedCount: ingestResult.processedCount,
        removedCount: ingestResult.deactivatedCount,
        completedAt: new Date(),
      })
      .returning();

    return {
      refreshRunId: refreshRun.id,
      importRunId: ingestResult.importRunId,
      added: ingestResult.processedCount,
      updated: 0,
      removed: ingestResult.deactivatedCount,
      conflicts: ingestResult.rejectedCount,
      skipped: ingestResult.skipped,
      deactivatedCount: ingestResult.deactivatedCount,
    };
  }

  const fileHash = computeFileHash(file.buffer);

  const [refreshRun] = await db
    .insert(refreshRuns)
    .values({
      manufacturerId: manufacturer.id,
      status: "running",
      filesProcessed: 1,
    })
    .returning();

  const parser = getParserForFileName(file.fileName);
  const parsed = parser.parse(file.buffer, {
    delimiter: config.delimiter,
    encoding: config.encoding,
    sheetName: config.sheetName,
    rootElement: config.rootElement,
  });

  const { products: incomingProducts, rejected } = normalizeRows(parsed.rows, config);

  const existingProducts = await db.query.products.findMany({
    where: eq(products.manufacturerId, manufacturer.id),
  });

  const existingByCatalog = new Map(existingProducts.map((p) => [p.catalogNumber, p]));
  const incomingByCatalog = new Map(incomingProducts.map((p) => [p.catalogNumber, p]));

  let added = 0;
  let updated = 0;
  let removed = 0;
  let conflicts = rejected.length;

  for (const incoming of incomingProducts) {
    const existing = existingByCatalog.get(incoming.catalogNumber);
    if (!existing) {
      added += 1;
      await recordDiscrepancy(db, refreshRun.id, {
        type: "added",
        severity: "info",
        catalogNumber: incoming.catalogNumber,
        message: `New product added: ${incoming.catalogNumber}`,
        details: { name: incoming.name },
      });
      continue;
    }

    if (existing.contentHash !== incoming.contentHash) {
      updated += 1;
      await recordDiscrepancy(db, refreshRun.id, {
        type: "updated",
        severity: "warning",
        catalogNumber: incoming.catalogNumber,
        productId: existing.id,
        message: `Product updated: ${incoming.catalogNumber}`,
        details: {
          previousHash: existing.contentHash,
          newHash: incoming.contentHash,
        },
      });
    }
  }

  for (const existing of existingProducts) {
    if (!incomingByCatalog.has(existing.catalogNumber) && existing.status === "active") {
      removed += 1;
      await recordDiscrepancy(db, refreshRun.id, {
        type: "removed",
        severity: "error",
        catalogNumber: existing.catalogNumber,
        productId: existing.id,
        message: `Product removed from source: ${existing.catalogNumber}`,
        details: { name: existing.name },
      });
    }
  }

  for (const item of rejected) {
    await recordDiscrepancy(db, refreshRun.id, {
      type: "conflict",
      severity: "error",
      catalogNumber: String(item.row.rawFields.ArtNr ?? item.row.sourceRow),
      message: `Rejected row ${item.row.sourceRow}: ${item.errors.join(", ")}`,
      details: { errors: item.errors },
    });
  }

  const ingestResult = await ingestFile(db, file.fileName, file.buffer, {
    configs,
    force: added > 0 || updated > 0 || removed > 0 || conflicts > 0,
    deactivateMissing: true,
  });

  await db
    .update(refreshRuns)
    .set({
      importRunId: ingestResult.importRunId,
      status: "completed",
      addedCount: added,
      updatedCount: updated,
      removedCount: removed,
      conflictCount: conflicts,
      summary: {
        fileName: file.fileName,
        fileHash,
        rejectedRows: rejected.length,
        deactivatedCount: ingestResult.deactivatedCount,
      },
      completedAt: new Date(),
    })
    .where(eq(refreshRuns.id, refreshRun.id));

  return {
    refreshRunId: refreshRun.id,
    importRunId: ingestResult.importRunId,
    added,
    updated,
    removed,
    conflicts,
    skipped: ingestResult.skipped,
    deactivatedCount: ingestResult.deactivatedCount,
  };
}

async function recordDiscrepancy(
  db: Database,
  refreshRunId: string,
  input: {
    type: "added" | "updated" | "removed" | "conflict";
    severity: "info" | "warning" | "error";
    catalogNumber?: string;
    productId?: string;
    message: string;
    details?: Record<string, unknown>;
  }
) {
  await db.insert(discrepancies).values({
    refreshRunId,
    productId: input.productId,
    catalogNumber: input.catalogNumber,
    type: input.type,
    severity: input.severity,
    message: input.message,
    details: input.details ?? {},
  });
}

export async function runScheduledRefresh(
  db: Database,
  options: RefreshOptions,
  files: PolledFile[] = []
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const file of files) {
    results.push(await runRefreshForFile(db, file, options));
  }
  return results;
}

export async function getRefreshRunSummary(db: Database, refreshRunId: string) {
  return db.query.refreshRuns.findFirst({
    where: eq(refreshRuns.id, refreshRunId),
    with: { discrepancies: true, manufacturer: true },
  });
}

export async function listRefreshRuns(db: Database, limit = 20) {
  return db.query.refreshRuns.findMany({
    limit,
    orderBy: (table, { desc }) => [desc(table.startedAt)],
    with: { manufacturer: true },
  });
}
