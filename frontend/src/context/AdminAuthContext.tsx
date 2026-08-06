"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { adminAuthApi } from "@/lib/adminApi";
import { AdminUser, clearAdminToken, getAdminToken } from "@/lib/adminAuth";

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  loading: true,
  logout: () => {},
  refresh: async () => {},
});

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = async () => {
    const token = getAdminToken();
    if (!token) { setLoading(false); return; }
    try {
      const me = await adminAuthApi.me();
      setAdmin(me);
    } catch {
      clearAdminToken();
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const logout = () => {
    clearAdminToken();
    setAdmin(null);
    router.push("/admin/login");
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, logout, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
