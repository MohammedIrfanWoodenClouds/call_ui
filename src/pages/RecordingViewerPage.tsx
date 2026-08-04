import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../lib/useAdminAuth";
import { adminFetchCalls, type MimicCall } from "../lib/adminAuth";
import { downloadJson, downloadPdfReport } from "../lib/exportUtils";
import { Button } from "../ui/Button";
import { Badge, Panel } from "../ui/Page";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";

export default function RecordingViewerPage() {
  const { token } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [calls, setCalls] = useState<MimicCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);

  const selectedId = params.get("id");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetchCalls(token);
      setCalls(res.calls);
    } catch (e: any) {
      setError(e?.message || "Could not load recordings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => {
    if (selectedId) return calls.find((c) => c.id === selectedId) || null;
    return calls[0] || null;
  }, [calls, selectedId]);

  useEffect(() => {
    setCursor(0);
    setPlaying(false);
  }, [selected?.id]);

  useEffect(() => {
    if (!playing || !selected?.turns?.length) return;
    if (cursor >= selected.turns.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setCursor((c) => c + 1), 1800);
    return () => window.clearTimeout(t);
  }, [playing, cursor, selected]);

  if (loading) return <LoadingState label="Loading recordings…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="ent-page">
      <div className="ent-split-2">
        <Panel title="Call recordings" subtitle="Transcript-backed playback (audio files not stored by API)">
          {calls.length === 0 ? (
            <EmptyState title="No recordings" description="Calls with turns appear here for review." />
          ) : (
            <ul className="ent-live-list">
              {calls.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`ent-conv-item${selected?.id === c.id ? " active" : ""}`}
                    onClick={() => setParams({ id: c.id })}
                  >
                    <div className="ent-cell-strong">{c.contactName || c.phone}</div>
                    <div className="muted">
                      {c.turns?.length || 0} turns · {c.disposition || c.status}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={selected ? `Playback · ${selected.contactName || selected.phone}` : "Player"}
          actions={
            selected ? (
              <div className="ent-row-actions">
                <Button
                  size="sm"
                  onClick={() =>
                    downloadJson(`transcript-${selected.id}.json`, {
                      call: selected,
                      turns: selected.turns,
                    })
                  }
                >
                  Export JSON
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadPdfReport(
                      `Transcript ${selected.contactName || selected.phone}`,
                      (selected.turns || []).map((t) => `[${t.role}] ${t.text}`)
                    )
                  }
                >
                  Export PDF
                </Button>
              </div>
            ) : null
          }
        >
          {!selected ? (
            <EmptyState title="Select a call" />
          ) : (
            <>
              <div className="ent-player" role="group" aria-label="Transcript playback controls">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (cursor >= (selected.turns?.length || 0) - 1) setCursor(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? "Pause" : "Play transcript"}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, (selected.turns?.length || 1) - 1)}
                  value={cursor}
                  onChange={(e) => {
                    setPlaying(false);
                    setCursor(Number(e.target.value));
                  }}
                  aria-label="Transcript position"
                />
                <span className="muted">
                  Turn {selected.turns?.length ? cursor + 1 : 0} / {selected.turns?.length || 0}
                </span>
              </div>

              <div className="ent-transcript">
                {(selected.turns || []).map((t, i) => (
                  <div
                    key={t.id}
                    className={`ent-bubble ent-bubble-${t.role}${i === cursor ? " is-current" : ""}${i > cursor ? " is-dim" : ""}`}
                  >
                    <div className="ent-bubble-meta">
                      <Badge tone={t.role === "agent" ? "accent" : "info"}>{t.role}</Badge>
                      <time dateTime={t.at}>{new Date(t.at).toLocaleTimeString()}</time>
                    </div>
                    <p>{t.text}</p>
                  </div>
                ))}
              </div>

              <div className="ent-detail-actions">
                <Link className="ui-btn ui-btn-secondary ui-btn-sm" to={`/admin/conversations?id=${encodeURIComponent(selected.id)}`}>
                  Full conversation
                </Link>
                <Link className="ui-btn ui-btn-ghost ui-btn-sm" to={`/admin/calls?id=${encodeURIComponent(selected.id)}`}>
                  Open in Calls
                </Link>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
