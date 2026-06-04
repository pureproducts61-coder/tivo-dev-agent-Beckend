import { useCallback, useEffect, useRef, useState } from "react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

export interface Alert {
  id: string;
  title: string;
  message: string;
  level: "info" | "warning" | "critical";
  created_at: string;
  read_at: string | null;
}

const POLL_MS = 30000;

export function useAlerts() {
  const { session } = useSuperAdmin();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnread] = useState(0);
  const t = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`${BACKEND}/functions/v1/backend-api/notifications/list`, {
        method: "GET",
        headers: { "x-master-secret": session.masterSecret },
      });
      if (!res.ok) return;
      const data = await res.json();
      const items: Alert[] = data.notifications ?? data.items ?? [];
      setAlerts(items.slice(0, 50));
      setUnread(items.filter((a) => !a.read_at).length);
    } catch {
      /* offline ok */
    }
  }, [session]);

  const markAllRead = useCallback(async () => {
    if (!session) return;
    setAlerts((prev) => prev.map((a) => ({ ...a, read_at: new Date().toISOString() })));
    setUnread(0);
    try {
      await fetch(`${BACKEND}/functions/v1/backend-api/notifications/mark-all-read`, {
        method: "POST",
        headers: { "x-master-secret": session.masterSecret, "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {}
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetchAlerts();
    t.current = setInterval(fetchAlerts, POLL_MS);
    return () => {
      if (t.current) clearInterval(t.current);
    };
  }, [session, fetchAlerts]);

  return { alerts, unreadCount, markAllRead, refresh: fetchAlerts };
}
