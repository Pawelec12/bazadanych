import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@pkb/db";
import {
  enrichedContent,
  productRelationships,
  products,
} from "@pkb/db";
import {
  buildSearchableText,
  generateEmbedding,
  upsertProductEmbedding,
} from "@pkb/search";

const ENRICHMENT_MODEL = "gpt-4o-mini";
const REVIEW_THRESHOLD = 0.7;

const enrichmentSchema = z.object({
  applicationDescription: z.string(),
  searchSummary: z.string(),
  relationships: z.array(
    z.object({
      catalogNumber: z.string(),
      type: z.enum(["accessory", "replacement", "compatible_with", "bundle"]),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    })
  ),
  confidence: z.number().min(0).max(1),
});

function getOpenAI() {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildEnrichmentSearchableText(product: {
  name: string;
  description: string | null;
  catalogNumber: string;
  attributes: Record<string, unknown>;
  searchSummary?: string | null;
  applicationDescription?: string | null;
}) {
  return buildSearchableText(product);
}

export async function enrichProduct(
  db: Database,
  productId: string
): Promise<{ enriched: boolean; needsReview: boolean }> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: { enrichedContent: true, category: true, manufacturer: true },
  });

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  if (
    product.enrichedContent &&
    product.enrichedContent.contentHashAtEnrichment === product.contentHash &&
    product.enrichedContent.status === "approved"
  ) {
    return { enriched: false, needsReview: false };
  }

  if (!process.env.OPENAI_API_KEY) {
    const fallbackSummary = `${product.name}. ${product.description ?? ""}`.trim();
    await db
      .insert(enrichedContent)
      .values({
        productId: product.id,
        applicationDescription: product.description,
        searchSummary: fallbackSummary,
        confidence: 0.5,
        modelVersion: "fallback",
        status: "needs_review",
        contentHashAtEnrichment: product.contentHash,
      })
      .onConflictDoUpdate({
        target: [enrichedContent.productId],
        set: {
          applicationDescription: product.description,
          searchSummary: fallbackSummary,
          confidence: 0.5,
          modelVersion: "fallback",
          status: "needs_review",
          contentHashAtEnrichment: product.contentHash,
          updatedAt: new Date(),
        },
      });

    return { enriched: true, needsReview: true };
  }

  const attrSummary = Object.entries(product.attributes as Record<string, unknown>)
    .filter(([key]) => key !== "_raw")
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

  const { object } = await generateObject({
    model: getOpenAI()(ENRICHMENT_MODEL),
    schema: enrichmentSchema,
    prompt: `You are enriching a technical distribution product catalog entry.

Product:
- Catalog number: ${product.catalogNumber}
- Name: ${product.name}
- Description: ${product.description ?? "N/A"}
- Manufacturer: ${product.manufacturer?.name ?? "Unknown"}
- Category: ${product.category?.path ?? "Unknown"}
- Attributes: ${attrSummary || "None"}

Generate:
1. applicationDescription: 2-4 sentences on where/how this product is used in industrial/technical contexts.
2. searchSummary: dense paragraph with synonyms, alternate terms, and industry jargon for search indexing.
3. relationships: suggest related catalog numbers if inferable from context (can be empty).
4. confidence: your confidence in the enrichment quality (0-1).

Be factual. Do not invent specifications not supported by the input.`,
  });

  const status =
    object.confidence < REVIEW_THRESHOLD ? "needs_review" : "approved";

  await db
    .insert(enrichedContent)
    .values({
      productId: product.id,
      applicationDescription: object.applicationDescription,
      searchSummary: object.searchSummary,
      relationships: object.relationships,
      confidence: object.confidence,
      modelVersion: ENRICHMENT_MODEL,
      status,
      contentHashAtEnrichment: product.contentHash,
      sourceRefs: [product.catalogNumber],
    })
    .onConflictDoUpdate({
      target: [enrichedContent.productId],
      set: {
        applicationDescription: object.applicationDescription,
        searchSummary: object.searchSummary,
        relationships: object.relationships,
        confidence: object.confidence,
        modelVersion: ENRICHMENT_MODEL,
        status,
        contentHashAtEnrichment: product.contentHash,
        updatedAt: new Date(),
      },
    });

  if (object.relationships.length > 0) {
    const catalogNumbers = object.relationships.map((r) => r.catalogNumber);
    const relatedProducts = await db.query.products.findMany({
      where: inArray(products.catalogNumber, catalogNumbers),
    });
    const relatedMap = new Map(relatedProducts.map((p) => [p.catalogNumber, p.id]));

    for (const rel of object.relationships) {
      const targetId = relatedMap.get(rel.catalogNumber);
      if (!targetId) continue;

      await db
        .insert(productRelationships)
        .values({
          sourceProductId: product.id,
          targetProductId: targetId,
          type: rel.type,
          confidence: rel.confidence,
          rationale: rel.rationale,
          isVerified: false,
        })
        .onConflictDoNothing({
          target: [
            productRelationships.sourceProductId,
            productRelationships.targetProductId,
            productRelationships.type,
          ],
        });
    }
  }

  const searchableText = buildEnrichmentSearchableText({
    name: product.name,
    description: product.description,
    catalogNumber: product.catalogNumber,
    attributes: product.attributes as Record<string, unknown>,
    searchSummary: object.searchSummary,
    applicationDescription: object.applicationDescription,
  });

  const embedding = await generateEmbedding(searchableText);
  await upsertProductEmbedding(db, product.id, searchableText, embedding);

  return { enriched: true, needsReview: status === "needs_review" };
}

export async function enrichPendingProducts(
  db: Database,
  limit = 50
): Promise<{ processed: number; needsReview: number }> {
  const pending = await db.execute<{ id: string }>(sql`
    SELECT p.id
    FROM products p
    LEFT JOIN enriched_content ec ON ec.product_id = p.id
    WHERE ec.id IS NULL
       OR ec.content_hash_at_enrichment IS DISTINCT FROM p.content_hash
    LIMIT ${limit}
  `);

  let processed = 0;
  let needsReview = 0;

  for (const row of pending.rows) {
    const result = await enrichProduct(db, row.id);
    if (result.enriched) processed += 1;
    if (result.needsReview) needsReview += 1;
  }

  return { processed, needsReview };
}

export async function approveEnrichment(
  db: Database,
  productId: string,
  updates?: {
    applicationDescription?: string;
    searchSummary?: string;
  }
): Promise<void> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: { enrichedContent: true },
  });

  if (!product?.enrichedContent) {
    throw new Error("No enrichment found for product");
  }

  const applicationDescription =
    updates?.applicationDescription ?? product.enrichedContent.applicationDescription;
  const searchSummary =
    updates?.searchSummary ?? product.enrichedContent.searchSummary;

  await db
    .update(enrichedContent)
    .set({
      applicationDescription,
      searchSummary,
      status: "approved",
      updatedAt: new Date(),
    })
    .where(eq(enrichedContent.productId, productId));

  const searchableText = buildEnrichmentSearchableText({
    name: product.name,
    description: product.description,
    catalogNumber: product.catalogNumber,
    attributes: product.attributes as Record<string, unknown>,
    searchSummary,
    applicationDescription,
  });

  if (process.env.OPENAI_API_KEY) {
    const embedding = await generateEmbedding(searchableText);
    await upsertProductEmbedding(db, product.id, searchableText, embedding);
  }
}

export async function rejectEnrichment(db: Database, productId: string): Promise<void> {
  await db
    .update(enrichedContent)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(enrichedContent.productId, productId));
}

export { REVIEW_THRESHOLD };
