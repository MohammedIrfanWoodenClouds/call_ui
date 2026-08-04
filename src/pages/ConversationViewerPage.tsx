import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { adminFetchCalls, type MimicCall } from "../lib/adminAuth";
import type { AuthOutletContext } from "../layout/RequireAuth";
import { Badge, Panel } from "../ui/Page";
import { Pagination, usePaged } from "../ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";

const PAGE_SIZE = 10;

export default function ConversationViewerPage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [params, setParams] = useSearchParams();
  const [calls, setCalls] = useState<MimicCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const selectedId = params.get("id");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetchCalls(token);
      setCalls(res.calls);
    } catch (e: any) {
      setError(e?.message || "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return calls.filter((c) => {
      if (!query) return true;
      return (
        (c.contactName || "").toLowerCase().includes(query) ||
        (c.phone || "").toLowerCase().includes(query) ||
        (c.turns || []).some((t) => t.text.toLowerCase().includes(query))
      );
    });
  }, [calls, q]);

  const pageRows = usePaged(filtered, page, PAGE_SIZE);
  const selected = calls.find((c) => c.id === selectedId) || pageRows[0] || null;

  useEffect(() => {
    if (!selectedId && selected) {
      setParams({ id: selected.id }, { replace: true });
    }
  }, [selectedId, selected, setParams]);

  if (loading) return <LoadingState label="Loading conversations…" />;
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
          placeholder="Search transcripts…"
          aria-label="Search conversations"
        />
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState title="No conversations" description="Completed mimic calls will appear here." />
        </Panel>
      ) : (
        <div className="ent-split-conv">
          <Panel title="Sessions" className="ent-conv-list">
            <ul className="ent-live-list">
              {pageRows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`ent-conv-item${selected?.id === c.id ? " active" : ""}`}
                    onClick={() => setParams({ id: c.id })}
                  >
                    <div className="ent-cell-strong">{c.contactName || c.phone}</div>
                    <div className="muted">
                      {c.turns?.length || 0} turns · {new Date(c.updatedAt || c.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </Panel>

          <Panel
            title={selected ? selected.contactName || selected.phone : "Conversation"}
            subtitle={selected ? selected.phone : undefined}
            actions={
              selected ? (
                <Link className="ui-btn ui-btn-secondary ui-btn-sm" to={`/admin/recordings?id=${encodeURIComponent(selected.id)}`}>
                  Recording view
                </Link>
              ) : null
            }
          >
            {!selected ? (
              <EmptyState title="Select a conversation" />
            ) : (selected.turns || []).length === 0 ? (
              <EmptyState title="No turns recorded" />
            ) : (
              <div className="ent-transcript" role="log" aria-live="polite">
                {selected.turns.map((t) => (
                  <div key={t.id} className={`ent-bubble ent-bubble-${t.role}`}>
                    <div className="ent-bubble-meta">
                      <Badge tone={t.role === "agent" ? "accent" : "info"}>{t.role}</Badge>
                      <time dateTime={t.at}>{new Date(t.at).toLocaleTimeString()}</time>
                      {t.mark ? <Badge tone="warning">{t.mark}</Badge> : null}
                    </div>
                    <p>{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
