"use client";

import { useState } from "react";
import Link from "next/link";

interface SearchResult {
  productId: string;
  catalogNumber: string;
  name: string;
  description: string | null;
  confidence: number;
  explanation?: {
    channels: string[];
    matchedFields: string[];
    exactMatchBoost: number;
    semanticSimilarity: number;
    filterCompleteness: number;
    dataQuality: number;
    freshness: number;
    rrfScore: number;
  };
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, explain: true, limit: 20 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
      setRaw(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <h1>Search Playground</h1>
        <p className="muted">Hybrid exact + semantic + filter search with confidence explanations.</p>
        <form onSubmit={runSearch} className="grid" style={{ marginTop: "1rem" }}>
          <div>
            <label htmlFor="query">Query</label>
            <input
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Catalog number, MPN, or natural language query"
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </section>

      <section className="card">
        <h2>Results ({results.length})</h2>
        {results.length === 0 ? (
          <p className="muted">No results yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Confidence</th>
                <th>Channels</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.productId}>
                  <td>
                    <strong>{result.catalogNumber}</strong>
                    <div>{result.name}</div>
                    <div className="muted">{result.description}</div>
                  </td>
                  <td>{(result.confidence * 100).toFixed(1)}%</td>
                  <td>
                    {result.explanation?.channels.map((channel) => (
                      <span key={channel} className="badge" style={{ marginRight: "0.25rem" }}>
                        {channel}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Link href={`/products/${result.productId}`}>Inspect</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {raw && (
        <section className="card">
          <h2>Raw Response</h2>
          <pre>{JSON.stringify(raw, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
