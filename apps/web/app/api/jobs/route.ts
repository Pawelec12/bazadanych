import { processBackgroundJobs, enqueueEnrichJob } from "@pkb/jobs";
import { checkApiKey, getDb, unauthorized } from "@/lib/db";

function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request) && !checkApiKey(request)) return unauthorized();

  try {
    const db = getDb();
    const result = await processBackgroundJobs(db, 10);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Job processing failed" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const body = await request.json();
    const db = getDb();

    if (body.type === "enrich") {
      await enqueueEnrichJob(db, body.limit ?? 25);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported job type" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Enqueue failed" },
      { status: 500 }
    );
  }
}
