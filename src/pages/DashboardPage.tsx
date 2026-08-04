import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../lib/useAdminAuth";
import { adminFetchStats, type AdminStats } from "../lib/adminAuth";
import { DonutChart, DualLineChart, Sparkline, pctChange } from "../components/Charts";

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

export default function DashboardPage() {
  const { token } = useAdminAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await adminFetchStats(token);
        if (!cancelled) setStats(s);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const serviceSegments = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byService).map(([label, value]) => ({ label, value }));
  }, [stats]);

  if (loading) {
    return (
      <div className="crm-loading">
        <div className="spinner" />
        <p className="muted">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !stats) {
    return <div className="crm-error-banner">{error || "No data."}</div>;
  }

  const k = stats.kpis;
  const enqDelta = pctChange(k.submittedToday, k.submittedYesterday);
  const callDelta = pctChange(k.callsToday, k.callsYesterday);
  const enqSpark = stats.enquiryBuckets.map((b) => b.count);
  const callSpark = stats.callBuckets.map((b) => b.count);

  return (
    <div className="dash">
      <div className="ent-quick-links" aria-label="Quick actions">
        <Link className="ent-quick-link" to="/admin/contacts">Contacts</Link>
        <Link className="ent-quick-link" to="/admin/campaigns">Campaigns</Link>
        <Link className="ent-quick-link" to="/admin/live">Live Calls</Link>
        <Link className="ent-quick-link" to="/admin/analytics">Analytics</Link>
        <Link className="ent-quick-link" to="/admin/bot">Call Bot</Link>
      </div>

      <section className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Enquiries</div>
          <div className="kpi-value">{k.enquiries.toLocaleString()}</div>
          <div className={`kpi-delta${enqDelta.up === true ? " up" : enqDelta.up === false ? " down" : ""}`}>
            {enqDelta.text} today
          </div>
          <Sparkline values={enqSpark} stroke="#3B82F6" fill="rgba(59,130,246,0.12)" />
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Submitted today</div>
          <div className="kpi-value">{k.submittedToday.toLocaleString()}</div>
          <div className={`kpi-delta${enqDelta.up === true ? " up" : enqDelta.up === false ? " down" : ""}`}>
            vs yesterday {enqDelta.text}
          </div>
          <Sparkline values={enqSpark} stroke="#22C55E" fill="rgba(34,197,94,0.12)" />
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Calls</div>
          <div className="kpi-value">{k.calls.toLocaleString()}</div>
          <div className={`kpi-delta${callDelta.up === true ? " up" : callDelta.up === false ? " down" : ""}`}>
            {callDelta.text} today
          </div>
          <Sparkline values={callSpark} stroke="#F59E0B" fill="rgba(245,158,11,0.12)" />
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Marked responses</div>
          <div className="kpi-value">{k.markedResponses.toLocaleString()}</div>
          <div className="kpi-delta">{k.markedCalls} calls with disposition</div>
          <Sparkline
            values={callSpark.map((c, i) => Math.min(c, enqSpark[i] ?? c))}
            stroke="#6366F1"
            fill="rgba(99,102,241,0.1)"
          />
        </article>
      </section>

      <section className="dash-mid">
        <div className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Sessions</div>
              <div className="crm-panel-sub">Enquiries vs calls · last 7 days</div>
            </div>
            <div className="dash-legend">
              <span>
                <i className="leg leg-a" /> Enquiries
              </span>
              <span>
                <i className="leg leg-b" /> Calls
              </span>
            </div>
          </div>
          <div className="crm-panel-body">
            <DualLineChart
              seriesA={enqSpark}
              seriesB={callSpark}
              labels={stats.enquiryBuckets.map((b) => b.date)}
            />
          </div>
        </div>

        <div className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Users by service</div>
              <div className="crm-panel-sub">Submitted enquiry mix</div>
            </div>
          </div>
          <div className="crm-panel-body donut-body">
            {serviceSegments.length === 0 ? (
              <p className="muted center">No service data yet.</p>
            ) : (
              <DonutChart segments={serviceSegments} />
            )}
          </div>
        </div>
      </section>

      <section className="dash-bottom">
        <div className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Top requirements</div>
              <div className="crm-panel-sub">Latest collected notes</div>
            </div>
            <Link className="crm-text-link" to="/admin/requirements">
              View all
            </Link>
          </div>
          <ul className="dash-list">
            {stats.latestRequirements.length === 0 ? (
              <li className="muted">No requirements yet.</li>
            ) : (
              stats.latestRequirements.map((r) => (
                <li key={r.id}>
                  <div className="dash-list-main">
                    <strong>{r.ref || "—"}</strong>
                    <span className="muted">{r.service}</span>
                  </div>
                  <div className="dash-list-msg">{r.message}</div>
                  <div className="dash-list-meta muted">{r.name || "—"} · {fmtDateTime(r.updatedAt)}</div>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Marked responses</div>
              <div className="crm-panel-sub">Recent CRM tags</div>
            </div>
            <Link className="crm-text-link" to="/admin/responses">
              View all
            </Link>
          </div>
          <ul className="dash-list">
            {stats.latestResponses.length === 0 ? (
              <li className="muted">No marked responses yet.</li>
            ) : (
              stats.latestResponses.map((r) => (
                <li key={r.turnId}>
                  <div className="dash-list-main">
                    <strong>{r.contactName}</strong>
                    <span className={`mark-chip mark-${r.mark}`}>{r.mark}</span>
                  </div>
                  <div className="dash-list-msg">{r.text}</div>
                  <div className="dash-list-meta muted">
                    <Link to={`/admin/calls?id=${r.callId}`}>{r.phone}</Link> · {fmtDateTime(r.at)}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
