import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Voice } from "../types";
import { useVoiceSession } from "../lib/useVoiceSession";
import { ConversationStateManager } from "../lib/conversationState";
import {
  getEnquiryConfig,
  getEnquiries,
  saveEnquiry,
  completeEnquiry,
  exportCsvUrl,
  type EnquiryConfig,
  type Enquiry,
} from "../lib/enquiryApi";
import EnquiryCard from "../components/EnquiryCard";
import ConversationPane from "../components/ConversationPane";
import LatencyTable from "../components/LatencyTable";

/** Malayalam digit words so the agent can read a saved mobile aloud. */
const ML_DIGIT_WORDS = [
  "പൂജ്യം",
  "ഒന്ന്",
  "രണ്ട്",
  "മൂന്ന്",
  "നാല്",
  "അഞ്ച്",
  "ആറ്",
  "ഏഴ്",
  "എട്ട്",
  "ഒമ്പത്",
] as const;

/** Model-facing enquiry — keep digits + speakable phone for TTS readback. */
function enquiryForAgent(enq: Enquiry) {
  const phone = (enq.phone || "").replace(/\D/g, "");
  const phoneForSpeech = phone
    .split("")
    .map((ch) => ML_DIGIT_WORDS[Number(ch)] ?? ch)
    .join(" ");
  return {
    id: enq.id,
    ref: enq.ref,
    service: enq.service,
    name: enq.name,
    phone,
    phoneForSpeech,
    email: enq.email,
    company: enq.company,
    message: enq.message,
    messageEn: enq.messageEn,
    status: enq.status,
  };
}

function VoiceOrb({
  agentSpeaking,
  learnerSpeaking,
  active,
}: {
  agentSpeaking: boolean;
  learnerSpeaking: boolean;
  active: boolean;
}) {
  const state = !active ? "idle" : learnerSpeaking ? "listening" : agentSpeaking ? "speaking" : "ready";
  return (
    <div className={`bot-orb bot-orb-${state}`} aria-hidden>
      <div className="bot-orb-ring bot-orb-ring-a" />
      <div className="bot-orb-ring bot-orb-ring-b" />
      <div className="bot-orb-core">
        <span className="bot-orb-eq" data-state={state}>
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

export default function CallBotConsole({ embedded = false }: { embedded?: boolean }) {
  const [config, setConfig] = useState<EnquiryConfig | null>(null);
  const [voiceId, setVoiceId] = useState<Voice>(() => {
    try {
      return (localStorage.getItem("wc_default_voice") as Voice) || "mal-female";
    } catch {
      return "mal-female";
    }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enquiry, setEnquiry] = useState<Partial<Enquiry> | null>(null);
  const [recent, setRecent] = useState<Enquiry[]>([]);
  const enquiryIdRef = useRef<string | undefined>(undefined);
  const conversationRef = useRef(new ConversationStateManager());

  const session = useVoiceSession();

  useEffect(() => {
    (async () => {
      try {
        const [cfg, list] = await Promise.all([
          getEnquiryConfig(voiceId),
          getEnquiries(),
        ]);
        setConfig(cfg);
        setRecent(list);
      } catch (e: any) {
        setLoadError(e.message || "Could not load enquiries.");
      }
    })();
  }, [voiceId]);

  const mapArgs = (args: any) => ({
    id: enquiryIdRef.current,
    service: args.service,
    name: args.name,
    nameConfirmed: args.name_confirmed ?? args.nameConfirmed,
    phone: args.phone,
    email: args.email,
    company: args.company,
    message: args.message ?? args.requirements,
    messageEn: args.message_en ?? args.messageEn,
  });

  const withState = (result: unknown) => {
    const snap = conversationRef.current.forAgent();
    if (result && typeof result === "object" && !Array.isArray(result)) {
      return { ...(result as Record<string, unknown>), conversationState: snap };
    }
    return { result, conversationState: snap };
  };

  const onFunctionCall = useCallback(
    async (name: string, args: any, reply: (out: unknown) => void) => {
      try {
        if (name === "select_service") {
          const service = String(args.service ?? "");
          const available = (config?.services ?? []).some(
            (s) => s.toLowerCase() === service.toLowerCase()
          );
          if (!available) {
            const out = { ok: true, service, available: false };
            conversationRef.current.applyToolResult(name, out);
            reply(withState(out));
            return;
          }
          const res = await saveEnquiry({ id: enquiryIdRef.current, service });
          if (res.ok && res.enquiry) {
            enquiryIdRef.current = res.enquiry.id;
            setEnquiry(res.enquiry);
          }
          const out = { ok: true, service, available: true };
          conversationRef.current.applyToolResult(name, out);
          reply(withState(out));
        } else if (name === "save_enquiry") {
          const res = await saveEnquiry(mapArgs(args));
          if (res.ok && res.enquiry) {
            enquiryIdRef.current = res.enquiry.id;
            setEnquiry(res.enquiry);
            const out = {
              ok: true,
              enquiry: enquiryForAgent(res.enquiry),
              phoneCheck: res.phoneCheck,
              nameCheck: res.nameCheck,
            };
            conversationRef.current.applyToolResult(name, out);
            reply(withState(out));
          } else {
            const out = {
              ok: false,
              need: res.need,
              error: res.error || "Could not save the enquiry.",
            };
            conversationRef.current.applyToolResult(name, out);
            reply(withState(out));
          }
        } else if (name === "complete_enquiry") {
          const res = await completeEnquiry(mapArgs(args));
          if (res.enquiry) {
            enquiryIdRef.current = res.enquiry.id;
            setEnquiry(res.enquiry);
          }
          const out =
            res.ok && res.enquiry
              ? { ok: true, enquiry: enquiryForAgent(res.enquiry) }
              : {
                  ok: false,
                  error: res.error,
                  need: res.need,
                  enquiry: res.enquiry ? enquiryForAgent(res.enquiry) : undefined,
                };
          conversationRef.current.applyToolResult(name, out);
          // Speak as soon as complete returns — refresh the list in parallel.
          reply(withState(out));
          if (res.ok) {
            void getEnquiries()
              .then(setRecent)
              .catch(() => {});
          }
        } else {
          reply(withState({ error: "Unknown tool." }));
        }
      } catch (e: any) {
        reply(withState({ ok: false, error: e.message || "Tool failed." }));
      }
    },
    [config]
  );

  const startSession = useCallback(async () => {
    enquiryIdRef.current = undefined;
    setEnquiry(null);
    conversationRef.current.reset();
    try {
      // Reuse loaded config when possible; otherwise fetch in parallel with nothing else.
      const cfg = config ?? (await getEnquiryConfig(voiceId));
      if (!config) setConfig(cfg);
      session.start({
        instructions: cfg.instructions,
        voice: voiceId,
        tools: cfg.tools,
        greet: true,
        demo: "wc-ai",
        conversation: conversationRef.current,
        onFunctionCall,
      });
    } catch (e: any) {
      setLoadError(e.message || "Could not start call bot.");
    }
  }, [voiceId, onFunctionCall, session, config]);

  const agentName = voiceId === "mal-male" ? "Daris Mathew" : "Anjana";
  const statusLabel = !session.active
    ? "Ready"
    : session.learnerSpeaking
      ? "Listening"
      : session.agentSpeaking
        ? "Speaking"
        : session.status === "connecting"
          ? "Connecting"
          : "Live";

  return (
    <div className={`bot-console${embedded ? " bot-console-embedded" : ""}`}>
      {!embedded && (
        <header className="bot-topbar">
          <div className="bot-topbar-brand">
            <span className="bot-mark">WC</span>
            <div>
              <div className="bot-brand-name">WC . AI</div>
              <div className="bot-brand-sub">Call Bot</div>
            </div>
          </div>
          <div className="bot-topbar-actions">
            <a className="bot-link" href={exportCsvUrl()}>
              Export CSV
            </a>
            <Link className="bot-link bot-link-accent" to="/admin/login">
              Admin CRM
            </Link>
          </div>
        </header>
      )}

      {(session.error || loadError) && (
        <div className="bot-error">{session.error || loadError}</div>
      )}

      {!config ? (
        <div className="bot-loading">
          <div className="spinner" />
          <p className="muted">Loading call bot…</p>
        </div>
      ) : (
        <div className="bot-stage">
          <aside className="bot-side bot-side-card">
            <div className="bot-side-head">
              <h2>Live enquiry</h2>
              <span className="muted">Captured fields</span>
            </div>
            <EnquiryCard enquiry={enquiry} recent={recent} />
            <LatencyTable latency={session.latency} />
          </aside>

          <section className="bot-center">
            <div className="bot-status-pill" data-state={statusLabel.toLowerCase()}>
              <span className="bot-status-dot" />
              {statusLabel} · {agentName}
            </div>

            <VoiceOrb
              active={session.active}
              agentSpeaking={session.agentSpeaking}
              learnerSpeaking={session.learnerSpeaking}
            />

            {!session.active ? (
              <div className="bot-ready">
                <h2>Start a voice enquiry</h2>
                <p>
                  Choose Website, E-commerce, or ERP. {agentName} collects details and confirms a
                  callback.
                </p>
                <label className="bot-voice-pick">
                  Agent voice
                  <select
                    value={voiceId}
                    onChange={(e) => {
                      const v = e.target.value as Voice;
                      setVoiceId(v);
                      try {
                        localStorage.setItem("wc_default_voice", v);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <option value="mal-female">Anjana — female</option>
                    <option value="mal-male">Daris Mathew — male</option>
                  </select>
                </label>
                <button
                  className="bot-cta"
                  type="button"
                  onClick={() => void startSession()}
                  disabled={session.status === "connecting"}
                >
                  {session.status === "connecting" ? "Connecting…" : "Start call"}
                </button>
                <p className="bot-hint">
                  While the agent speaks, press <strong>Interrupt</strong> or <strong>Space</strong>{" "}
                  to cut in.
                </p>
              </div>
            ) : (
              <div className="bot-live-pane">
                <ConversationPane
                  messages={session.messages}
                  status={session.status}
                  tutorSpeaking={session.agentSpeaking}
                  learnerSpeaking={session.learnerSpeaking}
                  muted={session.muted}
                  onToggleMute={session.toggleMute}
                  onInterrupt={session.interrupt}
                  onEnd={session.end}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
