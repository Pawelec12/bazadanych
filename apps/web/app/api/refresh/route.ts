import { eq } from "drizzle-orm";
import { discrepancies } from "@pkb/db";
import { listRefreshRuns, runRefreshForFile, runScheduledRefresh } from "@pkb/refresh";
import { pollSftpFiles } from "@/lib/sftp";
import { checkApiKey, getDb, unauthorized } from "@/lib/db";
import { getConfigDir } from "@/lib/config";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron && !checkApiKey(request)) return unauthorized();

  try {
    const db = getDb();
    const configDir = getConfigDir();

    if (isCron) {
      const files = await pollSftpFiles();
      const results = await runScheduledRefresh(db, { configDir }, files);
      return Response.json({ results });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await runRefreshForFile(
        db,
        { fileName: file.name, buffer },
        { configDir }
      );
      return Response.json(result);
    }

    const files = await pollSftpFiles();
    const results = await runScheduledRefresh(db, { configDir }, files);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const db = getDb();
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");

    if (runId) {
      const items = await db.query.discrepancies.findMany({
        where: eq(discrepancies.refreshRunId, runId),
        limit: 100,
        with: { product: true },
      });
      return Response.json({ discrepancies: items });
    }

    const runs = await listRefreshRuns(db, 20);
    return Response.json({ runs });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load refresh runs" },
      { status: 500 }
    );
  }
}
