import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@pkb/db";
import { products } from "@pkb/db";

export const EMBEDDING_MODEL = "text-embedding-3-small";

function getOpenAI() {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function canEmbed(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function buildSearchableText(product: {
  name: string;
  description: string | null;
  catalogNumber: string;
  attributes: Record<string, unknown>;
  searchSummary?: string | null;
  applicationDescription?: string | null;
}): string {
  const attrText = Object.entries(product.attributes)
    .filter(([key]) => key !== "_raw")
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

  return [
    product.name,
    product.catalogNumber,
    product.description,
    product.searchSummary,
    product.applicationDescription,
    attrText,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!canEmbed()) {
    throw new Error("OPENAI_API_KEY is required for embedding generation");
  }

  const { embedding } = await embed({
    model: getOpenAI().embedding(EMBEDDING_MODEL),
    value: text,
  });

  return embedding;
}

export async function upsertProductEmbedding(
  db: Database,
  productId: string,
  searchableText: string,
  embedding: number[]
): Promise<void> {
  const vectorLiteral = `[${embedding.join(",")}]`;

  await db.execute(sql`
    INSERT INTO product_embeddings (product_id, embedding, searchable_text, model_version, updated_at)
    VALUES (
      ${productId},
      ${vectorLiteral}::vector,
      ${searchableText},
      ${EMBEDDING_MODEL},
      NOW()
    )
    ON CONFLICT (product_id)
    DO UPDATE SET
      embedding = EXCLUDED.embedding,
      searchable_text = EXCLUDED.searchable_text,
      model_version = EXCLUDED.model_version,
      updated_at = NOW()
  `);
}

export async function embedProductById(
  db: Database,
  productId: string
): Promise<boolean> {
  if (!canEmbed()) return false;

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: { enrichedContent: true },
  });

  if (!product) return false;

  const searchableText = buildSearchableText({
    name: product.name,
    description: product.description,
    catalogNumber: product.catalogNumber,
    attributes: product.attributes as Record<string, unknown>,
    searchSummary: product.enrichedContent?.searchSummary,
    applicationDescription: product.enrichedContent?.applicationDescription,
  });

  const embedding = await generateEmbedding(searchableText);
  await upsertProductEmbedding(db, product.id, searchableText, embedding);
  return true;
}

export async function embedProductsByIds(
  db: Database,
  productIds: string[]
): Promise<{ embedded: number; skipped: number }> {
  if (!canEmbed() || productIds.length === 0) {
    return { embedded: 0, skipped: productIds.length };
  }

  let embedded = 0;
  let skipped = 0;

  for (const productId of productIds) {
    try {
      const ok = await embedProductById(db, productId);
      if (ok) embedded += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { embedded, skipped };
}
