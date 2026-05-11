import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface SuperAdminSession {
  email: string;
  masterSecret: string;
  loggedInAt: number;
}

interface Ctx {
  session: SuperAdminSession | null;
  login: (s: SuperAdminSession) => void;
  logout: () => void;
}

const SuperAdminCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "tivo_super_admin";

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SuperAdminSession | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {}
  }, []);

  const login = (s: SuperAdminSession) => {
    setSession(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };
  const logout = () => {
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return <SuperAdminCtx.Provider value={{ session, login, logout }}>{children}</SuperAdminCtx.Provider>;
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminCtx);
  if (!ctx) throw new Error("useSuperAdmin must be used inside SuperAdminProvider");
  return ctx;
}
