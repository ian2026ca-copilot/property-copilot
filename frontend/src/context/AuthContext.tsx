"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthUser, clearToken, getToken } from "@/lib/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = async () => {
    // Dev mock — no backend needed to preview pages
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === "true") {
      setUser({
        id: "mock-1",
        email: "demo@propertycopilot.com",
        full_name: "Alex Morgan",
        org_id: "org-1",
        org_name: "Copilot Demo Co.",
        role: "MANAGER",
      });
      setLoading(false);
      return;
    }

    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const me = await api.get<AuthUser>("/auth/me");
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const logout = () => {
    clearToken();
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
