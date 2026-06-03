
বন্ধু, এটা অনেক বড় কাজ — একসাথে সব করলে কোনোটাই পরিষ্কার হবে না। আমি এটাকে ৫টি phase-এ ভাগ করে দিচ্ছি, তুমি approve করলে phase-by-phase ship করবো (প্রতিটি phase নিজে নিজে চলবে, ভাঙবে না)।

---

## Phase 1 — Security hardening (Super Admin lock + RLS fixes)

**Backend (edge functions):**
- প্রতিটি sensitive endpoint-এ একটাই gate: `x-master-secret` header **AND** `auth.jwt().email === pureproducts61@gmail.com`। দুটোর একটাও fail হলে → 403 + `security_events` table-এ log + `notifications`-এ alert row insert।
- একটা shared `requireSuperAdmin(req)` helper বানাবো — সব function এটাই use করবে (এখন duplicated code আছে)।

**RLS fixes (scanner findings):**
- `projects` table: UPDATE/DELETE policy-তে `tenant_id` immutability trigger যোগ — cross-tenant manipulation block।
- `proposed_changes`, `notifications`, `security_events` → Realtime publication থেকে remove (deny-all RLS আছে, কিন্তু broadcast leak করতে পারে)। Super Admin আলাদা authenticated channel দিয়ে fetch করবে।

---

## Phase 2 — Audit & alert stream

- `requireSuperAdmin` helper সব success + block event log করবে → `audit_logs` + `notifications` (level: `info` / `warning` / `critical`)।
- Frontend-এ `useRealtimeAlerts()` hook (Super Admin authenticated channel) — top-right bell icon, unread count, toast for `critical`।

---

## Phase 3 — Super Admin Dashboard UI overhaul (mobile-first)

App shell-এর reorganize:

```
┌─────────────────────────────────┐
│ ☰  TIVO         🔔  ⚙️          │ ← header (sticky)
├─────────────────────────────────┤
│ Tab bar: Chats │ Projects │     │ ← bottom nav (mobile)
│           Users │ System         │
├─────────────────────────────────┤
│           (content)              │
└─────────────────────────────────┘
```

- **☰ Drawer (left):** Chats list, Logs, Published projects
- **⚙️ Settings (right):** Hybrid mode + all API keys + redirect URLs (one screen, replaces current `/super-admin/hybrid`)
- **🔔 Bell:** real-time alerts
- **4 main tabs:**
  1. **Chats** — AI conversations, new chat, history
  2. **Projects** — create / list / publish / build APK-EXE / GitHub sync
  3. **Users** — list, block, message thread (customer ↔ super-admin DM), manual payment review (bKash/Nagad/Rocket transaction IDs)
  4. **System** — credentials, snapshots, proposed changes, audit logs, security events, kill-switch, backups

Design: dark theme (`zinc-950` + `amber-700` accent), 384px-first, shadcn `Sidebar` component, `Sheet` for settings drawer। PWA installable।

---

## Phase 4 — Unified Hybrid Settings screen

Existing `HybridSettings.tsx`-এ যোগ:
- Each provider key এর পাশে **"Test connection"** button (calls `backend-api/credentials/test`)
- **Magic Link redirect URL** field (default: `app.lovable.tivo://auth`) — save to `localStorage` + display copy-button
- **Cloud-vs-device toggle for each key** (use device key OR pull from Cloud secret) — চাইলে দুটোই
- Mode preview banner ("Currently: hybrid — login via cloud, AI via device Gemini")

---

## Phase 5 — Capacitor build & run guide (REPLIT_AGENT_SPEC update)

A single copy-pasteable section in `REPLIT_AGENT_SPEC.md`:

```bash
# 1. install
npm install
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios \
      @capacitor/preferences @capacitor/app @capacitor-community/sqlite

# 2. web dev (one terminal)
npm run dev          # → http://localhost:8080

# 3. android dev (second terminal, after step 2 running)
npx cap add android  # first time only
npx cap sync android
npx cap run android  # opens emulator/device with hot-reload to localhost:8080

# 4. production APK
# edit capacitor.config.ts → comment `server.url` block
npm run build
npx cap sync android
npx cap open android # → Android Studio → Build → APK
```

Plus: deep-link handler snippet for `src/main.tsx`, Supabase redirect URL whitelist instructions, `.env` template।

---

## What's NOT in this plan (next iterations)

- বিকাশ/নগদ/রকেট auto-verification → এখন manual (user requested)
- Marketing automation, customer site auto-host, full e-commerce → আলাদা phase লাগবে, এই plan-এর scope-এর বাইরে
- iOS build (Mac লাগে — user নেই বললে skip)

---

## Technical details

- **Files to create:** `supabase/functions/_shared/super-admin.ts` (gate helper), `src/components/layout/AppShell.tsx`, `src/components/layout/MobileTabBar.tsx`, `src/hooks/useRealtimeAlerts.ts`, `src/pages/admin/Chats.tsx` / `Projects.tsx` / `Users.tsx` / `System.tsx`, `src/pages/admin/UserConversation.tsx`
- **Files to edit:** all 4 edge functions (`backend-api`, `ai-engine`, `project-manager`, `sandbox`), `App.tsx` (new nested routes under `/super-admin`), `HybridSettings.tsx`, `REPLIT_AGENT_SPEC.md`
- **Migration:** trigger on `projects` for tenant_id immutability + remove sensitive tables from `supabase_realtime` publication + ensure `super_admin_realtime_*` policies on remaining ones
- **Re-scan:** `security--run_security_scan` চালিয়ে রিপোর্ট দেবো phase 1 শেষে

---

## Approve করলে কীভাবে এগোবো?

আমি একসাথে ৫ phase ship করবো না — প্রতিটির পর তোমাকে দেখাবো, তুমি confirm করলে next phase। শুরু করি Phase 1 দিয়ে?

অথবা চাইলে বলো — কোন phase আগে চাও, বা কোনটা skip / merge করতে চাও।
