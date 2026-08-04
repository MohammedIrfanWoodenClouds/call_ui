/**
 * Base URL for the call_api backend.
 * - Dev: leave empty and rely on Vite's `/api` proxy to localhost:8090
 * - Prod / separate hosting: set VITE_API_BASE_URL (e.g. https://api.example.com)
 */
const RAW = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export const API_BASE = RAW.replace(/\/$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
