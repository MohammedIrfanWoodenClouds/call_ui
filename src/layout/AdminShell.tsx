import { useEffect, useMemo, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import { clearAdminToken } from "../lib/adminAuth";
import { loadNotifications } from "../lib/localStore";
import { useTheme } from "../theme/ThemeProvider";
import { CommandPalette, type CommandItem } from "../ui/CommandPalette";
import type { AuthOutletContext } from "./RequireAuth";
import {
  IconAgents,
  IconAnalytics,
  IconBell,
  IconBot,
  IconCalls,
  IconCampaign,
  IconContacts,
  IconConversation,
  IconDashboard,
  IconImport,
  IconKb,
  IconLive,
  IconLogs,
  IconMenu,
  IconMoon,
  IconRecording,
  IconReports,
  IconRequirements,
  IconResponses,
  IconSearch,
  IconSettings,
  IconSun,
  IconTimeline,
  IconUsers,
} from "./icons";

type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: (p: { size?: number; className?: string }) => JSX.Element;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { to: "/admin", end: true, label: "Dashboard", icon: IconDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: IconAnalytics },
      { to: "/admin/reports", label: "Reports", icon: IconReports },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { to: "/admin/contacts", label: "Contacts", icon: IconContacts },
      { to: "/admin/import", label: "Import", icon: IconImport },
      { to: "/admin/requirements", label: "Requirements", icon: IconRequirements },
      { to: "/admin/responses", label: "Responses", icon: IconResponses },
    ],
  },
  {
    id: "voice",
    label: "Voice",
    items: [
      { to: "/admin/bot", label: "Call Bot", icon: IconBot },
      { to: "/admin/campaigns", label: "Campaigns", icon: IconCampaign },
      { to: "/admin/live", label: "Live Calls", icon: IconLive },
      { to: "/admin/calls", label: "Calls", icon: IconCalls },
      { to: "/admin/timeline", label: "Timeline", icon: IconTimeline },
      { to: "/admin/conversations", label: "Conversations", icon: IconConversation },
      { to: "/admin/recordings", label: "Recordings", icon: IconRecording },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [
      { to: "/admin/agents", label: "AI Agents", icon: IconAgents },
      { to: "/admin/knowledge", label: "Knowledge Base", icon: IconKb },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { to: "/admin/notifications", label: "Notifications", icon: IconBell },
      { to: "/admin/users", label: "Users & Roles", icon: IconUsers },
      { to: "/admin/logs", label: "Logs", icon: IconLogs },
      { to: "/admin/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  "/admin": { title: "Executive Dashboard", sub: "Voice CRM performance at a glance" },
  "/admin/analytics": { title: "Analytics", sub: "Trends across enquiries, calls, and dispositions" },
  "/admin/reports": { title: "Reports", sub: "Saved and exportable operational reports" },
  "/admin/contacts": { title: "Contacts", sub: "People and companies from voice enquiries" },
  "/admin/import": { title: "Import Wizard", sub: "Map CSV or spreadsheet columns into contacts" },
  "/admin/requirements": { title: "Requirements", sub: "Collected customer requirements" },
  "/admin/responses": { title: "Responses", sub: "CRM-tagged customer replies" },
  "/admin/bot": { title: "Call Bot", sub: "Live voice enquiry console" },
  "/admin/campaigns": { title: "Campaigns", sub: "Bulk AI outbound calling" },
  "/admin/live": { title: "Live Calls", sub: "Monitor active and recent voice sessions" },
  "/admin/calls": { title: "Calls", sub: "Mimic outbound + disposition CRM" },
  "/admin/timeline": { title: "Call Timeline", sub: "Chronological events across sessions" },
  "/admin/conversations": { title: "Conversations", sub: "Browse turn-by-turn transcripts" },
  "/admin/recordings": { title: "Recordings & Transcripts", sub: "Playback and review call content" },
  "/admin/agents": { title: "AI Agents", sub: "Voice personas and languages" },
  "/admin/knowledge": { title: "Knowledge Base", sub: "Scripts and service facts for agents" },
  "/admin/notifications": { title: "Notifications", sub: "Alerts and system updates" },
  "/admin/users": { title: "Users & Roles", sub: "Access control for your workspace" },
  "/admin/logs": { title: "Logs", sub: "Conversation event stream" },
  "/admin/settings": { title: "Settings", sub: "Voice, theme, exports, and account" },
};

function pathMeta(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/admin";
  if (TITLES[path]) return TITLES[path];
  const match = Object.keys(TITLES)
    .filter((k) => k !== "/admin" && path.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return (match && TITLES[match]) || { title: "WC . AI", sub: "AI Voice CRM" };
}

export default function AdminShell() {
  // Pathless layout sits between RequireAuth's Outlet and page Outlets —
  // context is not inherited; forward auth so pages can use useOutletContext.
  const auth = useOutletContext<AuthOutletContext>();
  const { email } = auth;
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);

  const meta = useMemo(() => pathMeta(location.pathname), [location.pathname]);
  const isBot = location.pathname.includes("/admin/bot");

  const initials = useMemo(() => {
    const local = email.split("@")[0] || "A";
    return local.slice(0, 2).toUpperCase();
  }, [email]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const n = loadNotifications().filter((x) => !x.read).length;
    setUnread(n);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: CommandItem[] = useMemo(() => {
    const pages: CommandItem[] = NAV_GROUPS.flatMap((g) =>
      g.items.map((item) => ({
        id: item.to,
        label: item.label,
        group: "Navigate",
        hint: g.label,
        path: item.to,
      }))
    );
    const actions: CommandItem[] = [
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        group: "Actions",
        action: toggleTheme,
      },
      {
        id: "import",
        label: "Import contacts",
        group: "Actions",
        path: "/admin/import",
      },
      {
        id: "new-campaign",
        label: "Create campaign",
        group: "Actions",
        path: "/admin/campaigns?new=1",
      },
      {
        id: "logout",
        label: "Log out",
        group: "Actions",
        action: () => {
          clearAdminToken();
          navigate("/admin/login", { replace: true });
        },
      },
    ];
    return [...pages, ...actions];
  }, [navigate, theme, toggleTheme]);

  function onLogout() {
    clearAdminToken();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div
      className={`crm-shell ent-shell${isBot ? " crm-shell-bot" : ""}${collapsed ? " ent-collapsed" : ""}${navOpen ? " ent-nav-open" : ""}`}
      data-theme={theme}
    >
      <div className="ent-nav-scrim" onClick={() => setNavOpen(false)} aria-hidden={!navOpen} />

      <aside className="crm-sidebar ent-sidebar" aria-label="Main navigation">
        <div className="crm-brand ent-brand">
          <span className="crm-brand-mark">WC</span>
          <div className="ent-brand-copy">
            <span className="crm-brand-text">WC . AI</span>
            <span className="ent-brand-sub">Voice CRM</span>
          </div>
        </div>

        <nav className="crm-nav ent-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="ent-nav-group">
              <div className="ent-nav-group-label">{group.label}</div>
              {group.items.map(({ to, end, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `crm-nav-item${isActive ? " active" : ""}`}
                  title={label}
                >
                  <Icon />
                  <span className="ent-nav-text">{label}</span>
                  <span className="crm-nav-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="crm-sidebar-foot ent-sidebar-foot">
          <button type="button" className="crm-logout" onClick={onLogout}>
            Log out
          </button>
          <button
            type="button"
            className="ent-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
      </aside>

      <div className="crm-main ent-main">
        <header className="crm-topbar ent-topbar">
          <button
            type="button"
            className="ui-icon-btn ent-menu-btn"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <IconMenu />
          </button>

          <button
            type="button"
            className="crm-search ent-cmd-trigger"
            onClick={() => setCmdOpen(true)}
            aria-label="Open command palette"
          >
            <IconSearch className="crm-search-icon" />
            <span>Search or jump to…</span>
            <kbd className="ent-kbd">⌘K</kbd>
          </button>

          <div className="crm-topbar-right">
            <button
              type="button"
              className="crm-icon-btn"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
            <button
              type="button"
              className="crm-icon-btn ent-bell"
              title="Notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              onClick={() => navigate("/admin/notifications")}
            >
              <IconBell />
              {unread > 0 ? <span className="ent-badge-dot" aria-hidden /> : null}
            </button>
            <div className="crm-user">
              <div className="crm-user-meta">
                <div className="crm-user-name">{email.split("@")[0]}</div>
                <div className="crm-user-email">{email}</div>
              </div>
              <div className="crm-avatar" aria-hidden>
                {initials}
              </div>
            </div>
          </div>
        </header>

        {!isBot && (
          <div className="crm-page-head ent-page-head">
            <div>
              <h1 className="crm-page-title">{meta.title}</h1>
              <p className="crm-page-sub">{meta.sub}</p>
            </div>
          </div>
        )}

        <div className={`crm-content${isBot ? " crm-content-bot" : ""}`}>
          <Outlet context={auth} />
        </div>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={commands} />
    </div>
  );
}
