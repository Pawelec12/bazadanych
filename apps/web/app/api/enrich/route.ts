import { processBackgroundJobs } from "@pkb/jobs";
import { approveEnrichment, enrichPendingProducts, rejectEnrichment } from "@pkb/enrich";
import { checkApiKey, getDb, unauthorized } from "@/lib/db";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron && !checkApiKey(request)) return unauthorized();

  try {
    const db = getDb();
    const enrichResult = await enrichPendingProducts(db, 10);
    const jobResult = await processBackgroundJobs(db, 5);
    return Response.json({ ...enrichResult, jobs: jobResult });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const body = await request.json();
    const db = getDb();

    if (!body.productId || !body.action) {
      return Response.json({ error: "productId and action are required" }, { status: 400 });
    }

    if (body.action === "approve") {
      await approveEnrichment(db, body.productId, {
        applicationDescription: body.applicationDescription,
        searchSummary: body.searchSummary,
      });
    } else if (body.action === "reject") {
      await rejectEnrichment(db, body.productId);
    } else {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const db = getDb();
    const queue = await db.query.enrichedContent.findMany({
      where: (table, { inArray }) =>
        inArray(table.status, ["needs_review", "pending"]),
      limit: 50,
      with: { product: true },
      orderBy: (table, { asc }) => [asc(table.confidence)],
    });

    return Response.json({ queue });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load review queue" },
      { status: 500 }
    );
  }
}
