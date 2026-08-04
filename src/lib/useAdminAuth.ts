import { useOutletContext } from "react-router-dom";
import type { AuthOutletContext } from "../layout/RequireAuth";
import { getAdminToken } from "./adminAuth";

/** Safe auth access for admin pages — never crashes if outlet context is missing. */
export function useAdminAuth(): AuthOutletContext {
  const ctx = useOutletContext<AuthOutletContext | undefined>();
  const token = ctx?.token || getAdminToken() || "";
  const email = ctx?.email || "";
  return { token, email };
}
