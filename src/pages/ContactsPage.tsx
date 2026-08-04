import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../lib/useAdminAuth";
import type { Enquiry } from "../lib/enquiryApi";
import { saveEnquiry } from "../lib/enquiryApi";
import { adminFetchEnquiries } from "../lib/adminAuth";
import {
  downloadCsv,
  downloadJson,
  downloadPdfReport,
  downloadXlsxCompatible,
} from "../lib/exportUtils";
import {
  loadContactTags,
  saveContactTags,
  type ContactTagMap,
} from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { Pagination, usePaged } from "../ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";

const PAGE_SIZE = 12;

export default function ContactsPage() {
  const { token } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [tags, setTags] = useState<ContactTagMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<Enquiry | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<"tag" | "export" | "campaign" | null>(null);
  const [busy, setBusy] = useState(false);

  const q = searchParams.get("q") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetchEnquiries(token);
      setRows(res.enquiries);
      setTags(loadContactTags());
    } catch (e: any) {
      setError(e?.message || "Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const services = useMemo(() => {
    const s = new Set<string>();
    for (const e of rows) if (e.service) s.add(e.service);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (service !== "all" && r.service !== service) return false;
      if (!query) return true;
      const tagStr = (tags[r.id] ?? []).join(" ").toLowerCase();
      return (
        (r.ref ?? "").toLowerCase().includes(query) ||
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.email ?? "").toLowerCase().includes(query) ||
        (r.phone ?? "").toLowerCase().includes(query) ||
        (r.company ?? "").toLowerCase().includes(query) ||
        (r.service ?? "").toLowerCase().includes(query) ||
        tagStr.includes(query)
      );
    });
  }, [rows, q, service, tags]);

  useEffect(() => {
    setPage(1);
  }, [q, service]);

  const pageRows = usePaged(filtered, page, PAGE_SIZE);
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleAllPage() {
    const next = new Set(selected);
    if (allPageSelected) pageRows.forEach((r) => next.delete(r.id));
    else pageRows.forEach((r) => next.add(r.id));
    setSelected(next);
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function exportSelected(format: "csv" | "xlsx" | "json" | "pdf") {
    const list = rows.filter((r) => selected.has(r.id));
    const source = list.length ? list : filtered;
    const headers = ["Ref", "Name", "Phone", "Email", "Company", "Service", "Status", "Tags", "Updated"];
    const data = source.map((r) => [
      r.ref,
      r.name,
      r.phone,
      r.email,
      r.company,
      r.service,
      r.status,
      (tags[r.id] ?? []).join("; "),
      r.updatedAt,
    ]);
    if (format === "csv") downloadCsv("contacts.csv", headers, data);
    else if (format === "xlsx") downloadXlsxCompatible("contacts.xlsx", headers, data);
    else if (format === "json") downloadJson("contacts.json", source);
    else
      downloadPdfReport(
        "Contacts export",
        source.map((r) => `${r.name} · ${r.phone} · ${r.service} · ${r.ref}`)
      );
  }

  function applyBulkTag() {
    const next = { ...tags };
    for (const id of selected) {
      const cur = new Set(next[id] ?? []);
      cur.add("bulk");
      next[id] = Array.from(cur);
    }
    setTags(next);
    saveContactTags(next);
    setBulkConfirm(null);
  }

  async function refreshContact(id: string) {
    setBusy(true);
    try {
      await saveEnquiry({ id });
      await load();
    } catch {
      /* ignore — refresh only */
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading contacts…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <input
          className="admin-input"
          value={q}
          onChange={(e) => {
            const next = e.target.value;
            if (next) setSearchParams({ q: next });
            else setSearchParams({});
          }}
          placeholder="Search contacts…"
          aria-label="Search contacts"
        />
        <select className="admin-input" value={service} onChange={(e) => setService(e.target.value)} aria-label="Filter by service">
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Link className="ui-btn ui-btn-secondary ui-btn-md" to="/admin/import">
          Import
        </Link>
        <div className="ent-export-menu">
          <Button size="sm" onClick={() => exportSelected("csv")}>
            Export CSV
          </Button>
          <Button size="sm" onClick={() => exportSelected("xlsx")}>
            XLSX
          </Button>
          <Button size="sm" onClick={() => exportSelected("json")}>
            JSON
          </Button>
          <Button size="sm" onClick={() => exportSelected("pdf")}>
            PDF
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="ent-bulk-bar" role="region" aria-label="Bulk actions">
          <span>{selected.size} selected</span>
          <Button size="sm" onClick={() => setBulkConfirm("tag")}>
            Tag selected
          </Button>
          <Button size="sm" onClick={() => exportSelected("csv")}>
            Export selected
          </Button>
          <Link className="ui-btn ui-btn-primary ui-btn-sm" to={`/admin/campaigns?new=1&contacts=${Array.from(selected).join(",")}`}>
            Add to campaign
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            title="No contacts found"
            description="Import a CSV or capture leads from the Call Bot."
            action={
              <Link className="ui-btn ui-btn-primary ui-btn-md" to="/admin/import">
                Import contacts
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className={`req-layout${drawer ? " has-drawer" : ""}`}>
          <div className="crm-panel req-table-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleAllPage}
                        aria-label="Select all on page"
                      />
                    </th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Company</th>
                    <th>Service</th>
                    <th>Tags</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      className={drawer?.id === r.id ? "row-on" : ""}
                      onClick={() => setDrawer(r)}
                      style={{ cursor: "pointer" }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Select ${r.name || r.ref}`}
                        />
                      </td>
                      <td>
                        <div className="ent-cell-strong">{r.name || "—"}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.ref}
                        </div>
                      </td>
                      <td>{r.phone || "—"}</td>
                      <td>{r.company || "—"}</td>
                      <td>
                        <Badge tone="info">{r.service || "—"}</Badge>
                      </td>
                      <td>
                        {(tags[r.id] ?? []).length ? (
                          (tags[r.id] ?? []).map((t) => (
                            <Badge key={t} tone="neutral">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </div>

          {drawer && (
            <aside className="crm-panel req-drawer" aria-label="Contact details">
              <div className="crm-panel-head">
                <div>
                  <div className="crm-panel-title">{drawer.name || "Contact"}</div>
                  <div className="crm-panel-sub">{drawer.ref}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setDrawer(null)}>
                  Close
                </Button>
              </div>
              <div className="crm-panel-body ent-detail-grid">
                <Field label="Phone" value={drawer.phone} />
                <Field label="Email" value={drawer.email} />
                <Field label="Company" value={drawer.company} />
                <Field label="Service" value={drawer.service} />
                <Field label="Status" value={drawer.status} />
                <Field label="Message" value={drawer.messageEn || drawer.message} />
                <div className="ent-detail-actions">
                  <Link className="ui-btn ui-btn-secondary ui-btn-sm" to={`/admin/calls?phone=${encodeURIComponent(drawer.phone || "")}`}>
                    Open in Calls
                  </Link>
                  <Button size="sm" loading={busy} onClick={() => void refreshContact(drawer.id)}>
                    Refresh
                  </Button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirm === "tag"}
        title="Tag selected contacts"
        message={`Add the “bulk” tag to ${selected.size} contact(s)? Tags are stored locally in this browser.`}
        confirmLabel="Apply tag"
        onCancel={() => setBulkConfirm(null)}
        onConfirm={applyBulkTag}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="admin-label">{label}</div>
      <div>{value?.trim() ? value : "—"}</div>
    </div>
  );
}
