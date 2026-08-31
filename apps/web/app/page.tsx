import Link from "next/link";

export default function HomePage() {
  return (
    <div className="grid">
      <section className="card">
        <h1>Product Knowledge Base</h1>
        <p className="muted">
          Internal verification tooling for catalog normalization, enrichment,
          hybrid search, and refresh monitoring.
        </p>
      </section>

      <section className="grid grid-2">
        <Link href="/search" className="card">
          <h2>Search Playground</h2>
          <p className="muted">Run hybrid queries and inspect confidence explanations.</p>
        </Link>
        <Link href="/review" className="card">
          <h2>Enrichment Review</h2>
          <p className="muted">Approve or reject low-confidence enrichments.</p>
        </Link>
        <Link href="/refresh" className="card">
          <h2>Refresh Dashboard</h2>
          <p className="muted">Monitor catalog diffs and discrepancies.</p>
        </Link>
        <Link href="/ingest" className="card">
          <h2>Ingest Monitor</h2>
          <p className="muted">Upload files and review import runs.</p>
        </Link>
      </section>
    </div>
  );
}
