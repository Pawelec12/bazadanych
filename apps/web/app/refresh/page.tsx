"use client";

import { useEffect, useState } from "react";

interface RefreshRun {
  id: string;
  status: string;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  conflictCount: number;
  startedAt: string;
  manufacturer?: { name: string };
}

interface Discrepancy {
  id: string;
  type: string;
  severity: string;
  catalogNumber: string | null;
  message: string;
}

export default function RefreshPage() {
  const [runs, setRuns] = useState<RefreshRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRuns() {
    setLoading(true);
    try {
      const response = await fetch("/api/refresh");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load runs");
      setRuns(data.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }

  async function loadDiscrepancies(runId: string) {
    setSelectedRunId(runId);
    const response = await fetch(`/api/refresh?runId=${runId}`);
    const data = await response.json();
    setDiscrepancies(data.discrepancies ?? []);
  }

  async function triggerRefresh() {
    const response = await fetch("/api/refresh", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error ?? "Refresh failed");
      return;
    }
    await loadRuns();
  }

  useEffect(() => {
    loadRuns();
  }, []);

  return (
    <div className="grid">
      <section className="card">
        <h1>Refresh Dashboard</h1>
        <p className="muted">Monitor file-level and row-level catalog discrepancies.</p>
        <button onClick={triggerRefresh} style={{ marginTop: "1rem" }}>
          Run Refresh Now
        </button>
      </section>

      {loading && <p className="muted">Loading...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <section className="card">
        <h2>Recent Runs</h2>
        <table>
          <thead>
            <tr>
              <th>Manufacturer</th>
              <th>Status</th>
              <th>Added</th>
              <th>Updated</th>
              <th>Removed</th>
              <th>Conflicts</th>
              <th>Started</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.manufacturer?.name ?? "—"}</td>
                <td>{run.status}</td>
                <td>{run.addedCount}</td>
                <td>{run.updatedCount}</td>
                <td>{run.removedCount}</td>
                <td>{run.conflictCount}</td>
                <td>{new Date(run.startedAt).toLocaleString()}</td>
                <td>
                  <button className="secondary" onClick={() => loadDiscrepancies(run.id)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedRunId && (
        <section className="card">
          <h2>Discrepancies</h2>
          {discrepancies.length === 0 ? (
            <p className="muted">No discrepancies for this run.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Catalog #</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((item) => (
                  <tr key={item.id}>
                    <td>{item.type}</td>
                    <td>
                      <span className={`badge ${item.severity === "error" ? "danger" : ""}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td>{item.catalogNumber}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
