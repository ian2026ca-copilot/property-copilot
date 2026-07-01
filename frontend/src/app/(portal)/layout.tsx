"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "TENANT") { router.replace("/dashboard"); return; }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "TENANT") return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-black h-14 flex items-center px-4 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
            <span className="text-black text-[11px] font-black">PC</span>
          </div>
          <span className="text-white text-sm font-semibold hidden sm:block">PropertyCopilot</span>
          <span className="text-white/40 text-xs mx-2 hidden sm:block">·</span>
          <span className="text-white/60 text-xs hidden sm:block">Tenant Portal</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-white/60 text-xs hidden sm:block">{user.full_name}</span>
          <button
            onClick={logout}
            className="text-white/50 text-xs hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
