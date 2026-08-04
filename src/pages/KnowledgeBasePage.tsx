import { useMemo, useState } from "react";
import { loadKb, saveKb, uid, type KbArticle } from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { Pagination, usePaged } from "../ui/Pagination";
import { EmptyState } from "../ui/States";

const PAGE_SIZE = 8;

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<KbArticle[]>(() => loadKb());
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<KbArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const s = new Set(articles.map((a) => a.category).filter(Boolean));
    return Array.from(s).sort();
  }, [articles]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return articles.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (!query) return true;
      return (
        a.title.toLowerCase().includes(query) ||
        a.content.toLowerCase().includes(query) ||
        a.tags.join(" ").toLowerCase().includes(query)
      );
    });
  }, [articles, q, category]);

  const pageRows = usePaged(filtered, page, PAGE_SIZE);

  function persist(next: KbArticle[]) {
    setArticles(next);
    saveKb(next);
  }

  function openCreate() {
    setCreating(true);
    setModal({
      id: uid("kb"),
      title: "",
      category: "General",
      content: "",
      tags: [],
      updatedAt: new Date().toISOString(),
    });
  }

  function saveModal() {
    if (!modal || !modal.title.trim()) return;
    const next = { ...modal, title: modal.title.trim(), updatedAt: new Date().toISOString() };
    if (creating) persist([next, ...articles]);
    else persist(articles.map((a) => (a.id === next.id ? next : a)));
    setModal(null);
    setCreating(false);
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
          placeholder="Search knowledge…"
          aria-label="Search knowledge base"
        />
        <select
          className="admin-input"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          aria-label="Filter category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button variant="primary" onClick={openCreate}>
          New article
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState title="No articles" action={<Button variant="primary" onClick={openCreate}>Add article</Button>} />
        </Panel>
      ) : (
        <Panel>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Tags</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="ent-cell-strong">{a.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {a.content.slice(0, 80)}…
                      </div>
                    </td>
                    <td>
                      <Badge tone="info">{a.category}</Badge>
                    </td>
                    <td>
                      {a.tags.map((t) => (
                        <Badge key={t} tone="neutral">
                          {t}
                        </Badge>
                      ))}
                    </td>
                    <td>{new Date(a.updatedAt).toLocaleString()}</td>
                    <td>
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
                        <Button size="sm" variant="danger" onClick={() => setDeleteId(a.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </Panel>
      )}

      <Modal
        open={!!modal}
        title={creating ? "New article" : "Edit article"}
        size="lg"
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveModal} disabled={!modal?.title.trim()}>
              Save
            </Button>
          </>
        }
      >
        {modal && (
          <div className="ent-form-grid">
            <label className="admin-label">
              Title
              <input
                className="admin-input"
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
              />
            </label>
            <label className="admin-label">
              Category
              <input
                className="admin-input"
                value={modal.category}
                onChange={(e) => setModal({ ...modal, category: e.target.value })}
              />
            </label>
            <label className="admin-label">
              Tags (comma-separated)
              <input
                className="admin-input"
                value={modal.tags.join(", ")}
                onChange={(e) =>
                  setModal({
                    ...modal,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="admin-label">
              Content
              <textarea
                className="admin-input"
                rows={8}
                value={modal.content}
                onChange={(e) => setModal({ ...modal, content: e.target.value })}
              />
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete article"
        message="Remove this knowledge article from the local store?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          persist(articles.filter((a) => a.id !== deleteId));
          setDeleteId(null);
        }}
      />
    </div>
  );
}
