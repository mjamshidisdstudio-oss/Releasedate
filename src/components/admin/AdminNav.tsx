"use client";

import { usePathname } from "next/navigation";
import { api } from "./api";

const LINKS = [
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/releases", label: "Releases" },
  { href: "/admin/sprints", label: "Sprints" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/account", label: "Account" },
];

export function AdminNav({ username }: { username: string }) {
  const pathname = usePathname();
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/admin/login";
  };
  return (
    <header className="admin-header">
      <a className="brand" href="/admin/calendar">
        Release Management
      </a>
      <nav className="admin-nav">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
            {l.label}
          </a>
        ))}
        <a href="/" target="_blank" rel="noreferrer">
          Public calendar ↗
        </a>
      </nav>
      <div className="admin-user">
        {username}
        <button className="btn small" onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}
