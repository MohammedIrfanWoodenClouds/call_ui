import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../lib/useAdminAuth";
import { adminFetchEnquiries } from "../lib/adminAuth";
import {
  loadAgents,
  loadCampaigns,
  saveCampaigns,
  uid,
  type Campaign,
  type CampaignStatus,
} from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { Pagination, usePaged } from "../ui/Pagination";
import { EmptyState } from "../ui/States";

const PAGE_SIZE = 10;

const STATUS_TONE: Record<CampaignStatus, "neutral" | "info" | "success" | "warning" | "accent"> = {
  draft: "neutral",
  scheduled: "info",
  running: "accent",
  paused: "warning",
  completed: "success",
};

export default function CampaignsPage() {
  const { token } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", agentId: "", contactIds: "" as string });

  const agents = useMemo(() => loadAgents(), []);

  useEffect(() => {
    setCampaigns(loadCampaigns());
    void adminFetchEnquiries(token)
      .then((r) => setContactCount(r.enquiries.length))
      .catch(() => setContactCount(0));
  }, [token]);

  useEffect(() => {
    if (params.get("new") === "1") {
      const ids = params.get("contacts") || "";
      setForm({
        name: "",
        description: "",
        agentId: agents[0]?.id || "",
        contactIds: ids,
      });
      setModalOpen(true);
      params.delete("new");
      params.delete("contacts");
      setParams(params, { replace: true });
    }
  }, [params, setParams, agents]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!query) return true;
      return c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query);
    });
  }, [campaigns, q, status]);

  const pageRows = usePaged(filtered, page, PAGE_SIZE);

  function persist(next: Campaign[]) {
    setCampaigns(next);
    saveCampaigns(next);
  }

  function createCampaign() {
    const now = new Date().toISOString();
    const ids = form.contactIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const c: Campaign = {
      id: uid("camp"),
      name: form.name.trim() || "Untitled campaign",
      description: form.description.trim(),
      status: "draft",
      agentId: form.agentId || agents[0]?.id || "",
      contactIds: ids,
      scheduledAt: "",
      createdAt: now,
      updatedAt: now,
      stats: { dialed: 0, answered: 0, converted: 0 },
    };
    persist([c, ...campaigns]);
    setModalOpen(false);
  }

  function setStatusOf(id: string, next: CampaignStatus) {
    persist(
      campaigns.map((c) =>
        c.id === id
          ? {
              ...c,
              status: next,
              updatedAt: new Date().toISOString(),
              stats:
                next === "running"
                  ? {
                      dialed: Math.max(c.stats.dialed, c.contactIds.length || 1),
                      answered: c.stats.answered || Math.floor((c.contactIds.length || 1) * 0.6),
                      converted: c.stats.converted,
                    }
                  : c.stats,
            }
          : c
      )
    );
  }

  function removeCampaign() {
    if (!deleteId) return;
    persist(campaigns.filter((c) => c.id !== deleteId));
    setDeleteId(null);
  }

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
          placeholder="Search campaigns…"
          aria-label="Search campaigns"
        />
        <select className="admin-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="running">Running</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
        <Button
          variant="primary"
          onClick={() => {
            setForm({ name: "", description: "", agentId: agents[0]?.id || "", contactIds: "" });
            setModalOpen(true);
          }}
        >
          New campaign
        </Button>
      </div>

      <div className="kpi-row ent-kpi-compact">
        <article className="kpi-card">
          <div className="kpi-label">Campaigns</div>
          <div className="kpi-value">{campaigns.length}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Running</div>
          <div className="kpi-value">{campaigns.filter((c) => c.status === "running").length}</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Addressable contacts</div>
          <div className="kpi-value">{contactCount}</div>
        </article>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            title="No campaigns yet"
            description="Create a bulk AI calling campaign from contacts."
            action={
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                Create campaign
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Contacts</th>
                  <th>Dialed</th>
                  <th>Answered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const agent = agents.find((a) => a.id === c.agentId);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="ent-cell-strong">{c.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.description || "—"}
                        </div>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                      </td>
                      <td>{agent?.name || "—"}</td>
                      <td>{c.contactIds.length || "—"}</td>
                      <td>{c.stats.dialed}</td>
                      <td>{c.stats.answered}</td>
                      <td>
                        <div className="ent-row-actions">
                          {c.status === "draft" || c.status === "paused" || c.status === "scheduled" ? (
                            <Button size="sm" variant="primary" onClick={() => setStatusOf(c.id, "running")}>
                              Start
                            </Button>
                          ) : null}
                          {c.status === "running" ? (
                            <Button size="sm" onClick={() => setStatusOf(c.id, "paused")}>
                              Pause
                            </Button>
                          ) : null}
                          {c.status === "running" || c.status === "paused" ? (
                            <Button size="sm" onClick={() => setStatusOf(c.id, "completed")}>
                              Complete
                            </Button>
                          ) : null}
                          <Link className="ui-btn ui-btn-ghost ui-btn-sm" to="/admin/live">
                            Monitor
                          </Link>
                          <Button size="sm" variant="danger" onClick={() => setDeleteId(c.id)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </Panel>
      )}

      <Modal
        open={modalOpen}
        title="New AI calling campaign"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={createCampaign} disabled={!form.name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="ent-form-grid">
          <label className="admin-label">
            Name
            <input
              className="admin-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Website leads — March"
            />
          </label>
          <label className="admin-label">
            Description
            <textarea
              className="admin-input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="admin-label">
            AI agent
            <select
              className="admin-input"
              value={form.agentId}
              onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-label">
            Contact IDs (comma-separated, optional)
            <input
              className="admin-input"
              value={form.contactIds}
              onChange={(e) => setForm((f) => ({ ...f, contactIds: e.target.value }))}
              placeholder="Select from Contacts → Add to campaign"
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete campaign"
        message="This removes the campaign from this browser. Call history is unchanged."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={removeCampaign}
      />
    </div>
  );
}
