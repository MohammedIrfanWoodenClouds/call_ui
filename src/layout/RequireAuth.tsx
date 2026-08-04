import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { adminMe, clearAdminToken, getAdminToken } from "../lib/adminAuth";

export type AuthOutletContext = {
  email: string;
  token: string;
};

export default function RequireAuth() {
  const navigate = useNavigate();
  const token = getAdminToken();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (!token) {
      setUnauthorized(true);
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await adminMe(token);
        if (!cancelled) setEmail(me.user.email);
      } catch {
        if (!cancelled) {
          clearAdminToken();
          setUnauthorized(true);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  if (!token || unauthorized) {
    return <Navigate to="/admin/login" replace />;
  }

  if (checking || email === null) {
    return (
      <div className="crm-boot">
        <div className="spinner" />
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  return <Outlet context={{ email, token } satisfies AuthOutletContext} />;
}
