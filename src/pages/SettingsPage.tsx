import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { clearAdminToken } from "../lib/adminAuth";
import { exportCsvUrl } from "../lib/enquiryApi";
import { apiUrl } from "../lib/apiBase";
import type { AuthOutletContext } from "../layout/RequireAuth";
import type { Voice } from "../types";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "../ui/Button";

export default function SettingsPage() {
  const { email } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [voice, setVoice] = useState<Voice>("mal-female");
  const [health, setHealth] = useState<{ ok?: boolean; swaram?: boolean } | null>(null);
  const [plivo, setPlivo] = useState<{ ok?: boolean; stream?: string } | null>(null);
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem("wc_crm_density") || "comfortable";
    } catch {
      return "comfortable";
    }
  });

  useEffect(() => {
    try {
      const v = localStorage.getItem("wc_default_voice") as Voice | null;
      if (v === "mal-female" || v === "mal-male") setVoice(v);
    } catch {
      /* ignore */
    }
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/health"));
        setHealth(await r.json());
      } catch {
        setHealth({ ok: false });
      }
      try {
        const r = await fetch(apiUrl("/api/plivo/health"));
        setPlivo(await r.json());
      } catch {
        setPlivo({ ok: false });
      }
    })();
  }, []);

  function saveVoice(v: Voice) {
    setVoice(v);
    try {
      localStorage.setItem("wc_default_voice", v);
    } catch {
      /* ignore */
    }
  }

  function saveDensity(d: string) {
    setDensity(d);
    try {
      localStorage.setItem("wc_crm_density", d);
      document.documentElement.setAttribute("data-crm-density", d);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-crm-density", density);
  }, [density]);

  function onLogout() {
    clearAdminToken();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Appearance</div>
              <div className="crm-panel-sub">Theme and density</div>
            </div>
          </div>
          <div className="crm-panel-body settings-body">
            <label className="admin-label">
              Theme
              <select
                className="admin-input"
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark")}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="admin-label">
              Density
              <select className="admin-input" value={density} onChange={(e) => saveDensity(e.target.value)}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Default voice</div>
              <div className="crm-panel-sub">Used when starting the Call Bot</div>
            </div>
          </div>
          <div className="crm-panel-body settings-body">
            <label className="admin-label">
              Agent
              <select className="admin-input" value={voice} onChange={(e) => saveVoice(e.target.value as Voice)}>
                <option value="mal-female">Anjana — female</option>
                <option value="mal-male">Daris Mathew — male</option>
              </select>
            </label>
            <Link className="crm-btn-secondary" to="/admin/bot">
              Open Call Bot
            </Link>
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Exports</div>
              <div className="crm-panel-sub">Download submitted enquiries</div>
            </div>
          </div>
          <div className="crm-panel-body settings-body">
            <a className="crm-btn-secondary" href={exportCsvUrl()}>
              Download CSV
            </a>
            <Link className="crm-btn-secondary" to="/admin/contacts">
              Advanced contact export
            </Link>
            <Link className="crm-btn-secondary" to="/admin/reports">
              Saved reports
            </Link>
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">System status</div>
              <div className="crm-panel-sub">Read-only health probes</div>
            </div>
          </div>
          <div className="crm-panel-body settings-body">
            <div className="settings-status">
              <span>API</span>
              <strong className={health?.ok ? "ok" : "bad"}>{health?.ok ? "Online" : "Offline"}</strong>
            </div>
            <div className="settings-status">
              <span>Swaram key</span>
              <strong className={health?.swaram ? "ok" : "bad"}>{health?.swaram ? "Configured" : "Missing"}</strong>
            </div>
            <div className="settings-status">
              <span>Plivo bridge</span>
              <strong className={plivo?.ok ? "ok" : "bad"}>{plivo?.ok ? "Ready" : "Unavailable"}</strong>
            </div>
            {plivo?.stream && <p className="muted mono">{plivo.stream}</p>}
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Workspace</div>
              <div className="crm-panel-sub">Shortcuts</div>
            </div>
          </div>
          <div className="crm-panel-body settings-body">
            <Link className="crm-btn-secondary" to="/admin/users">
              Users & roles
            </Link>
            <Link className="crm-btn-secondary" to="/admin/agents">
              AI agents
            </Link>
            <Link className="crm-btn-secondary" to="/admin/notifications">
              Notifications
            </Link>
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <div className="crm-panel-title">Account</div>
              <div className="crm-panel-sub">{email}</div>
            </div>
          </div>
          <div className="crm-panel-body settings-body">
            <Button variant="danger" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
