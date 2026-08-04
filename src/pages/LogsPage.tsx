import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { adminFetchLogs } from "../lib/adminAuth";
import type { AuthOutletContext } from "../layout/RequireAuth";

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

function toNonNullString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export default function LogsPage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [logs, setLogs] = useState<any[]>([]);
  const [logSessionId, setLogSessionId] = useState("");
  const [logLimit, setLogLimit] = useState(200);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetchLogs(token, {
        sessionId: logSessionId.trim() ? logSessionId.trim() : undefined,
        limit: logLimit,
      });
      setLogs(res.events);
    } catch (err: any) {
      setError(err?.message || "Could not load logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="logs-page">
      {error && <div className="crm-error-banner">{error}</div>}

      <div className="crm-panel">
        <div className="admin-log-controls">
          <label className="admin-label">
            Session ID
            <input
              className="admin-input"
              value={logSessionId}
              onChange={(e) => setLogSessionId(e.target.value)}
              placeholder="e.g. <uuid>"
            />
          </label>
          <label className="admin-label">
            Limit
            <input
              className="admin-input"
              type="number"
              min={1}
              max={1000}
              value={logLimit}
              onChange={(e) => setLogLimit(Math.max(1, Math.min(1000, Number(e.target.value))))}
            />
          </label>
          <button className="primary" type="button" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="crm-loading">
            <div className="spinner" />
            <p className="muted">Loading logs…</p>
          </div>
        ) : (
          <div className="admin-logs">
            {logs.length === 0 ? (
              <div className="muted center">No logs found.</div>
            ) : (
              logs
                .slice()
                .reverse()
                .slice(0, logLimit)
                .map((e, idx) => {
                  const receivedAt = toNonNullString((e as any).receivedAt);
                  const sessionId = toNonNullString((e as any).sessionId);
                  const type = toNonNullString((e as any).type);
                  return (
                    <details className="admin-log-item" key={`${receivedAt}-${sessionId}-${idx}`}>
                      <summary>
                        <span className="admin-log-sum-left">
                          <span className="mono">{sessionId || "no-session"}</span>
                        </span>
                        <span className="admin-log-sum-mid muted">{type || "event"}</span>
                        <span className="admin-log-sum-right muted">{fmtDateTime(receivedAt)}</span>
                      </summary>
                      <pre className="admin-log-pre">{JSON.stringify(e, null, 2)}</pre>
                    </details>
                  );
                })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
