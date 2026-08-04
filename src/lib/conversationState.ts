/**
 * Per-call conversation state manager.
 *
 * Tracks dialogue phase, topic, intent, interruptions, pending tasks,
 * greeting / confirmation / closing flags, and recent agent utterances
 * so the agent can avoid repeating itself.
 */

export const DIALOGUE_PHASES = [
  "greet",
  "service",
  "name",
  "mobile",
  "company",
  "requirements",
  "final_confirm",
  "close",
  "done",
] as const;

export type DialoguePhase = (typeof DIALOGUE_PHASES)[number];

export type GreetingState = "pending" | "in_progress" | "done";
export type ConfirmationState = "idle" | "awaiting" | "confirmed" | "rejected";
export type ClosingState = "idle" | "in_progress" | "done";

export type CustomerIntent =
  | "unknown"
  | "website"
  | "ecommerce"
  | "erp"
  | "general_enquiry"
  | "correction"
  | "end_call";

export type PendingTask =
  | "greet"
  | "ask_service"
  | "ask_name"
  | "confirm_name"
  | "ask_mobile"
  | "confirm_mobile"
  | "ask_company"
  | "ask_requirements"
  | "confirm_requirements"
  | "final_summary"
  | "complete_enquiry"
  | "close_call";

export interface InterruptionRecord {
  at: number;
  phase: DialoguePhase;
  interruptedUtterance?: string;
}

export interface EnquiryProgress {
  service?: string;
  name?: string;
  phone?: string;
  company?: string;
  message?: string;
}

export interface ConversationSnapshot {
  phase: DialoguePhase;
  currentTopic: string;
  previousQuestions: string[];
  customerIntent: CustomerIntent;
  interruptions: InterruptionRecord[];
  interruptionCount: number;
  pendingTasks: PendingTask[];
  greeting: GreetingState;
  confirmation: ConfirmationState;
  closing: ClosingState;
  recentAgentUtterances: string[];
  avoidRepeating: string[];
  enquiry: EnquiryProgress;
}

const TOPIC_BY_PHASE: Record<DialoguePhase, string> = {
  greet: "greeting",
  service: "service_selection",
  name: "caller_name",
  mobile: "mobile_number",
  company: "company_name",
  requirements: "requirements",
  final_confirm: "final_confirmation",
  close: "closing",
  done: "call_complete",
};

const INITIAL_PENDING: PendingTask[] = [
  "greet",
  "ask_service",
  "ask_name",
  "confirm_name",
  "ask_mobile",
  "confirm_mobile",
  "ask_company",
  "ask_requirements",
  "confirm_requirements",
  "final_summary",
  "complete_enquiry",
  "close_call",
];

const CONFIRM_HINT =
  /(ശരിയാണോ|ഓക്കേ ആണോ|ശരിയല്ലേ|correct\??|is that right|എല്ലാം ശരി)/i;
const QUESTION_HINT = /[?？]|^(പേര്|മൊബൈൽ|കമ്പനി|എന്ത്|ഏത്|വേണം)/i;

const MAX_QUESTIONS = 24;
const MAX_UTTERANCES = 8;
const MAX_INTERRUPTIONS = 20;
/** Jaccard token overlap above this → treat as a repeated response. */
const REPEAT_SIMILARITY = 0.72;

function normalizeUtterance(text: string): string {
  return text
    .replace(/\[[^\]]*]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokens(text: string): Set<string> {
  const parts = normalizeUtterance(text).split(" ").filter((t) => t.length > 1);
  return new Set(parts);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function intentFromService(service?: string): CustomerIntent {
  const s = (service ?? "").toLowerCase();
  if (s.includes("website") || s.includes("വെബ്")) return "website";
  if (s.includes("commerce") || s.includes("കൊമേഴ്")) return "ecommerce";
  if (s.includes("erp") || s.includes("ആർപി")) return "erp";
  return "general_enquiry";
}

export class ConversationStateManager {
  private phase: DialoguePhase = "greet";
  private currentTopic = TOPIC_BY_PHASE.greet;
  private previousQuestions: string[] = [];
  private customerIntent: CustomerIntent = "unknown";
  private interruptions: InterruptionRecord[] = [];
  private pendingTasks: PendingTask[] = [...INITIAL_PENDING];
  private greeting: GreetingState = "pending";
  private confirmation: ConfirmationState = "idle";
  private closing: ClosingState = "idle";
  private recentAgentUtterances: string[] = [];
  private enquiry: EnquiryProgress = {};
  private lastPartialAgent = "";

  reset(): void {
    this.phase = "greet";
    this.currentTopic = TOPIC_BY_PHASE.greet;
    this.previousQuestions = [];
    this.customerIntent = "unknown";
    this.interruptions = [];
    this.pendingTasks = [...INITIAL_PENDING];
    this.greeting = "pending";
    this.confirmation = "idle";
    this.closing = "idle";
    this.recentAgentUtterances = [];
    this.enquiry = {};
    this.lastPartialAgent = "";
  }

  getPhase(): DialoguePhase {
    return this.phase;
  }

  getGreeting(): GreetingState {
    return this.greeting;
  }

  hasGreeted(): boolean {
    return this.greeting === "done" || this.greeting === "in_progress";
  }

  setTopic(topic: string): void {
    const t = topic.trim();
    if (t) this.currentTopic = t;
  }

  setPhase(phase: DialoguePhase): void {
    this.phase = phase;
    this.currentTopic = TOPIC_BY_PHASE[phase];
  }

  setIntent(intent: CustomerIntent): void {
    this.customerIntent = intent;
  }

  setConfirmation(state: ConfirmationState): void {
    this.confirmation = state;
  }

  setClosing(state: ClosingState): void {
    this.closing = state;
  }

  markGreetingStarted(): void {
    if (this.greeting === "pending") {
      this.greeting = "in_progress";
      this.setPhase("greet");
    }
  }

  markGreetingDone(): void {
    this.greeting = "done";
    this.completeTask("greet");
    if (this.phase === "greet") this.setPhase("service");
  }

  markClosingStarted(): void {
    this.closing = "in_progress";
    this.setPhase("close");
  }

  markClosingDone(): void {
    this.closing = "done";
    this.completeTask("close_call");
    this.setPhase("done");
  }

  /** Record that the caller barged in during an agent reply. */
  recordInterruption(interruptedUtterance?: string): void {
    const text = (interruptedUtterance ?? this.lastPartialAgent).trim() || undefined;
    this.interruptions.push({
      at: Date.now(),
      phase: this.phase,
      interruptedUtterance: text,
    });
    if (this.interruptions.length > MAX_INTERRUPTIONS) {
      this.interruptions.shift();
    }
    if (this.confirmation === "awaiting") {
      // Caller spoke over a confirm — treat as still open, not confirmed.
      this.confirmation = "awaiting";
    }
    this.lastPartialAgent = "";
  }

  /** Track streaming agent text (for interruption context). */
  notePartialAgent(text: string): void {
    this.lastPartialAgent = text;
  }

  /**
   * Record a finished agent utterance.
   * Returns whether it is too similar to a recent reply (caller should paraphrase).
   */
  recordAgentUtterance(raw: string): { isRepeat: boolean; similarity: number } {
    const text = raw.trim();
    if (!text) return { isRepeat: false, similarity: 0 };

    this.lastPartialAgent = "";
    const check = this.checkRepeatedResponse(text);

    if (QUESTION_HINT.test(text) || text.includes("?")) {
      this.recordQuestion(text);
    }
    if (CONFIRM_HINT.test(text)) {
      this.confirmation = "awaiting";
    }

    if (this.greeting === "in_progress") {
      this.markGreetingDone();
    }
    if (this.closing === "in_progress" || this.phase === "close") {
      this.markClosingDone();
    }

    this.recentAgentUtterances.push(text);
    if (this.recentAgentUtterances.length > MAX_UTTERANCES) {
      this.recentAgentUtterances.shift();
    }

    return check;
  }

  recordQuestion(question: string): void {
    const q = question.trim();
    if (!q) return;
    const norm = normalizeUtterance(q);
    if (this.previousQuestions.some((p) => normalizeUtterance(p) === norm)) return;
    this.previousQuestions.push(q);
    if (this.previousQuestions.length > MAX_QUESTIONS) {
      this.previousQuestions.shift();
    }
  }

  /** Infer intent / confirmation from caller transcript. */
  recordCallerUtterance(raw: string): void {
    const text = raw.trim();
    if (!text) return;

    const lower = text.toLowerCase();
    if (/\b(website|വെബ്)/i.test(text)) this.customerIntent = "website";
    else if (/\b(e-?commerce|ഇ-?കൊമേഴ്)/i.test(text)) this.customerIntent = "ecommerce";
    else if (/\b(erp|ഇആർപി|ആർപി)/i.test(text)) this.customerIntent = "erp";

    if (this.confirmation === "awaiting") {
      if (/\b(yes|ശരി|ഓക്കേ|അതെ|correct)\b/i.test(lower) || /ശരിയാണ്/.test(text)) {
        this.confirmation = "confirmed";
      } else if (/\b(no|അല്ല|തെറ്റ്|wrong|change)\b/i.test(lower)) {
        this.confirmation = "rejected";
        this.customerIntent = "correction";
      }
    }

    if (/\b(bye|ബൈ|നന്ദി|thank)/i.test(lower) && this.phase === "close") {
      this.customerIntent = "end_call";
    }
  }

  /** True when `text` is too similar to a recent agent reply. */
  checkRepeatedResponse(text: string): { isRepeat: boolean; similarity: number } {
    const next = tokens(text);
    let best = 0;
    for (const prev of this.recentAgentUtterances) {
      const sim = jaccard(next, tokens(prev));
      if (sim > best) best = sim;
    }
    return { isRepeat: best >= REPEAT_SIMILARITY, similarity: best };
  }

  shouldAvoidRepeating(text: string): boolean {
    return this.checkRepeatedResponse(text).isRepeat;
  }

  completeTask(task: PendingTask): void {
    this.pendingTasks = this.pendingTasks.filter((t) => t !== task);
  }

  addPendingTask(task: PendingTask): void {
    if (!this.pendingTasks.includes(task)) this.pendingTasks.push(task);
  }

  /** Sync collected enquiry fields and derive phase + pending tasks. */
  syncEnquiry(fields: EnquiryProgress): void {
    this.enquiry = { ...this.enquiry, ...fields };
    if (fields.service) {
      this.customerIntent = intentFromService(fields.service);
      this.completeTask("ask_service");
    }
    if (fields.name) this.completeTask("ask_name");
    if (fields.name) this.completeTask("confirm_name");
    if (fields.phone) {
      this.completeTask("ask_mobile");
      this.completeTask("confirm_mobile");
    }
    if (fields.company !== undefined && fields.company !== "") {
      this.completeTask("ask_company");
    }
    if (fields.message) {
      this.completeTask("ask_requirements");
      this.completeTask("confirm_requirements");
    }
    this.recomputePhaseFromEnquiry();
  }

  /**
   * Advance state from a tool call result.
   * Attach the returned snapshot to the tool output for the model.
   */
  applyToolResult(name: string, result: unknown): ConversationSnapshot {
    const out = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
    const enquiry = (out.enquiry && typeof out.enquiry === "object"
      ? out.enquiry
      : undefined) as EnquiryProgress | undefined;

    if (name === "select_service") {
      const service = String(out.service ?? "");
      const available = out.available !== false;
      if (available && service) {
        this.syncEnquiry({ service });
        this.setPhase("name");
        this.confirmation = "idle";
      } else {
        this.setPhase("service");
        this.addPendingTask("ask_service");
      }
    } else if (name === "save_enquiry") {
      if (out.ok === false && out.need) {
        // Keep phase; model must retry silently.
        return this.snapshot();
      }
      if (enquiry) {
        this.syncEnquiry({
          service: enquiry.service,
          name: enquiry.name,
          phone: enquiry.phone,
          company: enquiry.company,
          message: enquiry.message,
        });
      }
      const phoneCheck = out.phoneCheck as { ok?: boolean } | undefined;
      const nameCheck = out.nameCheck as
        | { ok?: boolean; blockedReplace?: boolean; needsConfirm?: boolean }
        | undefined;
      if (phoneCheck && phoneCheck.ok === false) {
        this.setPhase("mobile");
        this.addPendingTask("ask_mobile");
        this.addPendingTask("confirm_mobile");
        this.confirmation = "rejected";
      } else if (nameCheck && nameCheck.ok === false) {
        this.setPhase("name");
        this.addPendingTask("ask_name");
        this.addPendingTask("confirm_name");
        this.confirmation = "rejected";
      } else if (nameCheck?.needsConfirm) {
        this.setPhase("name");
        this.addPendingTask("confirm_name");
        this.confirmation = "awaiting";
      } else if (enquiry?.message) {
        this.setPhase("final_confirm");
        this.confirmation = "awaiting";
        this.completeTask("final_summary");
      } else if (enquiry?.phone && phoneCheck?.ok !== false) {
        this.setPhase("company");
        this.confirmation = "idle";
      } else if (enquiry?.name && nameCheck?.ok !== false) {
        this.setPhase("mobile");
        this.confirmation = "idle";
      } else if (enquiry?.company !== undefined) {
        this.setPhase("requirements");
      }
    } else if (name === "complete_enquiry") {
      if (out.ok === true) {
        this.completeTask("complete_enquiry");
        this.completeTask("final_summary");
        this.confirmation = "confirmed";
        this.markClosingStarted();
        if (enquiry) this.syncEnquiry(enquiry);
      } else {
        this.setPhase("final_confirm");
        this.confirmation = "awaiting";
        this.addPendingTask("final_summary");
        this.addPendingTask("complete_enquiry");
      }
    }

    return this.snapshot();
  }

  snapshot(): ConversationSnapshot {
    return {
      phase: this.phase,
      currentTopic: this.currentTopic,
      previousQuestions: [...this.previousQuestions],
      customerIntent: this.customerIntent,
      interruptions: [...this.interruptions],
      interruptionCount: this.interruptions.length,
      pendingTasks: [...this.pendingTasks],
      greeting: this.greeting,
      confirmation: this.confirmation,
      closing: this.closing,
      recentAgentUtterances: [...this.recentAgentUtterances],
      avoidRepeating: this.recentAgentUtterances.slice(-3),
      enquiry: { ...this.enquiry },
    };
  }

  /** Compact object safe to embed in tool results / logs. */
  forAgent(): Record<string, unknown> {
    const s = this.snapshot();
    return {
      phase: s.phase,
      currentTopic: s.currentTopic,
      customerIntent: s.customerIntent,
      pendingTasks: s.pendingTasks,
      greeting: s.greeting,
      confirmation: s.confirmation,
      closing: s.closing,
      interruptionCount: s.interruptionCount,
      previousQuestions: s.previousQuestions.slice(-5),
      avoidRepeating: s.avoidRepeating,
      note:
        "Do not reuse avoidRepeating lines. Advance pendingTasks in order. " +
        "If confirmation=awaiting, wait for yes/no before tools.",
    };
  }

  /** Prompt snippet when refreshing session instructions mid-call. */
  toPromptSection(): string {
    const s = this.snapshot();
    const lines = [
      "# Live conversation state (authoritative — follow this)",
      `phase: ${s.phase}`,
      `currentTopic: ${s.currentTopic}`,
      `customerIntent: ${s.customerIntent}`,
      `greeting: ${s.greeting}`,
      `confirmation: ${s.confirmation}`,
      `closing: ${s.closing}`,
      `pendingTasks: ${s.pendingTasks.join(", ") || "(none)"}`,
      `interruptions: ${s.interruptionCount}`,
    ];
    if (s.previousQuestions.length) {
      lines.push(`previousQuestions: ${s.previousQuestions.slice(-5).join(" | ")}`);
    }
    if (s.avoidRepeating.length) {
      lines.push(
        "NEVER repeat or lightly paraphrase these recent lines — say it differently:",
        ...s.avoidRepeating.map((u) => `- ${u}`)
      );
    }
    if (s.closing === "done" || s.phase === "done") {
      lines.push("Call is closed. Do not reopen the enquiry flow.");
    }
    return lines.join("\n");
  }

  private recomputePhaseFromEnquiry(): void {
    if (this.closing === "done") {
      this.setPhase("done");
      return;
    }
    if (this.closing === "in_progress") {
      this.setPhase("close");
      return;
    }
    const e = this.enquiry;
    if (e.message) this.setPhase("final_confirm");
    else if (e.phone) this.setPhase("company");
    else if (e.name) this.setPhase("mobile");
    else if (e.service) this.setPhase("name");
    else if (this.greeting === "done") this.setPhase("service");
    else this.setPhase("greet");
  }
}
