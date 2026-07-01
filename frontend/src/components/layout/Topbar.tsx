"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import AIDrawer from "./AIDrawer";

const tabs = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Properties", href: "/properties" },
  { label: "Vacancy", href: "/vacancy" },
  { label: "Tenants", href: "/tenants" },
  { label: "Payments", href: "/payments" },
  { label: "Screening", href: "/screening" },
  { label: "Marketing", href: "/marketing" },
];

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-violet-600",
  MANAGER: "bg-emerald-600",
  AGENT: "bg-sky-600",
  TENANT: "bg-amber-600",
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Property Owner",
  MANAGER: "Property Manager",
  AGENT: "Leasing Agent",
  TENANT: "Tenant",
};

export default function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <>
      <header className="h-12 bg-black flex items-center px-4 gap-6 shrink-0 z-40">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded bg-white flex items-center justify-center text-black font-bold text-[10px] leading-none">
            PC
          </div>
          <div className="hidden sm:block">
            <p className="text-white text-xs font-semibold leading-none">PropertyCopilot</p>
            <p className="text-white/40 text-[10px] leading-none mt-0.5">AI property operations</p>
          </div>
        </Link>

        {/* Module tabs */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const active = pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-white text-black"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
          >
            Run AI review
          </button>

          <button
            onClick={() => setDrawerOpen(true)}
            className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors flex items-center justify-center"
            title="AI Assistant"
          >
            AI
          </button>

          {/* Role pill + user menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className={`px-2.5 py-1 rounded text-white text-xs font-medium transition-colors ${
                ROLE_COLORS[user?.role ?? "MANAGER"] ?? "bg-white/20"
              }`}
            >
              {ROLE_LABELS[user?.role ?? "MANAGER"] ?? user?.role}
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-50">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user?.full_name}</p>
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
        </div>
      </header>

      <AIDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
