import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconSearch } from "../layout/icons";

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  path?: string;
  action?: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
};

export function CommandPalette({ open, onClose, items }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(query) ||
        i.group.toLowerCase().includes(query) ||
        (i.hint ?? "").toLowerCase().includes(query)
    );
  }, [items, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  function run(item: CommandItem) {
    onClose();
    if (item.action) item.action();
    else if (item.path) navigate(item.path);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[active];
      if (item) run(item);
    }
  }

  if (!open) return null;

  const groups = Array.from(new Set(filtered.map((i) => i.group)));

  return (
    <div className="cmd-root" role="presentation">
      <button type="button" className="cmd-backdrop" aria-label="Close command palette" onClick={onClose} />
      <div
        className="cmd-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="cmd-search">
          <IconSearch className="cmd-search-icon" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, actions, contacts…"
            aria-label="Command search"
            aria-controls="cmd-list"
          />
          <kbd className="cmd-kbd">Esc</kbd>
        </div>
        <div id="cmd-list" className="cmd-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="cmd-empty">No matches</div>
          ) : (
            groups.map((group) => (
              <div key={group} className="cmd-group">
                <div className="cmd-group-label">{group}</div>
                {filtered
                  .filter((i) => i.group === group)
                  .map((item) => {
                    const idx = filtered.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={idx === active}
                        className={`cmd-item${idx === active ? " active" : ""}`}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => run(item)}
                      >
                        <span>{item.label}</span>
                        {item.hint ? <span className="cmd-hint">{item.hint}</span> : null}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
