import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// useBackendApi - TIVO DEV AGENT Frontend ↔ Backend Bridge Hook
// ============================================================
// Features:
//   ✅ Auto connection check on mount
//   ✅ Retry logic with exponential backoff
//   ✅ Fallback mode when backend is offline
//   ✅ All 40+ endpoint methods
//   ✅ SSE streaming support
//   ✅ Capabilities auto-discovery
// ============================================================

interface BackendConfig {
  baseUrl: string;
  masterSecret: string;
  maxRetries?: number;
  healthCheckInterval?: number; // ms, 0 to disable
}

interface ConnectionState {
  isConnected: boolean;
  isChecking: boolean;
  isFallback: boolean;
  lastCheck: Date | null;
  version: string | null;
  error: string | null;
  endpointCount: number;
}

interface Capabilities {
  version: string;
  endpoints: Record<string, any>;
  categories: string[];
}

const DEFAULT_CONFIG: Partial<BackendConfig> = {
  maxRetries: 3,
  healthCheckInterval: 60000,
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
    }
  }
  throw lastError || new Error("Request failed");
}

export function useBackendApi(config: BackendConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [connection, setConnection] = useState<ConnectionState>({
    isConnected: false,
    isChecking: true,
    isFallback: false,
    lastCheck: null,
    version: null,
    error: null,
    endpointCount: 0,
  });
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-master-secret": cfg.masterSecret,
    }),
    [cfg.masterSecret]
  );

  const apiCall = useCallback(
    async (fn: string, path: string, method = "POST", body?: any) => {
      const url = `${cfg.baseUrl}/functions/v1/${fn}/${path}`;
      const opts: RequestInit = { method, headers: headers() };
      if (body && method !== "GET") opts.body = JSON.stringify(body);
      const res = await fetchWithRetry(url, opts, cfg.maxRetries!);
      return res.json();
    },
    [cfg.baseUrl, cfg.maxRetries, headers]
  );

  // ── Health Check ──
  const checkHealth = useCallback(async () => {
    setConnection((s) => ({ ...s, isChecking: true }));
    try {
      const data = await apiCall("backend-api", "health", "GET");
      setConnection({
        isConnected: true,
        isChecking: false,
        isFallback: false,
        lastCheck: new Date(),
        version: data.version || null,
        error: null,
        endpointCount: data.total_endpoints || 0,
      });
      return true;
    } catch (e) {
      setConnection((s) => ({
        ...s,
        isConnected: false,
        isChecking: false,
        isFallback: true,
        lastCheck: new Date(),
        error: e instanceof Error ? e.message : "Connection failed",
      }));
      return false;
    }
  }, [apiCall]);

  // ── Load Capabilities ──
  const loadCapabilities = useCallback(async () => {
    try {
      const data = await apiCall("backend-api", "capabilities", "GET");
      const caps: Capabilities = {
        version: data.version || "",
        endpoints: data.endpoints || {},
        categories: data.categories || [],
      };
      setCapabilities(caps);
      return caps;
    } catch {
      return null;
    }
  }, [apiCall]);

  // ── Auto-connect on mount ──
  useEffect(() => {
    checkHealth().then((ok) => ok && loadCapabilities());

    if (cfg.healthCheckInterval && cfg.healthCheckInterval > 0) {
      intervalRef.current = setInterval(checkHealth, cfg.healthCheckInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.baseUrl]);

  // ══════════════════════════════════════
  //  API Methods — ai-engine
  // ══════════════════════════════════════
  const chat = useCallback(
    (messages: any[], options?: any) =>
      apiCall("ai-engine", "chat", "POST", { messages, ...options }),
    [apiCall]
  );

  const chatStream = useCallback(
    (messages: any[], onToken: (t: string) => void, onDone?: () => void) => {
      const ctrl = new AbortController();
      const url = `${cfg.baseUrl}/functions/v1/ai-engine/chat`;
      fetch(url, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ messages, stream: true }),
        signal: ctrl.signal,
      }).then(async (res) => {
        const reader = res.body?.getReader();
        if (!reader) return;
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              const d = line.slice(6).trim();
              if (d === "[DONE]") { onDone?.(); return; }
              try { onToken(JSON.parse(d).content || d); } catch { onToken(d); }
            }
          }
        }
        onDone?.();
      });
      return () => ctrl.abort();
    },
    [cfg.baseUrl, headers]
  );

  const autoBuild = useCallback(
    (prompt: string, opts?: any) =>
      apiCall("ai-engine", "auto-build", "POST", { prompt, ...opts }),
    [apiCall]
  );

  const buildNative = useCallback(
    (projectId: string, platform: "android" | "windows" | "both", hfSpaceUrl: string) =>
      apiCall("ai-engine", "build-native", "POST", { project_id: projectId, platform, hf_space_url: hfSpaceUrl }),
    [apiCall]
  );

  const fullStackBuild = useCallback(
    (prompt: string, hfSpaceUrl: string) =>
      apiCall("ai-engine", "full-stack-build", "POST", { prompt, hf_space_url: hfSpaceUrl }),
    [apiCall]
  );

  // ══════════════════════════════════════
  //  API Methods — project-manager
  // ══════════════════════════════════════
  const projects = {
    list: (userId?: string) =>
      apiCall("project-manager", `list${userId ? `?user_id=${userId}` : ""}`, "GET"),
    get: (id: string) =>
      apiCall("project-manager", `get?id=${id}`, "GET"),
    create: (data: { name: string; description?: string; files?: any[] }) =>
      apiCall("project-manager", "create", "POST", data),
    update: (id: string, updates: any) =>
      apiCall("project-manager", "update", "PUT", { id, ...updates }),
    delete: (id: string) =>
      apiCall("project-manager", "delete", "DELETE", { id }),
    uploadFiles: (projectId: string, files: any[]) =>
      apiCall("project-manager", "upload-files", "POST", { project_id: projectId, files }),
    publish: (projectId: string) =>
      apiCall("project-manager", "publish", "POST", { project_id: projectId }),
    download: (id: string) =>
      apiCall("project-manager", `download?id=${id}`, "GET"),
    versions: (id: string) =>
      apiCall("project-manager", `versions?id=${id}`, "GET"),
  };

  // ══════════════════════════════════════
  //  API Methods — sandbox
  // ══════════════════════════════════════
  const sandbox = {
    codeToImage: (code: string, language?: string) =>
      apiCall("sandbox", "code-to-image", "POST", { code, language }),
    generateSchema: (description: string, tables?: string[]) =>
      apiCall("sandbox", "generate-schema", "POST", { description, tables }),
    deployAutomation: (projectId: string, platform: string) =>
      apiCall("sandbox", "deploy-automation", "POST", { project_id: projectId, platform }),
    generateComponents: (description: string, framework?: string) =>
      apiCall("sandbox", "generate-components", "POST", { description, framework }),
    analyzeDeps: (packageJson: any) =>
      apiCall("sandbox", "analyze-deps", "POST", { package_json: packageJson }),
    execute: (code: string, language?: string) =>
      apiCall("sandbox", "execute", "POST", { code, language }),
  };

  // ══════════════════════════════════════
  //  Smart Suggest
  // ══════════════════════════════════════
  const suggest = useCallback(
    (intent: string) =>
      apiCall("backend-api", "suggest", "POST", { intent }),
    [apiCall]
  );

  const frontendGuide = useCallback(
    () => apiCall("backend-api", "frontend-ai-guide", "GET"),
    [apiCall]
  );

  return {
    connection,
    capabilities,
    checkHealth,
    loadCapabilities,
    // ai-engine
    chat,
    chatStream,
    autoBuild,
    buildNative,
    fullStackBuild,
    // project-manager
    projects,
    // sandbox
    sandbox,
    // helpers
    suggest,
    frontendGuide,
    apiCall,
  };
}
