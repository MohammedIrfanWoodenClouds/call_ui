import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  adminFetchResponses,
  type Disposition,
  type FlatResponse,
  type ResponseMark,
} from "../lib/adminAuth";
import type { AuthOutletContext } from "../layout/RequireAuth";

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

export default function ResponsesPage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [responses, setResponses] = useState<FlatResponse[]>([]);
  const [marks, setMarks] = useState<ResponseMark[]>([]);
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [mark, setMark] = useState("all");
  const [disposition, setDisposition] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetchResponses(token, {
          mark: mark === "all" ? undefined : mark,
          disposition: disposition === "all" ? undefined : disposition,
          q: q.trim() || undefined,
        });
        if (!cancelled) {
          setResponses(res.responses);
          setMarks(res.responseMarks);
          setDispositions(res.dispositions);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load responses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [token, mark, disposition, q]);

  return (
    <div className="resp-page">
      <div className="crm-toolbar">
        <input
          className="admin-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search responses…"
        />
        <select className="admin-input" value={mark} onChange={(e) => setMark(e.target.value)}>
          <option value="all">All marks</option>
          <option value="marked">Marked only</option>
          <option value="unmarked">Unmarked only</option>
          {marks.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="admin-input" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="all">All dispositions</option>
          {dispositions.map((d) => (
            <option key={d} value={d}>
              {d.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="crm-error-banner">{error}</div>}

      {loading ? (
        <div className="crm-loading">
          <div className="spinner" />
          <p className="muted">Loading responses…</p>
        </div>
      ) : (
        <div className="crm-panel">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Response</th>
                  <th>Mark</th>
                  <th>Disposition</th>
                  <th>When</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {responses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-table-empty muted">
                      No responses match your filters.
                    </td>
                  </tr>
                ) : (
                  responses.map((r) => (
                    <tr key={r.turnId}>
                      <td>
                        <div>{r.contactName || "—"}</div>
                        <div className="mono muted">{r.phone}</div>
                      </td>
                      <td className="req-msg-cell">{r.text}</td>
                      <td>
                        {r.mark ? (
                          <span className={`mark-chip mark-${r.mark}`}>{r.mark}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{r.disposition ? r.disposition.replace(/_/g, " ") : "—"}</td>
                      <td>{fmtDateTime(r.at)}</td>
                      <td>
                        <Link className="crm-text-link" to={`/admin/calls?id=${r.callId}`}>
                          Open call
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
