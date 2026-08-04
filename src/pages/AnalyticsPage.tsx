import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { adminFetchCalls, adminFetchStats, type AdminStats, type MimicCall } from "../lib/adminAuth";
import { DualLineChart, DonutChart } from "../components/Charts";
import {
  downloadCsv,
  downloadJson,
  downloadPdfReport,
  downloadXlsxCompatible,
} from "../lib/exportUtils";
import type { AuthOutletContext } from "../layout/RequireAuth";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Page";
import { ErrorState, LoadingState } from "../ui/States";

export default function AnalyticsPage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [calls, setCalls] = useState<MimicCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"7d" | "30d">("7d");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([adminFetchStats(token), adminFetchCalls(token)]);
      setStats(s);
      setCalls(c.calls);
    } catch (e: any) {
      setError(e?.message || "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const dispositionSegments = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of calls) {
      const d = c.disposition || "unset";
      map[d] = (map[d] || 0) + 1;
    }
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }, [calls]);

  const serviceSegments = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byService).map(([label, value]) => ({ label, value }));
  }, [stats]);

  function exportAnalytics(format: "csv" | "xlsx" | "json" | "pdf") {
    if (!stats) return;
    const headers = ["Metric", "Value"];
    const rows: (string | number)[][] = [
      ["Enquiries", stats.kpis.enquiries],
      ["Submitted today", stats.kpis.submittedToday],
      ["Calls", stats.kpis.calls],
      ["Calls today", stats.kpis.callsToday],
      ["Marked responses", stats.kpis.markedResponses],
      ...dispositionSegments.map((d) => [`Disposition:${d.label}`, d.value]),
    ];
    if (format === "csv") downloadCsv("analytics.csv", headers, rows);
    else if (format === "xlsx") downloadXlsxCompatible("analytics.xlsx", headers, rows);
    else if (format === "json") downloadJson("analytics.json", { stats, dispositionSegments, range });
    else downloadPdfReport("Analytics report", rows.map((r) => `${r[0]}: ${r[1]}`));
  }

  if (loading) return <LoadingState label="Loading analytics…" />;
  if (error || !stats) return <ErrorState message={error || "No data"} onRetry={load} />;

  const enq = stats.enquiryBuckets.map((b) => b.count);
  const call = stats.callBuckets.map((b) => b.count);
  const labels = stats.enquiryBuckets.map((b) => b.date?.slice(5) || "");

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <select className="admin-input" value={range} onChange={(e) => setRange(e.target.value as "7d" | "30d")} aria-label="Date range">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days (chart uses available buckets)</option>
        </select>
        <div className="ent-export-menu">
          <Button size="sm" onClick={() => exportAnalytics("csv")}>
            CSV
          </Button>
          <Button size="sm" onClick={() => exportAnalytics("xlsx")}>
            XLSX
          </Button>
          <Button size="sm" onClick={() => exportAnalytics("json")}>
            JSON
          </Button>
          <Button size="sm" onClick={() => exportAnalytics("pdf")}>
            PDF
          </Button>
        </div>
      </div>

      <section className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Enquiries</div>
          <div className="kpi-value">{stats.kpis.enquiries.toLocaleString()}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Calls</div>
          <div className="kpi-value">{stats.kpis.calls.toLocaleString()}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Marked responses</div>
          <div className="kpi-value">{stats.kpis.markedResponses.toLocaleString()}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Conversion proxy</div>
          <div className="kpi-value">
            {calls.length
              ? `${Math.round((calls.filter((c) => c.disposition === "converted" || c.disposition === "interested").length / calls.length) * 100)}%`
              : "—"}
          </div>
        </article>
      </section>

      <div className="dash-mid">
        <Panel title="Enquiry vs calls" subtitle={`${range} trend`}>
          <DualLineChart labels={labels} seriesA={enq} seriesB={call} />
        </Panel>
        <Panel title="By service">
          <DonutChart segments={serviceSegments} />
        </Panel>
      </div>

      <Panel title="Disposition mix">
        {dispositionSegments.length === 0 ? (
          <p className="muted">No call dispositions yet.</p>
        ) : (
          <DonutChart segments={dispositionSegments} />
        )}
      </Panel>
    </div>
  );
}
