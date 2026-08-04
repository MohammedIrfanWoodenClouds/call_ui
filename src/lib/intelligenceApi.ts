/**
 * Browser → API fire-and-forget Groq intelligence.
 * Never awaited on the realtime speech path.
 */

import { apiUrl } from "./apiBase";

export interface IntelligencePayload {
  sessionId: string;
  phase?: string;
  customerIntent?: string;
  pendingTasks?: string[];
  confirmationState?: string;
  enquiry?: {
    service?: string;
    name?: string;
    phone?: string;
    company?: string;
    message?: string;
    email?: string;
  };
  recentCallerUtterances?: string[];
  recentAssistantUtterances?: string[];
  lastCallerText?: string;
  lastAssistantText?: string;
  transcriptConfidence?: "High" | "Medium" | "Low";
  interruptionCount?: number;
  justInterrupted?: boolean;
}

/** Schedule mid-call planner + entity extraction (202 Accepted). */
export function scheduleIntelligenceTurn(payload: IntelligencePayload): void {
  fetch(apiUrl("/api/intelligence/turn"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* voice continues if intelligence is down */
  });
}

/** Schedule post-call summary / lead / evaluation pack. */
export function scheduleIntelligencePostCall(
  payload: IntelligencePayload
): void {
  fetch(apiUrl("/api/intelligence/post-call"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* ignore */
  });
}
