import { eq } from "drizzle-orm";
import { importRuns } from "@pkb/db";
import { ingestFile, loadManufacturerConfigs } from "@pkb/ingest";
import { enqueueEmbedJobs } from "@pkb/jobs";
import { uploadCatalogFile } from "@/lib/blob";
import { getConfigDir } from "@/lib/config";
import { checkApiKey, getDb, unauthorized } from "@/lib/db";

export async function POST(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing file upload" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const db = getDb();
    const configs = loadManufacturerConfigs(getConfigDir());
    const fileUrl = await uploadCatalogFile(file.name, buffer);

    const result = await ingestFile(db, file.name, buffer, { configs });

    if (fileUrl) {
      await db
        .update(importRuns)
        .set({ fileUrl })
        .where(eq(importRuns.id, result.importRunId));
    }

    const embedJobs =
      result.changedProductIds.length > 0
        ? await enqueueEmbedJobs(db, result.changedProductIds)
        : 0;

    return Response.json({ ...result, fileUrl, embedJobsQueued: embedJobs });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const db = getDb();
    const runs = await db.query.importRuns.findMany({
      limit: 20,
      orderBy: (table, { desc }) => [desc(table.startedAt)],
      with: { manufacturer: true },
    });

    return Response.json({ runs });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list imports" },
      { status: 500 }
    );
  }
}
