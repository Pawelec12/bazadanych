"use client";

import { useEffect, useState } from "react";

interface ImportRun {
  id: string;
  fileName: string;
  status: string;
  rowCount: number;
  processedCount: number;
  rejectedCount: number;
  startedAt: string;
  manufacturer?: { name: string };
}

export default function IngestPage() {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRuns() {
    const response = await fetch("/api/ingest");
    const data = await response.json();
    if (response.ok) setRuns(data.runs ?? []);
  }

  useEffect(() => {
    loadRuns();
  }, []);

  async function uploadFile(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed");
      setFile(null);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <h1>Ingest Monitor</h1>
        <p className="muted">Upload CSV, Excel, or XML catalog files for normalization.</p>
        <form onSubmit={uploadFile} className="grid" style={{ marginTop: "1rem" }}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.xml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={!file || loading}>
            {loading ? "Uploading..." : "Upload & Ingest"}
          </button>
        </form>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </section>

      <section className="card">
        <h2>Import Runs</h2>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Manufacturer</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Processed</th>
              <th>Rejected</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.fileName}</td>
                <td>{run.manufacturer?.name ?? "—"}</td>
                <td>{run.status}</td>
                <td>{run.rowCount}</td>
                <td>{run.processedCount}</td>
                <td>{run.rejectedCount}</td>
                <td>{new Date(run.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
