import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { adminFetchCalls, adminFetchLogs, type MimicCall } from "../lib/adminAuth";
import type { AuthOutletContext } from "../layout/RequireAuth";
import { Badge, Panel } from "../ui/Page";
import { Pagination, usePaged } from "../ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";

type TimelineEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string;
  href?: string;
};

const PAGE_SIZE = 20;

export default function CallTimelinePage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [params] = useSearchParams();
  const [calls, setCalls] = useState<MimicCall[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, l] = await Promise.all([
        adminFetchCalls(token),
        adminFetchLogs(token, { limit: 200 }),
      ]);
      setCalls(c.calls);
      setEvents(l.events);
    } catch (e: any) {
      setError(e?.message || "Could not load timeline.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(() => {
    const items: TimelineEvent[] = [];
    for (const c of calls) {
      items.push({
        id: `call-${c.id}`,
        at: c.createdAt,
        kind: "call",
        title: `Call · ${c.contactName || c.phone}`,
        detail: `${c.status}${c.disposition ? ` · ${c.disposition}` : ""}`,
        href: `/admin/calls?id=${encodeURIComponent(c.id)}`,
      });
      for (const t of c.turns || []) {
        items.push({
          id: `turn-${c.id}-${t.id}`,
          at: t.at,
          kind: "turn",
          title: `${t.role === "agent" ? "Agent" : "Customer"} turn`,
          detail: t.text.slice(0, 140),
          href: `/admin/conversations?id=${encodeURIComponent(c.id)}`,
        });
      }
    }
    for (const ev of events) {
      const at = ev.at || ev.ts || ev.createdAt || new Date().toISOString();
      const type = ev.type || ev.event || "log";
      items.push({
        id: `log-${ev.id || at}-${type}`,
        at,
        kind: "log",
        title: String(type),
        detail: typeof ev.message === "string" ? ev.message : JSON.stringify(ev).slice(0, 140),
        href: "/admin/logs",
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [calls, events]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return timeline.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (!query) return true;
      return e.title.toLowerCase().includes(query) || e.detail.toLowerCase().includes(query);
    });
  }, [timeline, kind, q]);

  const pageRows = usePaged(filtered, page, PAGE_SIZE);

  if (loading) return <LoadingState label="Building timeline…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <input
          className="admin-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search timeline…"
          aria-label="Search timeline"
        />
        <select
          className="admin-input"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
          aria-label="Filter event type"
        >
          <option value="all">All events</option>
          <option value="call">Calls</option>
          <option value="turn">Turns</option>
          <option value="log">Logs</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState title="No timeline events" description="Calls and log events will appear here." />
        </Panel>
      ) : (
        <Panel>
          <ol className="ent-timeline">
            {pageRows.map((e) => (
              <li key={e.id} className="ent-timeline-item">
                <div className="ent-timeline-dot" data-kind={e.kind} />
                <div className="ent-timeline-body">
                  <div className="ent-timeline-head">
                    <Badge tone={e.kind === "call" ? "accent" : e.kind === "turn" ? "info" : "neutral"}>
                      {e.kind}
                    </Badge>
                    <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
                  </div>
                  <div className="ent-cell-strong">{e.title}</div>
                  <p className="muted">{e.detail}</p>
                  {e.href ? (
                    <Link className="ui-btn ui-btn-ghost ui-btn-sm" to={e.href}>
                      Open
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </Panel>
      )}
    </div>
  );
}
