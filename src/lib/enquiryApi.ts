import { apiUrl } from "./apiBase";
import type { VoiceTool } from "./swaramClient";

export interface EnquiryConfig {
  services: string[];
  today: string;
  instructions: string;
  tools: VoiceTool[];
  agentName: string;
}

export interface Enquiry {
  id: string;
  ref: string;
  service: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  message: string;
  messageEn: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function getEnquiryConfig(voice?: string): Promise<EnquiryConfig> {
  const qs = voice ? `?voice=${encodeURIComponent(voice)}` : "";
  const r = await fetch(apiUrl(`/api/enquiries/config${qs}`));
  if (!r.ok) throw new Error("Could not load enquiry config.");
  return r.json();
}

export async function getEnquiries(): Promise<Enquiry[]> {
  const r = await fetch(apiUrl("/api/enquiries/enquiries"));
  if (!r.ok) throw new Error("Could not load enquiries.");
  return (await r.json()).enquiries as Enquiry[];
}

type EnquiryPayload = Partial<
  Omit<Enquiry, "createdAt" | "updatedAt" | "ref" | "status">
> & {
  id?: string;
  message_en?: string;
  nameConfirmed?: boolean;
  name_confirmed?: boolean;
};

export async function saveEnquiry(
  payload: EnquiryPayload
): Promise<{
  ok: boolean;
  enquiry?: Enquiry;
  phoneCheck?: { ok: boolean; digits: number };
  nameCheck?: {
    ok: boolean;
    heard: string;
    saved: string;
    needsConfirm: boolean;
    nearMiss: boolean;
    ambiguous: boolean;
    candidates: string[];
    blockedReplace?: boolean;
    reason?: string;
  };
  need?: string;
  error?: string;
}> {
  const r = await fetch(apiUrl("/api/enquiries/enquiry"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function completeEnquiry(
  payload: EnquiryPayload
): Promise<{ ok: boolean; enquiry?: Enquiry; error?: string; need?: string }> {
  const r = await fetch(apiUrl("/api/enquiries/complete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export function exportCsvUrl(): string {
  return apiUrl("/api/enquiries/export.csv");
}

/** Prefer English requirements for CRM display. */
export function requirementsDisplay(e: { message?: string; messageEn?: string }): {
  primary: string;
  original: string;
} {
  const original = (e.message ?? "").trim();
  const en = (e.messageEn ?? "").trim();
  if (en) return { primary: en, original: original && original !== en ? original : "" };
  return { primary: original, original: "" };
}
