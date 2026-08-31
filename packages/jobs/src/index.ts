import { eq } from "drizzle-orm";
import type { Database } from "@pkb/db";
import { backgroundJobs } from "@pkb/db";
import { embedProductsByIds } from "@pkb/search";
import { enrichPendingProducts } from "@pkb/enrich";
import { chunk } from "@pkb/ingest";

const EMBED_BATCH_SIZE = 25;

export async function enqueueEmbedJobs(
  db: Database,
  productIds: string[]
): Promise<number> {
  if (productIds.length === 0) return 0;

  const batches = chunk(productIds, EMBED_BATCH_SIZE);
  await db.insert(backgroundJobs).values(
    batches.map((batch) => ({
      type: "embed" as const,
      payload: { productIds: batch },
    }))
  );

  return batches.length;
}

export async function processBackgroundJobs(
  db: Database,
  limit = 5
): Promise<{ processed: number; failed: number }> {
  const pending = await db.query.backgroundJobs.findMany({
    where: eq(backgroundJobs.status, "pending"),
    limit,
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  let processed = 0;
  let failed = 0;

  for (const job of pending) {
    await db
      .update(backgroundJobs)
      .set({ status: "running", attempts: job.attempts + 1, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, job.id));

    try {
      if (job.type === "embed") {
        const productIds = (job.payload.productIds as string[]) ?? [];
        await embedProductsByIds(db, productIds);
      } else if (job.type === "enrich") {
        const batchLimit = Number(job.payload.limit ?? 10);
        await enrichPendingProducts(db, batchLimit);
      }

      await db
        .update(backgroundJobs)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(backgroundJobs.id, job.id));
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed";
      const isFinalAttempt = job.attempts + 1 >= job.maxAttempts;

      await db
        .update(backgroundJobs)
        .set({
          status: isFinalAttempt ? "failed" : "pending",
          error: message,
          updatedAt: new Date(),
          completedAt: isFinalAttempt ? new Date() : null,
        })
        .where(eq(backgroundJobs.id, job.id));

      if (isFinalAttempt) failed += 1;
    }
  }

  return { processed, failed };
}

export async function enqueueEnrichJob(db: Database, limit = 25): Promise<void> {
  await db.insert(backgroundJobs).values({
    type: "enrich",
    payload: { limit },
  });
}
