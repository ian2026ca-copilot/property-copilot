"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { clearToken } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role === "TENANT") { router.replace("/portal"); return; }
    if (user.role === "VENDOR") { router.replace("/vendor"); return; }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role === "TENANT" || user.role === "VENDOR") return null;

  function exitImpersonation() {
    clearToken();
    window.location.href = "/admin";
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-auto min-w-0">
        {user.impersonated && (
          <div className="bg-violet-600 text-white text-xs px-4 py-2 flex items-center justify-between">
            <span>Admin session — viewing as {user.full_name} ({user.email})</span>
            <button onClick={exitImpersonation} className="font-medium underline hover:no-underline">
              Exit to admin
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
