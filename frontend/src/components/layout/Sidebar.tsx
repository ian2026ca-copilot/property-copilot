"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import AIDrawer from "./AIDrawer";
import { hasMinRole, type Role } from "@/lib/roles";

const NAV: { label: string; href: string; icon: string; minRole: Role }[] = [
  { label: "Dashboard",   href: "/dashboard",   minRole: "OWNER",   icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { label: "Properties",  href: "/properties",  minRole: "OWNER",   icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { label: "Vacancy",     href: "/vacancy",     minRole: "OWNER",   icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { label: "Tenants",     href: "/tenants",     minRole: "OWNER",   icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Leases",      href: "/leases",      minRole: "OWNER",   icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { label: "Payments",    href: "/payments",    minRole: "OWNER",   icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { label: "Screening",   href: "/screening",   minRole: "OWNER",   icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Marketing",   href: "/marketing",   minRole: "OWNER",   icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
  { label: "Maintenance", href: "/maintenance", minRole: "OWNER",   icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Team",        href: "/team",        minRole: "OWNER",   icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Settings",    href: "/settings",    minRole: "OWNER",   icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

const ROLE_LABELS: Record<string, string> = {
  OWNER:   "Owner",
  TENANT:  "Tenant",
};

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      {d.split("M").filter(Boolean).map((seg, i) => (
        <path key={i} strokeLinecap="round" strokeLinejoin="round" d={`M${seg}`} />
      ))}
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const role = user?.role;
  const visibleNav = NAV.filter((item) => hasMinRole(role, item.minRole));

  return (
    <>
      <aside
        className={`flex flex-col bg-black shrink-0 h-screen sticky top-0 transition-all duration-200 ${collapsed ? "w-[56px]" : "w-[200px]"}`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3.5 h-14 border-b border-white/10 shrink-0">
          <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center text-black font-black text-[11px] shrink-0">
            PC
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold leading-none truncate">PropertyCopilot</p>
              <p className="text-white/40 text-[10px] leading-none mt-0.5">AI operations</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors group ${
                  active
                    ? "bg-white text-black"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <NavIcon d={item.icon} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-2 py-3 border-t border-white/10 space-y-1 shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            title={collapsed ? "AI Assistant" : undefined}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
            {!collapsed && <span>AI Copilot</span>}
          </button>

          {/* User */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              title={collapsed ? (user?.full_name ?? "") : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors ${collapsed ? "justify-center" : ""}`}
            >
              <div className="w-[18px] h-[18px] rounded-full bg-white/20 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                {(user?.full_name ?? "U").split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
              {!collapsed && (
                <div className="min-w-0 text-left">
                  <p className="text-white text-[11px] font-medium truncate leading-none">{user?.full_name}</p>
                  <p className="text-white/40 text-[10px] truncate leading-none mt-0.5">{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</p>
                </div>
              )}
            </button>

            {showUserMenu && (
              <div className={`absolute bottom-full mb-1 w-44 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-50 ${collapsed ? "left-0" : "left-0 right-0"}`}>
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user?.full_name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.org_name}</p>
                </div>
                <button
                  onClick={() => { setShowUserMenu(false); logout(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            <svg className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </aside>

      <AIDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
