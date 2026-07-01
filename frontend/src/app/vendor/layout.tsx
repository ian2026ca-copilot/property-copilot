"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "VENDOR") { router.replace("/dashboard"); return; }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "VENDOR") return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-black flex items-center justify-center text-white font-black text-[11px]">PC</div>
          <p className="text-sm font-semibold text-slate-900">Vendor Portal</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-slate-600">{user.full_name}</p>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Sign out</button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
