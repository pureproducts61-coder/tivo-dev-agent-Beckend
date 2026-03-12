import { useState, useEffect, useCallback } from "react";
import { backendFetch } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Users, CreditCard, Database, Shield,
  Search, Plus, Ban, CheckCircle, XCircle, LogOut,
  RefreshCw, Server, Zap,
} from "lucide-react";

interface AdminState {
  authenticated: boolean;
  token: string;
}

const AdminDashboard = () => {
  const [admin, setAdmin] = useState<AdminState>({ authenticated: false, token: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Dashboard state
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "payments" | "logs">("overview");
  const [creditAmount, setCreditAmount] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!admin.authenticated) return;
    setRefreshing(true);
    try {
      const [h, s, u, p, l] = await Promise.all([
        backendFetch("health"),
        backendFetch("stats", { masterSecret: admin.token }),
        backendFetch("users", { masterSecret: admin.token }),
        backendFetch("payments", { masterSecret: admin.token, params: { status: "pending" } }),
        backendFetch("logs", { masterSecret: admin.token, params: { limit: "30" } }),
      ]);
      setHealth(h);
      setStats(s);
      setUsers(u.users || []);
      setPayments(p.payments || []);
      setLogs(l.logs || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setRefreshing(false);
  }, [admin, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await backendFetch("admin-login", {
        method: "POST",
        body: { email, password },
        masterSecret: "temp",
      });
      // Admin login uses master secret internally, but we need the actual secret
      // The token returned IS the master secret for subsequent calls
      setAdmin({ authenticated: true, token: data.token });
      toast({ title: "Admin Login সফল!" });
    } catch (e: any) {
      toast({ title: "Login ব্যর্থ", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const searchUsers = async () => {
    try {
      const data = await backendFetch("users", {
        masterSecret: admin.token,
        params: searchEmail ? { email: searchEmail } : {},
      });
      setUsers(data.users || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const addCredits = async (userId: string) => {
    const credits = parseInt(creditAmount);
    if (!credits || credits <= 0) return;
    try {
      await backendFetch("add-credits", {
        method: "POST",
        body: { user_id: userId, credits },
        masterSecret: admin.token,
      });
      toast({ title: `${credits} ক্রেডিট যোগ করা হয়েছে` });
      setCreditAmount("");
      fetchAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const toggleBlock = async (userId: string, block: boolean) => {
    try {
      await backendFetch("block-user", {
        method: "POST",
        body: { user_id: userId, blocked: block },
        masterSecret: admin.token,
      });
      toast({ title: block ? "ইউজার ব্লক হয়েছে" : "ইউজার আনব্লক হয়েছে" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const approvePayment = async (paymentId: string, credits: number) => {
    try {
      await backendFetch("approve-payment", {
        method: "POST",
        body: { payment_id: paymentId, credits },
        masterSecret: admin.token,
      });
      toast({ title: "পেমেন্ট অনুমোদিত" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const rejectPayment = async (paymentId: string) => {
    try {
      await backendFetch("reject-payment", {
        method: "POST",
        body: { payment_id: paymentId, admin_note: "Rejected by admin" },
        masterSecret: admin.token,
      });
      toast({ title: "পেমেন্ট প্রত্যাখ্যাত" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // === LOGIN SCREEN ===
  if (!admin.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                <Shield className="h-7 w-7 text-primary" />
              </div>
            </div>
            <CardTitle className="text-xl">TIVO AI OS Admin</CardTitle>
            <p className="text-sm text-muted-foreground">Backend Engine Dashboard</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input placeholder="Admin Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Admin Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === DASHBOARD ===
  const tabs = [
    { key: "overview" as const, label: "Overview", icon: Activity },
    { key: "users" as const, label: "Users", icon: Users },
    { key: "payments" as const, label: "Payments", icon: CreditCard },
    { key: "logs" as const, label: "Logs", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">TIVO AI OS</h1>
            <p className="text-[10px] text-muted-foreground">Backend Engine v1.0</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setAdmin({ authenticated: false, token: "" })}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-5xl mx-auto space-y-4">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <>
            {/* Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" /> System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {health ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={health.status === "online" ? "default" : "destructive"}>
                        {health.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Database</span>
                      <Badge variant={health.database === "connected" ? "default" : "destructive"}>
                        {health.database}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="text-foreground">{health.version}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                )}
              </CardContent>
            </Card>

            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Users", value: stats.total_users, icon: Users },
                  { label: "Pending Payments", value: stats.pending_payments, icon: CreditCard },
                  { label: "Projects", value: stats.total_projects, icon: Database },
                  { label: "Log Entries", value: stats.total_logs, icon: Activity },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <s.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Backend URL Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">🔗 API Connection Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Backend URL</p>
                  <code className="text-xs bg-secondary px-2 py-1 rounded block break-all">
                    {import.meta.env.VITE_SUPABASE_URL}/functions/v1/backend-api
                  </code>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Auth Header</p>
                  <code className="text-xs bg-secondary px-2 py-1 rounded block">
                    x-master-secret: YOUR_MASTER_SECRET
                  </code>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* USERS TAB */}
        {activeTab === "users" && (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="ইমেইল দিয়ে সার্চ করুন..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="flex-1"
              />
              <Button onClick={searchUsers} size="icon"><Search className="h-4 w-4" /></Button>
            </div>
            <ScrollArea className="h-[60vh]">
              <div className="space-y-2">
                {users.map((u) => (
                  <Card key={u.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.display_name || "No Name"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={u.is_blocked ? "destructive" : "default"}>
                            {u.is_blocked ? "Blocked" : `${u.credits} credits`}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="Credits"
                          type="number"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          className="w-24 h-8 text-xs"
                        />
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addCredits(u.user_id)}>
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                        <Button
                          size="sm"
                          variant={u.is_blocked ? "outline" : "destructive"}
                          className="h-8 text-xs"
                          onClick={() => toggleBlock(u.user_id, !u.is_blocked)}
                        >
                          <Ban className="h-3 w-3 mr-1" /> {u.is_blocked ? "Unblock" : "Block"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {users.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">কোনো ইউজার নেই</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === "payments" && (
          <ScrollArea className="h-[70vh]">
            <div className="space-y-2">
              {payments.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-foreground">TxID: {p.transaction_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.payment_method.toUpperCase()} • ৳{p.amount}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleString("bn-BD")}
                        </p>
                      </div>
                      <Badge>{p.status}</Badge>
                    </div>
                    {p.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={() => approvePayment(p.id, p.amount)}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => rejectPayment(p.id)}>
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {payments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">কোনো পেন্ডিং পেমেন্ট নেই</p>
              )}
            </div>
          </ScrollArea>
        )}

        {/* LOGS TAB */}
        {activeTab === "logs" && (
          <ScrollArea className="h-[70vh]">
            <div className="space-y-1">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-2 p-2 rounded-md bg-card border border-border">
                  <Activity className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{l.action}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {JSON.stringify(l.details)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(l.created_at).toLocaleString("bn-BD")}
                    </p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">কোনো লগ নেই</p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
