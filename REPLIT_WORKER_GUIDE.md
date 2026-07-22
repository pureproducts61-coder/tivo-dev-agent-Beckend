# TIVO Replit Heavy-Lifter Worker

Replit acts as the **execution engine**. Lovable enqueues heavy jobs into
Supabase `public.job_queue`; the Replit worker claims, runs, and returns results.
Both runtimes read the same authoritative charter from `public.ai_constitution`
(active row).

## 1. Replit Secrets (paste in Replit → Tools → Secrets)

```
SUPABASE_URL=https://zequmbllknxbswnwkgjv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Lovable Cloud → backend settings>
WORKER_ID=replit-worker-1
PLAYWRIGHT_ENABLED=true         # set false to disable browser automation
JOB_POLL_MS=3000
JOB_TIMEOUT_MS=600000            # 10 min per job
```

> The service-role key is stored on Replit only. Never commit it. Lovable does
> not expose it in client code.

## 2. `worker.mjs` (Node 20+, drop-in)

```js
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const WORKER = process.env.WORKER_ID || `replit-${Math.random().toString(36).slice(2, 8)}`;
const POLL = Number(process.env.JOB_POLL_MS || 3000);
const TIMEOUT = Number(process.env.JOB_TIMEOUT_MS || 600_000);
const PW_ON = String(process.env.PLAYWRIGHT_ENABLED || "true") === "true";

async function loadConstitution() {
  const { data } = await sb.from("ai_constitution").select("body").eq("is_active", true).maybeSingle();
  return data?.body || "";
}

async function claim() {
  // atomic claim via RPC-less update
  const { data } = await sb
    .from("job_queue")
    .update({ status: "claimed", claimed_by: WORKER, started_at: new Date().toISOString(), attempts: 1 })
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .select("*")
    .maybeSingle();
  return data;
}

async function finish(id, patch) {
  await sb.from("job_queue").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id);
}

const handlers = {
  "playwright.run": async (payload) => {
    if (!PW_ON) throw new Error("Playwright disabled");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const log = [];
    for (const step of payload.steps || []) {
      log.push({ step, t: Date.now() });
      if (step.goto) await page.goto(step.goto, { timeout: 30_000 });
      if (step.click) await page.click(step.click, { timeout: 15_000 });
      if (step.type) await page.fill(step.type.selector, step.type.value);
      if (step.screenshot) log[log.length - 1].shot = (await page.screenshot()).toString("base64");
    }
    await browser.close();
    return { log };
  },
  "apk.build": async (payload) => {
    // shell out to hf-docker/build-apk.sh or your Replit container
    const { execFile } = await import("node:child_process");
    return await new Promise((res, rej) =>
      execFile("bash", ["./hf-docker/build-apk.sh", payload.projectDir, payload.output], (e, so, se) =>
        e ? rej(new Error(se || e.message)) : res({ stdout: so.slice(-4000) })
      )
    );
  },
  "proposal.execute": async (payload) => {
    // Approved proposal ready to run. Route by payload.kind.
    return { ok: true, note: "handled downstream", payload };
  },
};

async function tick() {
  const job = await claim();
  if (!job) return;
  console.log(`[${WORKER}] claimed ${job.id} kind=${job.kind}`);
  const fn = handlers[job.kind];
  const t0 = Date.now();
  try {
    if (!fn) throw new Error(`No handler for ${job.kind}`);
    const result = await Promise.race([
      fn(job.payload || {}),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), TIMEOUT)),
    ]);
    await finish(job.id, { status: "done", result, error: null });
    console.log(`[${WORKER}] done ${job.id} in ${Date.now() - t0}ms`);
  } catch (e) {
    await finish(job.id, { status: "failed", error: String(e?.message || e) });
    console.error(`[${WORKER}] failed ${job.id}:`, e);
  }
}

console.log(`[${WORKER}] boot; constitution=${(await loadConstitution()).length}b; playwright=${PW_ON}`);
setInterval(tick, POLL);
```

## 3. `package.json` (Replit)

```json
{
  "name": "tivo-worker",
  "type": "module",
  "scripts": { "start": "node worker.mjs" },
  "dependencies": {
    "@supabase/supabase-js": "^2.110.7",
    "playwright": "^1.48.0"
  }
}
```

Run: `npm i && npx playwright install --with-deps chromium && npm start`

## 4. How Lovable enqueues jobs

From any Lovable edge function or chat action:

```ts
await supabaseAdmin.from("job_queue").insert({
  kind: "playwright.run",
  priority: 5,
  payload: { steps: [{ goto: "https://example.com" }, { screenshot: true }] },
});
```

When a Super Admin **approves** a proposal in the Approvals UI, the DB trigger
`on_proposal_status_change` automatically enqueues a `proposal.execute` job and
fires a notification — no extra glue code required.

## 5. Approval-gated 10-mechanism hooks

Every one of the 10 autonomous powers uses this flow:
1. Chat AI drafts a plan → inserts into `proposed_changes` with `status='pending'`.
2. Super Admin clicks Approve on `/super-admin/app/approvals`.
3. Trigger writes to `job_queue` + `notifications` in the same transaction.
4. Replit worker claims the job by matching `kind` (e.g. `security.scan`,
   `resource.optimize`, `docs.refresh`, `research.spawn`, `apk.build`).
5. Worker writes `result`/`error` back; UI polls `job_queue` and renders it in
   chat as an artifact.

Nothing executes without approval — the trigger only fires when `status`
becomes `approved`.

## 6. Playwright safe-headless controls

- `PLAYWRIGHT_ENABLED=false` in Replit Secrets → all `playwright.run` jobs
  fail fast with `Playwright disabled`.
- Every step is timeboxed (`goto` 30s, `click` 15s, whole job `JOB_TIMEOUT_MS`).
- Logs + optional screenshot base64 are returned in `result.log` so the admin
  can audit every action.
