import { hybridSearch } from "@pkb/search";
import { checkApiKey, getDb, unauthorized } from "@/lib/db";

export async function POST(request: Request) {
  if (!checkApiKey(request)) return unauthorized();

  try {
    const body = await request.json();
    const db = getDb();
    const response = await hybridSearch(db, {
      query: body.query ?? "",
      filters: body.filters,
      limit: body.limit ?? 20,
      explain: body.explain ?? true,
      channels: body.channels,
    });

    return Response.json(response);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
