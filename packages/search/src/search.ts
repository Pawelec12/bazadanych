import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import type { Database } from "@pkb/db";
import { categories, products } from "@pkb/db";
import { canEmbed, generateEmbedding } from "./embed";
import {
  attributeCompleteness,
  computeConfidence,
  reciprocalRankFusion,
} from "./scoring";
import type { SearchRequest, SearchResponse, SearchResultItem } from "./types";

async function embedQuery(query: string): Promise<number[] | null> {
  if (!canEmbed()) return null;
  return generateEmbedding(query);
}

export async function hybridSearch(
  db: Database,
  request: SearchRequest
): Promise<SearchResponse> {
  const limit = request.limit ?? 20;
  let channels = request.channels ?? ["exact", "semantic", "filter"];
  const query = request.query.trim();
  const filters = request.filters ?? {};

  if (!canEmbed()) {
    channels = channels.filter((c) => c !== "semantic");
  }

  const exactResults: Array<{ id: string; score: number; matchedFields: string[] }> = [];
  const semanticResults: Array<{ id: string; score: number }> = [];
  const filterResults: Array<{ id: string; score: number }> = [];

  let categoryId = filters.categoryId;
  if (!categoryId && filters.categorySlug) {
    const category = await db.query.categories.findFirst({
      where: eq(categories.slug, filters.categorySlug.replace(/\//g, "-")),
    });
    categoryId = category?.id;
  }

  if (channels.includes("exact") && query.length > 0) {
    const normalizedQuery = query.toUpperCase();

    const trigramMatches = await db.execute<{
      id: string;
      catalog_number: string;
      mpn: string | null;
      gtin: string | null;
      score: number;
    }>(sql`
      SELECT
        p.id,
        p.catalog_number,
        p.mpn,
        p.gtin,
        GREATEST(
          similarity(p.catalog_number, ${query}),
          similarity(COALESCE(p.mpn, ''), ${query}),
          similarity(p.name, ${query})
        ) AS score
      FROM products p
      WHERE p.status = 'active'
      ${filters.manufacturerId ? sql`AND p.manufacturer_id = ${filters.manufacturerId}` : sql``}
      ${categoryId ? sql`AND p.category_id = ${categoryId}` : sql``}
      AND (
        p.catalog_number = ${normalizedQuery}
        OR p.mpn = ${normalizedQuery}
        OR p.gtin = ${query}
        OR p.catalog_number % ${query}
        OR p.name % ${query}
        OR p.catalog_number ILIKE ${`%${query}%`}
        OR p.name ILIKE ${`%${query}%`}
      )
      ORDER BY score DESC
      LIMIT 50
    `);

    for (const [index, match] of trigramMatches.rows.entries()) {
      const matchedFields: string[] = [];
      if (match.catalog_number?.toUpperCase() === normalizedQuery) matchedFields.push("catalog_number");
      if (match.mpn?.toUpperCase() === normalizedQuery) matchedFields.push("mpn");
      if (match.gtin === query) matchedFields.push("gtin");
      if (matchedFields.length === 0) matchedFields.push("fuzzy");

      exactResults.push({
        id: match.id,
        score: Number(match.score) || 1 - index * 0.01,
        matchedFields,
      });
    }
  }

  if (channels.includes("semantic") && query.length > 0) {
    const queryEmbedding = await embedQuery(query);
    if (queryEmbedding) {
      const vectorLiteral = `[${queryEmbedding.join(",")}]`;

      const semanticMatches = await db.execute<{
        product_id: string;
        similarity: number;
      }>(sql`
        SELECT
          pe.product_id,
          1 - (pe.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM product_embeddings pe
        INNER JOIN products p ON p.id = pe.product_id
        WHERE p.status = 'active'
        ${filters.manufacturerId ? sql`AND p.manufacturer_id = ${filters.manufacturerId}` : sql``}
        ${categoryId ? sql`AND p.category_id = ${categoryId}` : sql``}
        ORDER BY pe.embedding <=> ${vectorLiteral}::vector
        LIMIT 50
      `);

      for (const row of semanticMatches.rows) {
        semanticResults.push({
          id: row.product_id,
          score: Number(row.similarity),
        });
      }
    }
  }

  if (channels.includes("filter")) {
    const attributeFilter = filters.attributes ?? {};
    const attributeEntries = Object.entries(attributeFilter);

    const filterMatches = await db
      .select({ id: products.id, attributes: products.attributes })
      .from(products)
      .where(
        and(
          eq(products.status, "active"),
          filters.manufacturerId
            ? eq(products.manufacturerId, filters.manufacturerId)
            : undefined,
          categoryId ? eq(products.categoryId, categoryId) : undefined,
          query.length > 0 ? ilike(products.name, `%${query}%`) : undefined
        )
      )
      .limit(50);

    for (const [index, match] of filterMatches.entries()) {
      let completeness = 1;
      if (attributeEntries.length > 0) {
        const attrs = match.attributes as Record<string, unknown>;
        const matched = attributeEntries.filter(([key, value]) => String(attrs[key]) === String(value));
        completeness = matched.length / attributeEntries.length;
      }

      filterResults.push({
        id: match.id,
        score: completeness - index * 0.001,
      });
    }
  }

  const fused = reciprocalRankFusion(
    [exactResults, semanticResults, filterResults],
    [1.5, 1, 0.8]
  );

  const rankedIds = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (rankedIds.length === 0) {
    return { results: [], total: 0, query };
  }

  const productRows = await db.query.products.findMany({
    where: inArray(products.id, rankedIds),
    with: { enrichedContent: true },
  });

  const productMap = new Map(productRows.map((row) => [row.id, row]));
  const exactMap = new Map(exactResults.map((r) => [r.id, r]));
  const semanticMap = new Map(semanticResults.map((r) => [r.id, r]));

  const results: SearchResultItem[] = [];

  for (const id of rankedIds) {
    const product = productMap.get(id);
    if (!product) continue;

    const exact = exactMap.get(id);
    const semantic = semanticMap.get(id);
    const enrichmentConfidence = product.enrichedContent?.confidence ?? 0.5;
    const daysSinceUpdate =
      (Date.now() - new Date(product.updatedAt).getTime()) / (1000 * 60 * 60 * 24);

    const scored = computeConfidence({
      exactMatch: Boolean(exact?.matchedFields.some((f) => f !== "fuzzy")),
      semanticSimilarity: semantic?.score ?? 0,
      filterCompleteness: filters.attributes ? 1 : 0.5,
      enrichmentConfidence,
      attributeCompleteness: attributeCompleteness(
        product.attributes as Record<string, unknown>
      ),
      daysSinceUpdate,
    });

    const channelsMatched: string[] = [];
    if (exact) channelsMatched.push("exact");
    if (semantic) channelsMatched.push("semantic");
    if (filterResults.some((f) => f.id === id)) channelsMatched.push("filter");

    const item: SearchResultItem = {
      productId: product.id,
      catalogNumber: product.catalogNumber,
      name: product.name,
      description: product.description,
      manufacturerId: product.manufacturerId,
      categoryId: product.categoryId,
      attributes: product.attributes as Record<string, unknown>,
      confidence: scored.confidence,
    };

    if (request.explain) {
      item.explanation = {
        ...scored.explanation,
        rrfScore: fused.get(id) ?? 0,
        channels: channelsMatched,
        matchedFields: exact?.matchedFields ?? [],
      };
    }

    results.push(item);
  }

  return { results, total: results.length, query };
}
