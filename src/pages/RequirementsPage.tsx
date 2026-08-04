import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { Enquiry } from "../lib/enquiryApi";
import { exportCsvUrl, requirementsDisplay } from "../lib/enquiryApi";
import { adminFetchEnquiries } from "../lib/adminAuth";
import type { AuthOutletContext } from "../layout/RequireAuth";

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

export default function RequirementsPage() {
  const { token } = useOutletContext<AuthOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState("all");
  const [selected, setSelected] = useState<Enquiry | null>(null);

  const q = searchParams.get("q") ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetchEnquiries(token);
        if (!cancelled) setEnquiries(res.enquiries);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load requirements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const services = useMemo(() => {
    const s = new Set<string>();
    for (const e of enquiries) if (e.service) s.add(e.service);
    return Array.from(s).sort();
  }, [enquiries]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return enquiries.filter((r) => {
      if (service !== "all" && r.service !== service) return false;
      if (!query) return true;
      return (
        (r.ref ?? "").toLowerCase().includes(query) ||
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.service ?? "").toLowerCase().includes(query) ||
        (r.company ?? "").toLowerCase().includes(query) ||
        (r.phone ?? "").toLowerCase().includes(query) ||
        (r.message ?? "").toLowerCase().includes(query) ||
        (r.messageEn ?? "").toLowerCase().includes(query)
      );
    });
  }, [enquiries, q, service]);

  return (
    <div className="req-page">
      <div className="crm-toolbar">
        <input
          className="admin-input"
          value={q}
          onChange={(e) => {
            const next = e.target.value;
            if (next) setSearchParams({ q: next });
            else setSearchParams({});
          }}
          placeholder="Search requirements…"
        />
        <select className="admin-input" value={service} onChange={(e) => setService(e.target.value)}>
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <a className="crm-btn-secondary" href={exportCsvUrl()}>
          Export CSV
        </a>
      </div>

      {error && <div className="crm-error-banner">{error}</div>}

      {loading ? (
        <div className="crm-loading">
          <div className="spinner" />
          <p className="muted">Loading requirements…</p>
        </div>
      ) : (
        <div className={`req-layout${selected ? " has-drawer" : ""}`}>
          <div className="crm-panel req-table-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Service</th>
                    <th>Name</th>
                    <th>Requirement (EN)</th>
                    <th>Phone</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-table-empty muted">
                        No requirements match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const { primary } = requirementsDisplay(r);
                      return (
                        <tr
                          key={r.id}
                          className={selected?.id === r.id ? "row-on" : ""}
                          onClick={() => setSelected(r)}
                          style={{ cursor: "pointer" }}
                        >
                          <td className="mono">{r.ref || "—"}</td>
                          <td>{r.service || "—"}</td>
                          <td>{r.name || "—"}</td>
                          <td className="req-msg-cell">{primary || "—"}</td>
                          <td>{r.phone || "—"}</td>
                          <td>{fmtDateTime(r.updatedAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <aside className="crm-panel req-drawer">
              <div className="crm-panel-head">
                <div>
                  <div className="crm-panel-title">{selected.ref || "Enquiry"}</div>
                  <div className="crm-panel-sub">{selected.service}</div>
                </div>
                <button type="button" className="crm-icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="req-drawer-body">
                <dl className="req-dl">
                  <div>
                    <dt>Name</dt>
                    <dd>{selected.name || "—"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{selected.phone || "—"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{selected.email || "—"}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{selected.company || "—"}</dd>
                  </div>
                  <div className="req-dl-full">
                    <dt>Requirements (EN)</dt>
                    <dd>{requirementsDisplay(selected).primary || "—"}</dd>
                  </div>
                  {requirementsDisplay(selected).original ? (
                    <div className="req-dl-full">
                      <dt>Requirements (Original)</dt>
                      <dd>{requirementsDisplay(selected).original}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Status</dt>
                    <dd>{selected.status}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{fmtDateTime(selected.updatedAt)}</dd>
                  </div>
                </dl>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
