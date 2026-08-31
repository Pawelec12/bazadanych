import Link from "next/link";
import { getDb } from "@/lib/db";

export default async function ProductInspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const product = await db.query.products.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    with: {
      manufacturer: true,
      category: true,
      enrichedContent: true,
      embedding: true,
      sourceRelationships: { with: { targetProduct: true } },
    },
  });

  if (!product) {
    return (
      <section className="card">
        <h1>Product not found</h1>
        <Link href="/search">Back to search</Link>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="card">
        <h1>{product.catalogNumber}</h1>
        <p>{product.name}</p>
        <p className="muted">{product.description}</p>
        <p>
          <span className="badge">{product.manufacturer?.name}</span>{" "}
          {product.category && <span className="badge">{product.category.path}</span>}
        </p>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h2>Normalized Attributes</h2>
          <pre>{JSON.stringify(product.attributes, null, 2)}</pre>
        </div>
        <div className="card">
          <h2>Enriched Content</h2>
          <pre>{JSON.stringify(product.enrichedContent, null, 2)}</pre>
        </div>
      </section>

      <section className="card">
        <h2>Embedding</h2>
        <p className="muted">{product.embedding?.searchableText}</p>
      </section>

      <section className="card">
        <h2>Relationships</h2>
        <pre>{JSON.stringify(product.sourceRelationships, null, 2)}</pre>
      </section>
    </div>
  );
}
