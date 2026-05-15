import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

export default function SuperAdminLogin() {
  const nav = useNavigate();
  const { login } = useSuperAdmin();
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function verify(method: "secret" | "google" | "magic-link-request", emailVal: string, secretVal?: string, accessToken?: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${BACKEND}/functions/v1/backend-api/super-admin-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, email: emailVal, secret: secretVal, access_token: accessToken, redirect_to: `${window.location.origin}/super-admin/login` }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Login failed");
      if (method === "magic-link-request") { setErr("✉️ Magic link পাঠানো হয়েছে — ইমেইল চেক করুন"); return; }
      login({ email: data.email, masterSecret: data.master_secret, loggedInAt: Date.now() });
      nav("/super-admin/workspace");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/super-admin/login` },
    });
    if (error) { setErr(error.message); setBusy(false); }
    // After redirect, useEffect below handles session
  }

  // After Google redirect: pick up Supabase session and verify with access_token
  useState(() => {
    supabase.auth.getSession().then(({ data }) => {
      const userEmail = data.session?.user?.email;
      const accessToken = data.session?.access_token;
      if (userEmail && accessToken && !err) verify("google", userEmail, undefined, accessToken);
    });
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">🔐 Super Admin Login</h1>
          <p className="text-sm text-zinc-400">শুধু অনুমোদিত ইমেইল প্রবেশ করতে পারবে</p>
        </div>

        <div className="space-y-3 border border-zinc-800 rounded-xl p-5">
          <button
            onClick={handleGoogle}
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition disabled:opacity-50"
          >
            🔓 Sign in with Google
          </button>

          <div className="text-center text-xs text-zinc-600 my-2">— OR —</div>

          <input
            type="email"
            placeholder="Super Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
          />
          <input
            type="password"
            placeholder="SUPER_ADMIN_MASTER_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
          />
          <button
            onClick={() => verify("secret", email, secret)}
            disabled={busy || !email || !secret}
            className="w-full py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 transition font-medium disabled:opacity-50"
          >
            {busy ? "Verifying..." : "Login with Secret"}
          </button>

          {err && <div className="text-sm text-red-400 text-center">{err}</div>}
        </div>

        <div className="text-center">
          <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Back to Status</a>
        </div>
      </div>
    </main>
  );
}
