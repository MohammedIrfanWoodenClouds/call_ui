import { useMemo, useState } from "react";
import {
  loadAgents,
  saveAgents,
  uid,
  type AgentProfile,
} from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { EmptyState } from "../ui/States";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentProfile[]>(() => loadAgents());
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<AgentProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.persona.toLowerCase().includes(query) ||
        a.languages.join(" ").includes(query)
    );
  }, [agents, q]);

  function persist(next: AgentProfile[]) {
    setAgents(next);
    saveAgents(next);
  }

  function openCreate() {
    const now = new Date().toISOString();
    setModal({
      id: uid("agent"),
      name: "",
      voice: "mal-female",
      persona: "",
      languages: ["ml", "en"],
      status: "draft",
      knowledgeBaseIds: [],
      createdAt: now,
      updatedAt: now,
    });
    setCreating(true);
  }

  function saveModal() {
    if (!modal || !modal.name.trim()) return;
    const next = { ...modal, name: modal.name.trim(), updatedAt: new Date().toISOString() };
    if (creating) persist([next, ...agents]);
    else persist(agents.map((a) => (a.id === next.id ? next : a)));
    setModal(null);
    setCreating(false);
  }

  function remove() {
    if (!deleteId) return;
    persist(agents.filter((a) => a.id !== deleteId));
    setDeleteId(null);
  }

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <input
          className="admin-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search agents…"
          aria-label="Search agents"
        />
        <Button variant="primary" onClick={openCreate}>
          New agent
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState title="No agents" action={<Button variant="primary" onClick={openCreate}>Create agent</Button>} />
        </Panel>
      ) : (
        <div className="ent-card-grid">
          {filtered.map((a) => (
            <article key={a.id} className="crm-panel ent-agent-card">
              <div className="crm-panel-head">
                <div>
                  <div className="crm-panel-title">{a.name}</div>
                  <div className="crm-panel-sub">{a.voice === "mal-female" ? "Female · Anjana voice" : "Male · Daris voice"}</div>
                </div>
                <Badge tone={a.status === "active" ? "success" : a.status === "draft" ? "warning" : "neutral"}>
                  {a.status}
                </Badge>
              </div>
              <div className="crm-panel-body">
                <p className="muted">{a.persona || "No persona yet."}</p>
                <div className="ent-tag-row">
                  {a.languages.map((l) => (
                    <Badge key={l} tone="info">
                      {l}
                    </Badge>
                  ))}
                </div>
                <div className="ent-row-actions">
                  <Button
                    size="sm"
                    onClick={() => {
                      setCreating(false);
                      setModal(a);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      persist(
                        agents.map((x) =>
                          x.id === a.id
                            ? { ...x, status: x.status === "active" ? "archived" : "active", updatedAt: new Date().toISOString() }
                            : x
                        )
                      )
                    }
                  >
                    {a.status === "active" ? "Archive" : "Activate"}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(a.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={!!modal}
        title={creating ? "New AI agent" : "Edit agent"}
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveModal} disabled={!modal?.name.trim()}>
              Save
            </Button>
          </>
        }
      >
        {modal && (
          <div className="ent-form-grid">
            <label className="admin-label">
              Name
              <input
                className="admin-input"
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
              />
            </label>
            <label className="admin-label">
              Voice
              <select
                className="admin-input"
                value={modal.voice}
                onChange={(e) => setModal({ ...modal, voice: e.target.value as AgentProfile["voice"] })}
              >
                <option value="mal-female">Anjana — female</option>
                <option value="mal-male">Daris Mathew — male</option>
              </select>
            </label>
            <label className="admin-label">
              Status
              <select
                className="admin-input"
                value={modal.status}
                onChange={(e) => setModal({ ...modal, status: e.target.value as AgentProfile["status"] })}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="admin-label">
              Persona
              <textarea
                className="admin-input"
                rows={4}
                value={modal.persona}
                onChange={(e) => setModal({ ...modal, persona: e.target.value })}
              />
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete agent"
        message="Remove this agent profile from local workspace configuration?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={remove}
      />
    </div>
  );
}
