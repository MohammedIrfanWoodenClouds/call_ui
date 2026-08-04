import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../lib/useAdminAuth";
import { adminFetchCalls, adminFetchEnquiries, adminFetchStats } from "../lib/adminAuth";
import {
  downloadCsv,
  downloadJson,
  downloadPdfReport,
  downloadXlsxCompatible,
} from "../lib/exportUtils";
import { loadAgents, loadCampaigns, loadReports, saveReports, uid, type SavedReport } from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { EmptyState, LoadingState } from "../ui/States";

export default function ReportsPage() {
  const { token } = useAdminAuth();
  const [reports, setReports] = useState<SavedReport[]>(() => loadReports());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; type: SavedReport["type"]; range: SavedReport["range"] }>({
    name: "",
    type: "calls",
    range: "7d",
  });

  const persist = useCallback((next: SavedReport[]) => {
    setReports(next);
    saveReports(next);
  }, []);

  async function runReport(report: SavedReport, format: "csv" | "xlsx" | "json" | "pdf") {
    setLoading(true);
    setError(null);
    try {
      if (report.type === "contacts") {
        const { enquiries } = await adminFetchEnquiries(token);
        const headers = ["Ref", "Name", "Phone", "Email", "Service", "Status"];
        const rows = enquiries.map((e) => [e.ref, e.name, e.phone, e.email, e.service, e.status]);
        if (format === "csv") downloadCsv(`${report.name}.csv`, headers, rows);
        else if (format === "xlsx") downloadXlsxCompatible(`${report.name}.xlsx`, headers, rows);
        else if (format === "json") downloadJson(`${report.name}.json`, enquiries);
        else downloadPdfReport(report.name, rows.map((r) => r.join(" · ")));
      } else if (report.type === "calls") {
        const { calls } = await adminFetchCalls(token);
        const headers = ["Id", "Contact", "Phone", "Status", "Disposition"];
        const rows = calls.map((c) => [c.id, c.contactName, c.phone, c.status, c.disposition]);
        if (format === "csv") downloadCsv(`${report.name}.csv`, headers, rows);
        else if (format === "xlsx") downloadXlsxCompatible(`${report.name}.xlsx`, headers, rows);
        else if (format === "json") downloadJson(`${report.name}.json`, calls);
        else downloadPdfReport(report.name, rows.map((r) => r.join(" · ")));
      } else if (report.type === "campaigns") {
        const camps = loadCampaigns();
        const headers = ["Name", "Status", "Contacts", "Dialed", "Answered"];
        const rows = camps.map((c) => [c.name, c.status, c.contactIds.length, c.stats.dialed, c.stats.answered]);
        if (format === "csv") downloadCsv(`${report.name}.csv`, headers, rows);
        else if (format === "xlsx") downloadXlsxCompatible(`${report.name}.xlsx`, headers, rows);
        else if (format === "json") downloadJson(`${report.name}.json`, camps);
        else downloadPdfReport(report.name, rows.map((r) => r.join(" · ")));
      } else {
        const agents = loadAgents();
        const headers = ["Name", "Voice", "Status"];
        const rows = agents.map((a) => [a.name, a.voice, a.status]);
        if (format === "csv") downloadCsv(`${report.name}.csv`, headers, rows);
        else if (format === "xlsx") downloadXlsxCompatible(`${report.name}.xlsx`, headers, rows);
        else if (format === "json") downloadJson(`${report.name}.json`, agents);
        else downloadPdfReport(report.name, rows.map((r) => r.join(" · ")));
      }
      // touch stats endpoint so report “run” exercises live APIs when relevant
      if (report.type === "calls" || report.type === "contacts") await adminFetchStats(token);
    } catch (e: any) {
      setError(e?.message || "Report failed.");
    } finally {
      setLoading(false);
    }
  }

  function createReport() {
    const r: SavedReport = {
      id: uid("report"),
      name: form.name.trim() || `${form.type} report`,
      type: form.type,
      range: form.range,
      createdAt: new Date().toISOString(),
    };
    persist([r, ...reports]);
    setModalOpen(false);
  }

  const sorted = useMemo(
    () => [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports]
  );

  useEffect(() => {
    if (reports.length === 0) {
      persist([
        {
          id: uid("report"),
          name: "Weekly calls",
          type: "calls",
          range: "7d",
          createdAt: new Date().toISOString(),
        },
        {
          id: uid("report"),
          name: "Contact export",
          type: "contacts",
          range: "30d",
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          New report
        </Button>
      </div>

      {error && <div className="crm-error-banner">{error}</div>}
      {loading && <LoadingState label="Generating report…" />}

      {sorted.length === 0 ? (
        <Panel>
          <EmptyState title="No saved reports" action={<Button variant="primary" onClick={() => setModalOpen(true)}>Create report</Button>} />
        </Panel>
      ) : (
        <Panel title="Saved reports">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Range</th>
                  <th>Created</th>
                  <th>Export</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td className="ent-cell-strong">{r.name}</td>
                    <td>
                      <Badge tone="info">{r.type}</Badge>
                    </td>
                    <td>{r.range}</td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="ent-row-actions">
                        <Button size="sm" onClick={() => void runReport(r, "csv")}>
                          CSV
                        </Button>
                        <Button size="sm" onClick={() => void runReport(r, "xlsx")}>
                          XLSX
                        </Button>
                        <Button size="sm" onClick={() => void runReport(r, "json")}>
                          JSON
                        </Button>
                        <Button size="sm" onClick={() => void runReport(r, "pdf")}>
                          PDF
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteId(r.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Modal
        open={modalOpen}
        title="Create report"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={createReport}>
              Save
            </Button>
          </>
        }
      >
        <div className="ent-form-grid">
          <label className="admin-label">
            Name
            <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="admin-label">
            Type
            <select
              className="admin-input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as SavedReport["type"] })}
            >
              <option value="calls">Calls</option>
              <option value="contacts">Contacts</option>
              <option value="campaigns">Campaigns</option>
              <option value="agents">Agents</option>
            </select>
          </label>
          <label className="admin-label">
            Range
            <select
              className="admin-input"
              value={form.range}
              onChange={(e) => setForm({ ...form, range: e.target.value as SavedReport["range"] })}
            >
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
            </select>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete report"
        message="Remove this saved report definition?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          persist(reports.filter((r) => r.id !== deleteId));
          setDeleteId(null);
        }}
      />
    </div>
  );
}
