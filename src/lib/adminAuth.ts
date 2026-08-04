import { apiUrl } from "./apiBase";
import type { Enquiry } from "./enquiryApi";

export interface AdminUser {
  email: string;
}

const ADMIN_TOKEN_KEY = "wc_super_admin_token";

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ token: string; user: AdminUser }> {
  const r = await fetch(apiUrl("/api/admin/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(j.error || "Login failed.");
  return { token: j.token as string, user: j.user as AdminUser };
}

export async function adminMe(token: string): Promise<{ user: AdminUser }> {
  const r = await fetch(apiUrl("/api/admin/me"), {
    headers: { ...authHeaders(token) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.user) throw new Error(j.error || "Unauthorized.");
  return { user: j.user as AdminUser };
}

export async function adminFetchEnquiries(
  token: string
): Promise<{ enquiries: Enquiry[] }> {
  const r = await fetch(apiUrl("/api/admin/enquiries"), {
    headers: { ...authHeaders(token) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Could not load enquiries.");
  const list = (j.enquiries ?? j.registrations ?? []) as Enquiry[];
  return { enquiries: list };
}

/** @deprecated use adminFetchEnquiries */
export async function adminFetchRegistrations(
  token: string
): Promise<{ registrations: Enquiry[] }> {
  const { enquiries } = await adminFetchEnquiries(token);
  return { registrations: enquiries };
}

export async function adminFetchLogs(
  token: string,
  opts?: { sessionId?: string; limit?: number }
): Promise<{ events: any[] }> {
  const params = new URLSearchParams();
  if (opts?.sessionId) params.set("sessionId", opts.sessionId);
  if (opts?.limit && Number.isFinite(opts.limit)) params.set("limit", String(opts.limit));

  const qs = params.toString() ? `?${params.toString()}` : "";
  const r = await fetch(apiUrl(`/api/admin/logs${qs}`), {
    headers: { ...authHeaders(token) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.events) throw new Error(j.error || "Could not load logs.");
  return { events: j.events as any[] };
}

// ---- Call dashboard (mimic + CRM) ----

export type Disposition =
  | "interested"
  | "not_interested"
  | "callback"
  | "wrong_number"
  | "no_answer"
  | "voicemail"
  | "converted"
  | "do_not_call";

export type ResponseMark =
  | "positive"
  | "negative"
  | "objection"
  | "question"
  | "commitment"
  | "neutral";

export interface CallTurn {
  id: string;
  role: "agent" | "customer";
  text: string;
  at: string;
  mark?: ResponseMark | null;
  markNote?: string;
}

export interface MimicCall {
  id: string;
  phone: string;
  contactName: string;
  status: string;
  mode: "mimic";
  disposition: Disposition | "";
  tags: string[];
  notes: string;
  leadScore: number;
  followUpAt: string;
  turns: CallTurn[];
  scenario: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string;
}

export async function adminFetchCalls(token: string): Promise<{
  calls: MimicCall[];
  stats: { total: number; marked: number; byDisposition: Record<string, number> };
}> {
  const r = await fetch(apiUrl("/api/admin/calls"), {
    headers: { ...authHeaders(token) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.calls) throw new Error(j.error || "Could not load calls.");
  return { calls: j.calls as MimicCall[], stats: j.stats };
}

export async function adminStartMimicCall(
  token: string,
  phone: string,
  contactName?: string
): Promise<{ call: MimicCall }> {
  const r = await fetch(apiUrl("/api/admin/calls/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ phone, contactName }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.call) throw new Error(j.error || "Could not start call.");
  return { call: j.call as MimicCall };
}

export async function adminUpdateCall(
  token: string,
  id: string,
  patch: Partial<{
    disposition: Disposition | "";
    tags: string[];
    notes: string;
    leadScore: number;
    followUpAt: string;
    contactName: string;
  }>
): Promise<{ call: MimicCall }> {
  const r = await fetch(apiUrl(`/api/admin/calls/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(patch),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.call) throw new Error(j.error || "Could not update call.");
  return { call: j.call as MimicCall };
}

export async function adminMarkTurn(
  token: string,
  callId: string,
  turnId: string,
  mark: ResponseMark | null,
  markNote?: string
): Promise<{ call: MimicCall }> {
  const r = await fetch(apiUrl(`/api/admin/calls/${callId}/turns/${turnId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ mark, markNote }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.call) throw new Error(j.error || "Could not mark response.");
  return { call: j.call as MimicCall };
}

export interface AdminStats {
  kpis: {
    enquiries: number;
    submittedToday: number;
    submittedYesterday: number;
    calls: number;
    callsToday: number;
    callsYesterday: number;
    markedResponses: number;
    markedCalls: number;
  };
  byService: Record<string, number>;
  enquiryBuckets: { date: string; count: number }[];
  callBuckets: { date: string; count: number }[];
  byDisposition: Record<string, number>;
  latestRequirements: {
    id: string;
    ref: string;
    name: string;
    service: string;
    message: string;
    messageEn?: string;
    messageOriginal?: string;
    updatedAt: string;
  }[];
  latestResponses: FlatResponse[];
}

export interface FlatResponse {
  turnId: string;
  callId: string;
  phone: string;
  contactName: string;
  disposition: string;
  text: string;
  at: string;
  mark?: ResponseMark | null;
  markNote: string;
  callCreatedAt: string;
}

export async function adminFetchStats(token: string): Promise<AdminStats> {
  const r = await fetch(apiUrl("/api/admin/stats"), {
    headers: { ...authHeaders(token) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.kpis) throw new Error(j.error || "Could not load stats.");
  return j as AdminStats;
}

export async function adminFetchResponses(
  token: string,
  opts?: { mark?: string; disposition?: string; q?: string }
): Promise<{
  responses: FlatResponse[];
  responseMarks: ResponseMark[];
  dispositions: Disposition[];
}> {
  const params = new URLSearchParams();
  if (opts?.mark) params.set("mark", opts.mark);
  if (opts?.disposition) params.set("disposition", opts.disposition);
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const r = await fetch(apiUrl(`/api/admin/responses${qs}`), {
    headers: { ...authHeaders(token) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.responses) throw new Error(j.error || "Could not load responses.");
  return {
    responses: j.responses as FlatResponse[],
    responseMarks: (j.responseMarks ?? []) as ResponseMark[],
    dispositions: (j.dispositions ?? []) as Disposition[],
  };
}
