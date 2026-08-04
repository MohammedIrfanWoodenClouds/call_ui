import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminLogin, clearAdminToken, setAdminToken } from "../lib/adminAuth";

export default function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("admin@wc.com");
  const [password, setPassword] = useState("pass123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitDisabled = useMemo(() => {
    return loading || !email.trim() || !password;
  }, [loading, email, password]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    clearAdminToken();
    try {
      const { token } = await adminLogin(email, password);
      setAdminToken(token);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-auth-wrap">
      <div className="admin-auth-card">
        <div className="admin-auth-head">
          <div className="crm-brand-mark auth-mark">WC</div>
          <div className="admin-auth-brand">WC . AI</div>
          <div className="admin-auth-sub">Sign in to the call service CRM</div>
        </div>

        <form onSubmit={onSubmit} className="admin-auth-form">
          <label className="admin-label">
            Email
            <input
              className="admin-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="admin-label">
            Password
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && <div className="admin-error">{error}</div>}

          <button className="primary big admin-auth-btn" disabled={submitDisabled} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="admin-auth-note">
            Demo: <span className="mono">admin@wc.com</span> / <span className="mono">pass123</span>
          </div>

          <Link className="crm-text-link auth-back" to="/">
            ← Back to Call Bot
          </Link>
        </form>
      </div>
    </div>
  );
}
