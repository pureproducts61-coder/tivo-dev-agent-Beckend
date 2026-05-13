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
const TTL_MS = 30 * 60 * 1000; // 30 min

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SuperAdminSession | null>(null);

  useEffect(() => {
    try {
      // sessionStorage clears on tab close; add a TTL for extra safety
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SuperAdminSession = JSON.parse(raw);
        if (parsed.loggedInAt && Date.now() - parsed.loggedInAt < TTL_MS) {
          setSession(parsed);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
      // Migrate-away: ensure we never leave the secret in localStorage from prior versions
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const login = (s: SuperAdminSession) => {
    setSession(s);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };
  const logout = () => {
    setSession(null);
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  };

  return <SuperAdminCtx.Provider value={{ session, login, logout }}>{children}</SuperAdminCtx.Provider>;
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminCtx);
  if (!ctx) throw new Error("useSuperAdmin must be used inside SuperAdminProvider");
  return ctx;
}
