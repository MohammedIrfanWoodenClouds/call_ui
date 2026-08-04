import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../lib/useAdminAuth";
import {
  adminFetchCalls,
  adminMarkTurn,
  adminStartMimicCall,
  adminUpdateCall,
  type Disposition,
  type MimicCall,
  type ResponseMark,
} from "../lib/adminAuth";

const DISPOSITIONS: { id: Disposition; label: string }[] = [
  { id: "interested", label: "Interested" },
  { id: "not_interested", label: "Not interested" },
  { id: "callback", label: "Callback" },
  { id: "wrong_number", label: "Wrong number" },
  { id: "no_answer", label: "No answer" },
  { id: "voicemail", label: "Voicemail" },
  { id: "converted", label: "Converted" },
  { id: "do_not_call", label: "Do not call" },
];

const MARKS: { id: ResponseMark; label: string }[] = [
  { id: "positive", label: "Positive" },
  { id: "negative", label: "Negative" },
  { id: "objection", label: "Objection" },
  { id: "question", label: "Question" },
  { id: "commitment", label: "Commitment" },
  { id: "neutral", label: "Neutral" },
];

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

function dispositionLabel(d: string): string {
  return DISPOSITIONS.find((x) => x.id === d)?.label || d || "Unmarked";
}

export default function CallDashboard() {
  const { token } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [calls, setCalls] = useState<MimicCall[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [dialing, setDialing] = useState(false);
  const [phase, setPhase] = useState<"idle" | "ringing" | "live" | "done">("idle");
  const [visibleTurns, setVisibleTurns] = useState(0);
  const revealTimer = useRef<number | null>(null);

  const [tagInput, setTagInput] = useState("");
  const [savingCrm, setSavingCrm] = useState(false);

  const active = useMemo(
    () => calls.find((c) => c.id === activeId) || null,
    [calls, activeId]
  );

  const refresh = useCallback(async () => {
    const res = await adminFetchCalls(token);
    setCalls(res.calls);
    return res.calls;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await refresh();
        if (cancelled) return;
        const deepLink = new URLSearchParams(window.location.hash.split("?")[1] || "").get("id")
          || searchParams.get("id");
        if (deepLink && list.some((c) => c.id === deepLink)) {
          setActiveId(deepLink);
          setPhase("done");
          const c = list.find((x) => x.id === deepLink);
          setVisibleTurns(c?.turns.length ?? 0);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load call dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revealTimer.current) window.clearInterval(revealTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refresh]);

  function replaceCall(updated: MimicCall) {
    setCalls((prev) => {
      const i = prev.findIndex((c) => c.id === updated.id);
      if (i < 0) return [updated, ...prev];
      const next = [...prev];
      next[i] = updated;
      return next;
    });
  }

  function startReveal(call: MimicCall) {
    if (revealTimer.current) window.clearInterval(revealTimer.current);
    setVisibleTurns(0);
    setPhase("live");
    let n = 0;
    revealTimer.current = window.setInterval(() => {
      n += 1;
      setVisibleTurns(n);
      if (n >= call.turns.length) {
        if (revealTimer.current) window.clearInterval(revealTimer.current);
        revealTimer.current = null;
        setPhase("done");
      }
    }, 900);
  }

  async function onDial(e: React.FormEvent) {
    e.preventDefault();
    if (dialing) return;
    setError(null);
    setDialing(true);
    setPhase("ringing");
    setVisibleTurns(0);
    try {
      await new Promise((r) => setTimeout(r, 1400));
      const { call } = await adminStartMimicCall(token, phone, contactName || undefined);
      replaceCall(call);
      setActiveId(call.id);
      setSearchParams({ id: call.id });
      setPhone("");
      setContactName("");
      startReveal(call);
    } catch (err: any) {
      setPhase("idle");
      setError(err?.message || "Call failed.");
    } finally {
      setDialing(false);
    }
  }

  async function saveCrm(patch: Parameters<typeof adminUpdateCall>[2]) {
    if (!active) return;
    setSavingCrm(true);
    setError(null);
    try {
      const { call } = await adminUpdateCall(token, active.id, patch);
      replaceCall(call);
    } catch (err: any) {
      setError(err?.message || "Could not save CRM fields.");
    } finally {
      setSavingCrm(false);
    }
  }

  async function onMarkTurn(turnId: string, mark: ResponseMark | null) {
    if (!active) return;
    try {
      const { call } = await adminMarkTurn(token, active.id, turnId, mark);
      replaceCall(call);
    } catch (err: any) {
      setError(err?.message || "Could not mark response.");
    }
  }

  function addTag() {
    if (!active) return;
    const t = tagInput.trim();
    if (!t) return;
    const tags = Array.from(new Set([...(active.tags || []), t]));
    setTagInput("");
    void saveCrm({ tags });
  }

  function removeTag(tag: string) {
    if (!active) return;
    void saveCrm({ tags: active.tags.filter((x) => x !== tag) });
  }

  const shownTurns = active
    ? active.turns.slice(
        0,
        Math.max(visibleTurns, activeId === active.id && phase === "idle" ? active.turns.length : visibleTurns)
      )
    : [];
  const displayTurns =
    active && phase !== "ringing" && phase !== "live"
      ? active.turns
      : shownTurns.length
        ? shownTurns
        : active && phase === "idle"
          ? active.turns
          : [];

  function selectCall(id: string) {
    if (revealTimer.current) {
      window.clearInterval(revealTimer.current);
      revealTimer.current = null;
    }
    setActiveId(id);
    setPhase("done");
    setSearchParams({ id });
    const c = calls.find((x) => x.id === id);
    setVisibleTurns(c?.turns.length ?? 0);
  }

  if (loading) {
    return (
      <div className="crm-loading">
        <div className="spinner" />
        <p className="muted">Loading calls…</p>
      </div>
    );
  }

  return (
    <div className="call-dash-wrap">
      {error && <div className="crm-error-banner">{error}</div>}

      <div className="call-dash">
        <section className="call-col call-col-list">
          <form className="call-dialer" onSubmit={onDial}>
            <div className="call-dialer-title">New call</div>
            <label className="admin-label">
              Phone number
              <input
                className="admin-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                required
              />
            </label>
            <label className="admin-label">
              Contact name (optional)
              <input
                className="admin-input"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Lead name"
              />
            </label>
            <button className="primary call-dial-btn" type="submit" disabled={dialing || !phone.trim()}>
              {dialing || phase === "ringing" ? "Calling…" : "Call (AI mimic)"}
            </button>
            <div className="call-dial-hint">
              Mimic mode: AI generates agent + customer dialogue. Real Plivo outbound can replace this later.
            </div>
          </form>

          <div className="call-history">
            <div className="call-history-title">Call history</div>
            {calls.length === 0 ? (
              <div className="muted call-empty">No calls yet. Dial a number to start.</div>
            ) : (
              calls.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`call-history-item ${c.id === activeId ? "on" : ""}`}
                  onClick={() => selectCall(c.id)}
                >
                  <div className="call-history-top">
                    <span className="mono">{c.phone}</span>
                    <span className={`call-disp call-disp-${c.disposition || "none"}`}>
                      {dispositionLabel(c.disposition)}
                    </span>
                  </div>
                  <div className="call-history-meta">
                    {c.contactName} · {fmtTime(c.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="call-col call-col-transcript">
          {!active && phase !== "ringing" ? (
            <div className="call-empty-stage">
              <div className="call-empty-stage-title">No active call</div>
              <p className="muted">Enter a number and press Call to start an AI-mimicked conversation.</p>
            </div>
          ) : (
            <>
              <div className="call-live-head">
                <div>
                  <div className="call-live-phone mono">{active?.phone || phone}</div>
                  <div className="muted">
                    {phase === "ringing"
                      ? "Ringing…"
                      : phase === "live"
                        ? "Connected · AI responding…"
                        : `${active?.contactName || "Contact"} · ${active?.scenario || ""}`}
                  </div>
                </div>
                <div className={`call-phase call-phase-${phase}`}>
                  {phase === "ringing" ? "RINGING" : phase === "live" ? "LIVE" : "ENDED"}
                </div>
              </div>

              <div className="call-transcript">
                {phase === "ringing" && (
                  <div className="call-ringing">
                    <span className="call-ring-dot" />
                    Connecting to {phone || active?.phone}…
                  </div>
                )}
                {(phase === "live" ? shownTurns : displayTurns).map((t) => (
                  <div key={t.id} className={`call-bubble call-bubble-${t.role}`}>
                    <div className="call-bubble-role">{t.role === "agent" ? "AI Agent" : "Customer"}</div>
                    <div className="call-bubble-text">{t.text}</div>
                    {t.role === "customer" && (
                      <div className="call-marks">
                        {MARKS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`call-mark ${t.mark === m.id ? "on" : ""}`}
                            onClick={() => onMarkTurn(t.id, t.mark === m.id ? null : m.id)}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {t.mark && (
                      <div className="call-mark-active">
                        Marked: <strong>{t.mark}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="call-col call-col-crm">
          <div className="call-crm-title">CRM</div>
          {!active ? (
            <div className="muted">Select or start a call to mark disposition and tags.</div>
          ) : (
            <div className="call-crm-body">
              <label className="admin-label">
                Contact
                <input
                  className="admin-input"
                  value={active.contactName}
                  onChange={(e) => replaceCall({ ...active, contactName: e.target.value })}
                  onBlur={() => saveCrm({ contactName: active.contactName })}
                />
              </label>

              <div className="admin-label">Disposition</div>
              <div className="call-disp-grid">
                {DISPOSITIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`call-disp-btn ${active.disposition === d.id ? "on" : ""}`}
                    disabled={savingCrm}
                    onClick={() => saveCrm({ disposition: d.id })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <label className="admin-label">
                Lead score ({active.leadScore})
                <input
                  className="admin-input"
                  type="range"
                  min={0}
                  max={100}
                  value={active.leadScore}
                  onChange={(e) => replaceCall({ ...active, leadScore: Number(e.target.value) })}
                  onMouseUp={() => saveCrm({ leadScore: active.leadScore })}
                  onTouchEnd={() => saveCrm({ leadScore: active.leadScore })}
                />
              </label>

              <label className="admin-label">
                Follow-up date
                <input
                  className="admin-input"
                  type="date"
                  value={active.followUpAt?.slice(0, 10) || ""}
                  onChange={(e) => saveCrm({ followUpAt: e.target.value })}
                />
              </label>

              <div className="admin-label">Tags</div>
              <div className="call-tags">
                {active.tags.map((t) => (
                  <button key={t} type="button" className="call-tag" onClick={() => removeTag(t)}>
                    {t} ×
                  </button>
                ))}
              </div>
              <div className="call-tag-row">
                <input
                  className="admin-input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add tag…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button className="ghost" type="button" onClick={addTag}>
                  Add
                </button>
              </div>

              <label className="admin-label">
                Notes
                <textarea
                  className="admin-input call-notes"
                  rows={5}
                  value={active.notes}
                  onChange={(e) => replaceCall({ ...active, notes: e.target.value })}
                  onBlur={() => saveCrm({ notes: active.notes })}
                  placeholder="CRM notes for this lead…"
                />
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
