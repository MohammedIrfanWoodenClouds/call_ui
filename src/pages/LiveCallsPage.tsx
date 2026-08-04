import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { adminFetchCalls, type MimicCall } from "../lib/adminAuth";
import { loadCampaigns } from "../lib/localStore";
import type { AuthOutletContext } from "../layout/RequireAuth";
import { Badge, Panel } from "../ui/Page";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";

function isRecent(iso: string, minutes = 30): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < minutes * 60_000;
}

export default function LiveCallsPage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [calls, setCalls] = useState<MimicCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetchCalls(token);
      setCalls(res.calls);
    } catch (e: any) {
      setError(e?.message || "Could not load live calls.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const runningCampaigns = useMemo(
    () => loadCampaigns().filter((c) => c.status === "running"),
    [calls]
  );

  const live = useMemo(() => {
    return calls
      .filter((c) => c.status === "in_progress" || c.status === "ringing" || (!c.endedAt && isRecent(c.updatedAt || c.createdAt, 60)))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [calls]);

  const recent = useMemo(() => {
    return [...calls]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 12);
  }, [calls]);

  if (loading && calls.length === 0) return <LoadingState label="Loading live monitor…" />;
  if (error && calls.length === 0) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="ent-page">
      <div className="kpi-row ent-kpi-compact">
        <article className="kpi-card">
          <div className="kpi-label">Active sessions</div>
          <div className="kpi-value">{live.length}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Running campaigns</div>
          <div className="kpi-value">{runningCampaigns.length}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Total calls</div>
          <div className="kpi-value">{calls.length}</div>
        </article>
      </div>

      {error && <div className="crm-error-banner">{error}</div>}

      <div className="ent-split-2">
        <Panel title="Live now" subtitle="Auto-refreshes every 15s" actions={<Link className="ui-btn ui-btn-secondary ui-btn-sm" to="/admin/bot">Open Call Bot</Link>}>
          {live.length === 0 ? (
            <EmptyState
              title="No live calls"
              description="Start the Call Bot or a campaign to monitor sessions here."
            />
          ) : (
            <ul className="ent-live-list">
              {live.map((c) => (
                <li key={c.id} className="ent-live-item">
                  <span className="ent-pulse" aria-hidden />
                  <div>
                    <div className="ent-cell-strong">{c.contactName || c.phone}</div>
                    <div className="muted">{c.phone} · {c.status}</div>
                  </div>
                  <Link className="ui-btn ui-btn-ghost ui-btn-sm" to={`/admin/calls?id=${encodeURIComponent(c.id)}`}>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Campaign activity" subtitle="Local campaign runners">
          {runningCampaigns.length === 0 ? (
            <EmptyState title="No running campaigns" description="Launch a campaign from Campaigns." />
          ) : (
            <ul className="ent-live-list">
              {runningCampaigns.map((c) => (
                <li key={c.id} className="ent-live-item">
                  <Badge tone="accent">running</Badge>
                  <div>
                    <div className="ent-cell-strong">{c.name}</div>
                    <div className="muted">
                      Dialed {c.stats.dialed} · Answered {c.stats.answered}
                    </div>
                  </div>
                  <Link className="ui-btn ui-btn-ghost ui-btn-sm" to="/admin/campaigns">
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent calls">
        {recent.length === 0 ? (
          <EmptyState title="No calls yet" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Disposition</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td>{c.contactName || "—"}</td>
                    <td>{c.phone}</td>
                    <td>
                      <Badge tone="info">{c.status}</Badge>
                    </td>
                    <td>{c.disposition || "—"}</td>
                    <td>{new Date(c.updatedAt || c.createdAt).toLocaleString()}</td>
                    <td>
                      <Link className="ui-btn ui-btn-ghost ui-btn-sm" to={`/admin/conversations?id=${encodeURIComponent(c.id)}`}>
                        Transcript
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
