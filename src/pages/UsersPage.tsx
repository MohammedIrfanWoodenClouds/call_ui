import { useMemo, useState } from "react";
import { useAdminAuth } from "../lib/useAdminAuth";
import { loadUsers, saveUsers, uid, type CrmUser } from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { EmptyState } from "../ui/States";

const ROLE_TONE: Record<CrmUser["role"], "accent" | "info" | "success" | "neutral"> = {
  owner: "accent",
  admin: "info",
  agent: "success",
  viewer: "neutral",
};

export default function UsersPage() {
  const { email } = useAdminAuth();
  const [users, setUsers] = useState<CrmUser[]>(() => loadUsers(email));
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "agent" as CrmUser["role"] });

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.role.includes(query)
    );
  }, [users, q]);

  function persist(next: CrmUser[]) {
    setUsers(next);
    saveUsers(next);
  }

  function invite() {
    if (!form.email.trim()) return;
    const u: CrmUser = {
      id: uid("user"),
      name: form.name.trim() || form.email.split("@")[0] || "User",
      email: form.email.trim().toLowerCase(),
      role: form.role,
      status: "invited",
      createdAt: new Date().toISOString(),
    };
    persist([u, ...users]);
    setModalOpen(false);
    setForm({ name: "", email: "", role: "agent" });
  }

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <input
          className="admin-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users…"
          aria-label="Search users"
        />
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Invite user
        </Button>
      </div>

      <Panel title="Roles" subtitle="Local workspace roles — authentication still uses the existing admin login API.">
        <div className="ent-role-grid">
          <div>
            <strong>Owner</strong>
            <p className="muted">Full access, billing, and user management.</p>
          </div>
          <div>
            <strong>Admin</strong>
            <p className="muted">CRM, campaigns, and settings.</p>
          </div>
          <div>
            <strong>Agent</strong>
            <p className="muted">Calls, contacts, and live monitor.</p>
          </div>
          <div>
            <strong>Viewer</strong>
            <p className="muted">Read-only dashboards and reports.</p>
          </div>
        </div>
      </Panel>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState title="No users" />
        </Panel>
      ) : (
        <Panel title="Team">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td className="ent-cell-strong">{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                    </td>
                    <td>
                      <Badge tone={u.status === "active" ? "success" : u.status === "invited" ? "warning" : "neutral"}>
                        {u.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="ent-row-actions">
                        <select
                          className="admin-input"
                          value={u.role}
                          disabled={u.role === "owner"}
                          onChange={(e) =>
                            persist(
                              users.map((x) =>
                                x.id === u.id ? { ...x, role: e.target.value as CrmUser["role"] } : x
                              )
                            )
                          }
                          aria-label={`Role for ${u.email}`}
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="agent">agent</option>
                          <option value="viewer">viewer</option>
                        </select>
                        {u.role !== "owner" ? (
                          <Button size="sm" variant="danger" onClick={() => setDeleteId(u.id)}>
                            Remove
                          </Button>
                        ) : null}
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
        title="Invite user"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={invite} disabled={!form.email.trim()}>
              Invite
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
            Email
            <input
              className="admin-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="admin-label">
            Role
            <select
              className="admin-input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as CrmUser["role"] })}
            >
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <p className="muted">
            Invites are stored locally for UI workflow. Sign-in still uses the existing admin credentials API.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Remove user"
        message="Remove this user from the local team list?"
        confirmLabel="Remove"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          persist(users.filter((u) => u.id !== deleteId));
          setDeleteId(null);
        }}
      />
    </div>
  );
}
