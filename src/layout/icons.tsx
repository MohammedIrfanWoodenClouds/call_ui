/** Inline SVG nav icons — no icon package. */

import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function base(
  { size = 20, className }: IconProps,
  children: ReactNode
) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconDashboard(p: IconProps) {
  return base(
    p,
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  );
}

export function IconBot(p: IconProps) {
  return base(
    p,
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 8V5" />
      <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.25" fill="currentColor" stroke="none" />
      <path d="M9 17h6" />
    </>
  );
}

export function IconRequirements(p: IconProps) {
  return base(
    p,
    <>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  );
}

export function IconResponses(p: IconProps) {
  return base(
    p,
    <>
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
    </>
  );
}

export function IconCalls(p: IconProps) {
  return base(
    p,
    <>
      <path d="M22 16.92v2.5a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h2.5a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.59a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </>
  );
}

export function IconLogs(p: IconProps) {
  return base(
    p,
    <>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </>
  );
}

export function IconSettings(p: IconProps) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  );
}

export function IconSearch(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 18 },
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  );
}

export function IconBell(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 18 },
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  );
}

export function IconMail(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 18 },
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </>
  );
}

export function IconContacts(p: IconProps) {
  return base(
    p,
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  );
}

export function IconCampaign(p: IconProps) {
  return base(
    p,
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  );
}

export function IconLive(p: IconProps) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a7.1 7.1 0 0 0 0-6M4.6 9a7.1 7.1 0 0 0 0 6" />
      <path d="M22 12a10 10 0 0 0-20 0" />
    </>
  );
}

export function IconTimeline(p: IconProps) {
  return base(
    p,
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <circle cx="12" cy="13" r="2" />
      <path d="M12 15v4" />
      <circle cx="12" cy="21" r="2" />
    </>
  );
}

export function IconConversation(p: IconProps) {
  return base(
    p,
    <>
      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </>
  );
}

export function IconRecording(p: IconProps) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </>
  );
}

export function IconAgents(p: IconProps) {
  return base(
    p,
    <>
      <path d="M12 2a4 4 0 0 1 4 4v1H8V6a4 4 0 0 1 4-4z" />
      <rect x="5" y="9" width="14" height="10" rx="3" />
      <path d="M9 14h.01M15 14h.01M10 17h4" />
    </>
  );
}

export function IconKb(p: IconProps) {
  return base(
    p,
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  );
}

export function IconAnalytics(p: IconProps) {
  return base(
    p,
    <>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </>
  );
}

export function IconReports(p: IconProps) {
  return base(
    p,
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  );
}

export function IconUsers(p: IconProps) {
  return base(
    p,
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  );
}

export function IconImport(p: IconProps) {
  return base(
    p,
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </>
  );
}

export function IconMoon(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 18 },
    <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
  );
}

export function IconSun(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 18 },
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  );
}

export function IconMenu(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 18 },
    <path d="M4 7h16M4 12h16M4 17h16" />
  );
}

export function IconChevron(p: IconProps) {
  return base(
    { ...p, size: p.size ?? 16 },
    <path d="M9 6l6 6-6 6" />
  );
}
