"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ReviewItem {
  productId: string;
  confidence: number;
  status: string;
  applicationDescription: string | null;
  searchSummary: string | null;
  product: {
    id: string;
    catalogNumber: string;
    name: string;
  };
}

export default function ReviewPage() {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const response = await fetch("/api/enrich");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load queue");
      setQueue(data.queue ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function updateItem(productId: string, action: "approve" | "reject") {
    const response = await fetch("/api/enrich", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, action }),
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error ?? "Update failed");
      return;
    }
    await loadQueue();
  }

  return (
    <div className="grid">
      <section className="card">
        <h1>Enrichment Review</h1>
        <p className="muted">Approve or reject low-confidence enrichments before indexing.</p>
        <button onClick={loadQueue} style={{ marginTop: "1rem" }}>
          Refresh Queue
        </button>
      </section>

      {loading && <p className="muted">Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {queue.map((item) => (
        <section key={item.productId} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <h2>{item.product.catalogNumber}</h2>
              <p>{item.product.name}</p>
            </div>
            <span className={`badge ${item.confidence < 0.7 ? "warning" : ""}`}>
              {(item.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
          <p><strong>Application:</strong> {item.applicationDescription}</p>
          <p><strong>Search summary:</strong> {item.searchSummary}</p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button onClick={() => updateItem(item.productId, "approve")}>Approve</button>
            <button className="secondary" onClick={() => updateItem(item.productId, "reject")}>
              Reject
            </button>
            <Link href={`/products/${item.productId}`}>Inspect</Link>
          </div>
        </section>
      ))}

      {!loading && queue.length === 0 && (
        <section className="card">
          <p className="muted">No items in the review queue.</p>
        </section>
      )}
    </div>
  );
}
