import { createDb } from "@pkb/db";

let db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!db) {
    db = createDb();
  }
  return db;
}

export function checkApiKey(request: Request): boolean {
  const apiKey = process.env.API_KEY;

  if (process.env.NODE_ENV === "production" && !apiKey) {
    console.error("API_KEY must be set in production");
    return false;
  }

  if (!apiKey) return true;

  const headerKey = request.headers.get("x-api-key");
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("api_key");

  return headerKey === apiKey || queryKey === apiKey;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export { getConfigDir } from "./config";
