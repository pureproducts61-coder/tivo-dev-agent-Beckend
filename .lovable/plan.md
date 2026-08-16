# TIVO Master Implementation Plan (planning only — no code changes)

Scope note: everything below was verified by reading the current files. No edits were made.

## A) Current architecture map

```text
Browser (Vite/React SPA + minimal SW + Capacitor wrapper)
  │  SuperAdminContext (sessionStorage: email + masterSecret)
  ├─ supabase-js  ──► Postgres (RLS) : projects, conversations, messages,
  │                    proposed_changes, notifications, job_queue, ai_constitution, ...
  └─ fetch + x-master-secret ──► Edge functions
        ai-engine (886 L)      chat/generate/auto-build/build-native/full-stack-build
        backend-api (1470 L)   ~70 actions: auth, proposals, notifications, credentials,
                               memory, kill-switch, cost, backup, sync/event, system-report
        project-manager (437)  CRUD, upload, publish, versions, download
        sandbox (450)          "execute", code-to-image, generate-schema, components
Providers: Lovable Gateway (primary) → Gemini direct → HF router (text-only fallbacks)
External: hf-docker/ (nginx + server.js, APK/EXE scripts) via hf_space_url; Replit worker
          (REPLIT_WORKER_GUIDE.md) polling job_queue
```

Key finding: the AI brain is hardwired to Lovable Gateway inside `ai-engine/callAI` (line ~133). Gemini/HF are hardcoded emergency fallbacks, not a router.

## B) UI / page / component map

- Public: `PublicStatus` (catch-all `*`), `TenantOnboarding`.
- Auth: `SuperAdminLogin`.
- Shell `/super-admin/app` (AppShell): sidebar Chat / Approvals / Projects / Users; routes also include `conversations` (Chats) and `system` (System) with no sidebar entry.
- Legacy standalone routes: `SuperAdminWorkspace` (286 L, second chat UI), `SuperAdminDashboard` (585 L), `SuperAdminDebug` (263 L), `HybridSettings` (141 L).
- Overlays: `SettingsSheet` (222 L; Tools grid + provider keys), `VariablesPanel`, `SecurityScanPanel`, `AlertsPanel` (inside AppShell), `SuggestionChips`, `ChatInput` 3-dot action menu.
- Duplication confirmed: `System.tsx` tiles link to dashboard/debug/hybrid/workspace, and `SettingsSheet` links to the same four — same feature, two UIs. `HybridSettings` page and `SettingsSheet` provider-key block are near-identical code.

## C) Feature inventory — KEEP / MERGE / MOVE / REBUILD / REMOVE

| Item | Verdict | Notes |
|---|---|---|
| AppShell, sidebar, AlertsPanel | KEEP + extend | add Builds, Activity, AI Models; keep Users behind Settings → System |
| ChatScreen + ChatInput + SuggestionChips + ChatMessage | KEEP | only regroup 3-dot actions into Tools categories (Build/Test/Fix/Audit/Preview/Deploy/Security/Research) |
| `admin/System.tsx` | MERGE into SettingsSheet | keep route as redirect until links verified |
| `HybridSettings` page | MERGE into SettingsSheet → AI Providers tab | keep route as redirect (deep links exist in System tiles + Settings) |
| `SuperAdminWorkspace` (2nd chat) | REBUILD-as-removed later | verify no feature exists only there before removal |
| `SuperAdminDashboard` | MERGE → Activity page (reports/audit) | large; extract panels rather than rewrite |
| `SuperAdminDebug` | MOVE → Settings → Advanced | diagnostics only |
| `Chats.tsx` (conversations list) | MERGE into Chat screen drawer | |
| `Users.tsx`, `TenantOnboarding` | MOVE to Settings → System (not primary) | still functional, keep |
| `PublicStatus` | KEEP as landing | |
| hf-docker + `.github/workflows/deploy-hf.yml` | KEEP as optional ExternalBuildRuntime | classify: `server.js`/nginx/build-apk/build-exe = active-optional; root `server.js`+`Dockerfile` = legacy static server; `REPLIT_*.md` = fallback docs |
| `sandbox/execute` | REBUILD | not real execution (see E/H) |
| Hardcoded `TIVO_CONSTITUTION` in ChatScreen | MERGE → DB `ai_constitution` | |

## D) UI → backend → DB → provider dependency map

- Chat: ChatScreen → `ai-engine/chat` (SSE when `stream:true`) → `callAI` → Gateway/Gemini/HF → messages/conversations tables.
- Approvals: `Approvals.tsx` writes `proposed_changes.status` directly via supabase-js; trigger `on_proposal_status_change` inserts notification + `job_queue` row on `approved`.
- Builds: ChatScreen/hook → `ai-engine/build-native|full-stack-build` → requires `hf_space_url` (`isSafeHfSpaceUrl`) → hf-docker server → `projects.installer_url`.
- Credentials: SettingsSheet/HybridSettings → `backend-api/credentials/*` → `system_credentials` (+`credential_history`).
- Heavy work: `job_queue` ← trigger/UI, → Replit worker.

Confirmed inconsistencies:
1. `backend-api/proposals/decide` writes `rejected` (line 834) while `Approvals.tsx` and the DB trigger use `denied` — a deny through the API never fires the trigger and never appears in the Approvals history tab.
2. Streaming bypasses fallback: `tryFallback()` returns `null` when `stream` is true (ai-engine ~line 139), so if Gateway fails on a streaming chat the request errors instead of degrading to Gemini/HF.
3. Credential naming mismatch: UI uses `geminiKey/deepseekKey/groqKey/hfToken/tavilyKey/githubToken`; backend `credentials/test` expects `GEMINI_API_KEY`, `HF_INFERENCE_TOKEN`, etc. SettingsSheet passes the short `testName` (`gemini`, `hf`) → tests fall through to failure.
4. Two constitutions: frontend string vs `ai_constitution` table.

## E) Offline capability matrix

| Capability | Today | Verdict |
|---|---|---|
| App shell load offline | No — `public/sw.js` is network-first with **no precache**, cache never populated | can be made offline (precache + stale-while-revalidate) |
| Settings/provider keys | Works (sessionStorage) but lost on tab close | can be made offline (IndexedDB, encrypted) |
| Conversations/projects list | Cloud-only (supabase-js) | can be offline-first with IndexedDB mirror + sync queue |
| Chat inference | Cloud-only | offline only via local model runtime (F) |
| Approvals, credentials, notifications, cost, backup | Cloud-only | keep cloud-only |
| Build APK/EXE | External HF only | stays external/local-desktop only |
| Capacitor | `capacitor.config.ts` sets `server.url` to the Lovable sandbox → native app loads remote HTML and **cannot work offline**; must ship `webDir: dist` without `server.url` for production |

## F) Local model architecture recommendation

- Web/PWA: WebGPU runtime (transformers.js / WebLLM) + OPFS/Cache-Storage model store; small quantized models only.
- Android (Capacitor): native plugin over llama.cpp/MediaPipe; models in app-private storage, resumable download + SHA-256 integrity.
- Desktop: local llama.cpp/Ollama HTTP endpoint discovered as a provider.
- Contract: `ModelProvider { id, kind: 'remote'|'local', capabilities, stream() }` and a `ModelStore { list, download, cancel, verify, delete, capabilityCheck }`. UI never touches inference directly. Explicitly separate remote HF Inference (a remote provider) from downloaded local execution.

## G) Runtime architecture

`RuntimeAdapter { run(cmd), fs, logs, capabilities }` with three implementations: CloudRuntime (edge/queue-backed), LocalRuntime (device/desktop process), ExternalBuildRuntime (HF/Replit/Docker). Selection is config-driven; the AI router never imports a runtime directly.

## H) Build / test / fix / preview / publish

Reality check: `sandbox/execute` sends the command to an LLM and returns invented JSON — it is AI-simulated, not OS execution. `generate-project`/`auto-build` are real file generation; `build-native` is a real toolchain, but only through the HF Space. Real path forward: job_queue → Replit/local worker executes install/build/test → logs + error capture back to DB → AI fix proposal → approval → retest. Preview stays as generated HTML in the `project-files` bucket (already working) until a real dev-server runtime exists.

## I) Security & credential architecture

Single canonical secret registry in `system_credentials` with canonical UPPER_SNAKE names; UI must send those names. Master secret stays sessionStorage-only; prefer the JWT path already added to backend-api. Provider keys entered locally must never be written to localStorage. Approvals remain the gate for every state-changing autonomous action.

## J) Phased order (credit-efficient, no rework)

1. Foundation fixes (small, high value): stream fallback in `callAI`; `denied`/`rejected` unification; credential-name mapping; constitution moved to `ai_constitution` with cached fetch.
2. Navigation consolidation: sidebar = Chat/Projects/Builds/Approvals/Activity + System(AI Models/Settings); System.tsx and HybridSettings become redirects; SettingsSheet becomes the single tabbed config surface (General/AI Providers/AI Models/Credentials/Memory/Security/System/Advanced) by reorganizing existing blocks.
3. Provider router: `ProviderRegistry` + `ModelProvider` in ai-engine, Gateway demoted to one optional entry; model selector reads the registry.
4. Offline shell: real precache SW, IndexedDB mirror + sync queue, production Capacitor config profile.
5. Runtime abstraction + real worker execution over job_queue (build/test/logs/AI fix loop).
6. Project Workspace tabs (Overview/Files/Editor/Terminal/Preview/Builds/Tests/Logs/Versions/Settings) on the now-real runtime.
7. AI Models screen + ModelStore (web first, then Android/desktop).
8. Legacy removal, only after phases 1–7 prove parity.

## K) Pre-removal dependency checks

- `SuperAdminWorkspace`: confirm no endpoint is called only there; check links from System tiles, SettingsSheet, sw.js `notificationclick`.
- `SuperAdminDashboard`: it is the only surface reading proposals/audit/system-report — Activity must cover them first.
- `HybridSettings`/`System` routes: linked from SettingsSheet and System tiles; keep redirects one full phase before deleting.
- `sw.js` opens `/super-admin/dashboard` on notification click — update before that route disappears.
- hf-docker: `ai-engine/build-native` and `full-stack-build` hard-require `hf_space_url`; do not delete until an alternative build adapter works.
- `job_queue` shape is consumed by the Replit worker — coordinate any column change with `REPLIT_WORKER_GUIDE.md`.

## L) Do NOT change

`src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml`; existing migrations (add new ones instead); the already-hardened security code in `backend-api` (rate limits, super-admin gate), `project-manager` (ownership/tenant checks), `hf-docker/server.js` (timing-safe auth, execFile, HMAC downloads) and `hf-docker/nginx.conf` proxy; the working chat streaming UI, SuggestionChips, AlertsPanel and Petals/wordmark styling; RLS deny-all policies on admin tables.
