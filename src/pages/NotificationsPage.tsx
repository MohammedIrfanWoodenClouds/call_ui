import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  loadNotifications,
  saveNotifications,
  type AppNotification,
} from "../lib/localStore";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Modal";
import { Badge, Panel } from "../ui/Page";
import { EmptyState } from "../ui/States";

const TONE: Record<AppNotification["type"], "info" | "success" | "warning" | "danger"> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "danger",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>(() => loadNotifications());
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const list = filter === "unread" ? items.filter((n) => !n.read) : items;
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, filter]);

  function persist(next: AppNotification[]) {
    setItems(next);
    saveNotifications(next);
  }

  function markAllRead() {
    persist(items.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="ent-page">
      <div className="crm-toolbar ent-toolbar">
        <select
          className="admin-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "unread")}
          aria-label="Filter notifications"
        >
          <option value="all">All</option>
          <option value="unread">Unread</option>
        </select>
        <Button size="sm" onClick={markAllRead}>
          Mark all read
        </Button>
        <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)}>
          Clear all
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState title="You're all caught up" description="No notifications in this filter." />
        </Panel>
      ) : (
        <Panel>
          <ul className="ent-notif-list">
            {filtered.map((n) => (
              <li key={n.id} className={`ent-notif-item${n.read ? "" : " unread"}`}>
                <div>
                  <div className="ent-notif-head">
                    <Badge tone={TONE[n.type]}>{n.type}</Badge>
                    <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                  </div>
                  <div className="ent-cell-strong">{n.title}</div>
                  <p className="muted">{n.body}</p>
                  <div className="ent-row-actions">
                    {n.href ? (
                      <Link className="ui-btn ui-btn-ghost ui-btn-sm" to={n.href} onClick={() => persist(items.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}>
                        Open
                      </Link>
                    ) : null}
                    {!n.read ? (
                      <Button size="sm" onClick={() => persist(items.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}>
                        Mark read
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => persist(items.filter((x) => x.id !== n.id))}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear notifications"
        message="Remove all notifications from this browser?"
        confirmLabel="Clear"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          persist([]);
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
