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
// Short-lived tab-scoped session. Master secret never persisted to localStorage.
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function purgeLegacy() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("tivo_super_admin"); // legacy
  } catch {}
}

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SuperAdminSession | null>(null);

  useEffect(() => {
    // Always clear any legacy localStorage copy of the master secret.
    purgeLegacy();
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SuperAdminSession = JSON.parse(raw);
        if (parsed.loggedInAt && Date.now() - parsed.loggedInAt < TTL_MS) {
          setSession(parsed);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {}
  }, []);

  const login = (s: SuperAdminSession) => {
    setSession(s);
    try {
      // sessionStorage is cleared when the tab closes; never write to localStorage.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
    purgeLegacy();
  };
  const logout = () => {
    setSession(null);
    sessionStorage.removeItem(STORAGE_KEY);
    purgeLegacy();
  };

  return <SuperAdminCtx.Provider value={{ session, login, logout }}>{children}</SuperAdminCtx.Provider>;
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminCtx);
  if (!ctx) throw new Error("useSuperAdmin must be used inside SuperAdminProvider");
  return ctx;
}
