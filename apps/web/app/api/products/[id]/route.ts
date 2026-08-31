import { eq } from "drizzle-orm";
import { importRuns, rawImportRows } from "@pkb/db";
import { checkApiKey, getDb, unauthorized } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!checkApiKey(_request)) return unauthorized();

  try {
    const { id } = await context.params;
    const db = getDb();

    const product = await db.query.products.findFirst({
      where: (table, { eq: equals }) => equals(table.id, id),
      with: {
        manufacturer: true,
        category: true,
        enrichedContent: true,
        embedding: true,
        sourceRelationships: {
          with: { targetProduct: true },
        },
        targetRelationships: {
          with: { sourceProduct: true },
        },
      },
    });

    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const latestImport = product.lastImportRunId
      ? await db.query.importRuns.findFirst({
          where: eq(importRuns.id, product.lastImportRunId),
        })
      : null;

    const rawRows = latestImport
      ? await db.query.rawImportRows.findMany({
          where: eq(rawImportRows.importRunId, latestImport.id),
          limit: 5,
        })
      : [];

    return Response.json({
      product,
      pipeline: {
        importRun: latestImport,
        rawRows,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load product" },
      { status: 500 }
    );
  }
}
