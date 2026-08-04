/** Client-side persistence for CRM features without new backend APIs. */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  agentId: string;
  contactIds: string[];
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  stats: { dialed: number; answered: number; converted: number };
}

export interface AgentProfile {
  id: string;
  name: string;
  voice: "mal-female" | "mal-male";
  persona: string;
  languages: string[];
  status: "active" | "draft" | "archived";
  knowledgeBaseIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KbArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  href?: string;
  createdAt: string;
}

export interface CrmUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "agent" | "viewer";
  status: "active" | "invited" | "disabled";
  createdAt: string;
}

export interface SavedReport {
  id: string;
  name: string;
  type: "calls" | "contacts" | "campaigns" | "agents";
  range: "7d" | "30d" | "90d";
  createdAt: string;
}

const KEYS = {
  campaigns: "wc_crm_campaigns",
  agents: "wc_crm_agents",
  kb: "wc_crm_kb",
  notifications: "wc_crm_notifications",
  users: "wc_crm_users",
  reports: "wc_crm_reports",
  contactTags: "wc_crm_contact_tags",
} as const;

function seedAgents(): AgentProfile[] {
  const now = new Date().toISOString();
  return [
    {
      id: "agent-anjana",
      name: "Anjana",
      voice: "mal-female",
      persona: "Warm Malayalam voice agent for website and ERP enquiries.",
      languages: ["ml", "en"],
      status: "active",
      knowledgeBaseIds: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "agent-daris",
      name: "Daris Mathew",
      voice: "mal-male",
      persona: "Confident Malayalam voice agent for technical and pricing conversations.",
      languages: ["ml", "en"],
      status: "active",
      knowledgeBaseIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function seedUsers(email: string): CrmUser[] {
  return [
    {
      id: "user-owner",
      name: email.split("@")[0] || "Admin",
      email,
      role: "owner",
      status: "active",
      createdAt: new Date().toISOString(),
    },
  ];
}

function seedNotifications(): AppNotification[] {
  const now = Date.now();
  return [
    {
      id: "n1",
      title: "Welcome to WC . AI CRM",
      body: "Explore contacts, campaigns, and live call monitoring from the sidebar.",
      type: "info",
      read: false,
      href: "/admin",
      createdAt: new Date(now - 60_000).toISOString(),
    },
    {
      id: "n2",
      title: "Voice agents ready",
      body: "Anjana and Daris Mathew are active for outbound campaigns.",
      type: "success",
      read: false,
      href: "/admin/agents",
      createdAt: new Date(now - 120_000).toISOString(),
    },
  ];
}

function seedKb(): KbArticle[] {
  const now = new Date().toISOString();
  return [
    {
      id: "kb-1",
      title: "Website development packages",
      category: "Services",
      content:
        "WC . AI offers brochure sites, e-commerce, and custom web apps. Qualify budget, timeline, and whether the caller needs CMS or ERP integration.",
      tags: ["website", "pricing"],
      updatedAt: now,
    },
    {
      id: "kb-2",
      title: "ERP enquiry script",
      category: "Scripts",
      content:
        "Ask about modules (inventory, accounting, CRM), user count, current software, and go-live window. Offer a callback with a specialist when needed.",
      tags: ["erp", "script"],
      updatedAt: now,
    },
  ];
}

export function loadCampaigns(): Campaign[] {
  return readJson(KEYS.campaigns, []);
}

export function saveCampaigns(list: Campaign[]): void {
  writeJson(KEYS.campaigns, list);
}

export function loadAgents(): AgentProfile[] {
  const list = readJson<AgentProfile[]>(KEYS.agents, []);
  if (list.length === 0) {
    const seeded = seedAgents();
    writeJson(KEYS.agents, seeded);
    return seeded;
  }
  return list;
}

export function saveAgents(list: AgentProfile[]): void {
  writeJson(KEYS.agents, list);
}

export function loadKb(): KbArticle[] {
  const list = readJson<KbArticle[]>(KEYS.kb, []);
  if (list.length === 0) {
    const seeded = seedKb();
    writeJson(KEYS.kb, seeded);
    return seeded;
  }
  return list;
}

export function saveKb(list: KbArticle[]): void {
  writeJson(KEYS.kb, list);
}

export function loadNotifications(): AppNotification[] {
  const list = readJson<AppNotification[]>(KEYS.notifications, []);
  if (list.length === 0) {
    const seeded = seedNotifications();
    writeJson(KEYS.notifications, seeded);
    return seeded;
  }
  return list;
}

export function saveNotifications(list: AppNotification[]): void {
  writeJson(KEYS.notifications, list);
}

export function loadUsers(email: string): CrmUser[] {
  const list = readJson<CrmUser[]>(KEYS.users, []);
  if (list.length === 0) {
    const seeded = seedUsers(email);
    writeJson(KEYS.users, seeded);
    return seeded;
  }
  return list;
}

export function saveUsers(list: CrmUser[]): void {
  writeJson(KEYS.users, list);
}

export function loadReports(): SavedReport[] {
  return readJson(KEYS.reports, []);
}

export function saveReports(list: SavedReport[]): void {
  writeJson(KEYS.reports, list);
}

export type ContactTagMap = Record<string, string[]>;

export function loadContactTags(): ContactTagMap {
  return readJson(KEYS.contactTags, {});
}

export function saveContactTags(map: ContactTagMap): void {
  writeJson(KEYS.contactTags, map);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
