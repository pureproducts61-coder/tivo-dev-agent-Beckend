# TIVO Master Roadmap (canonical — all work follows this)

Principles (never violated): One Brain decides; models only propose. 10 primitives
(PERCEIVE, UNDERSTAND, ACCESS, TRANSFORM, EXECUTE, GENERATE, COMPOSE, OBSERVE, VERIFY,
RECOVER) are the Brain's tools, never separate brains. Provider order: local → configured
→ Lovable last. Credential != Runtime != Capability; secrets backend-only. EXECUTE never
self-authorizes. No success without VERIFY on real evidence. No fake progress, no static
robotic cards. One plan approval covers in-project work; ask again only at boundaries
(deploy/hosting, credentials, user's machine, destructive). Everything dynamic, nothing fixed.

## Reuse as-is
DB tables (projects, conversations, messages, proposed_changes, job_queue, system_credentials,
system_memory, execution_events, notifications, profiles, user_roles, ai_constitution);
edge functions backend-api, project-manager, sandbox, ai-engine (adapt, not rewrite);
hf-docker build engine + GH Actions; AppShell/Chat UI/design tokens;
src/lib/tivo: world, cognition, evidence, brain, capabilities, events, device, runtimes,
runtimeConnections, approval, verification, recovery, tdef.

## Steps
- [x] 1 World model + affordances + Control (world.ts)
- [x] 2 TDEF real interaction execution (tdef.ts)
- [x] 3 Evidence layer + One Brain provider selection (evidence.ts, brain.ts)
- [x] 4 Verification (6 states) + scoped approval + 5-step recovery (tests: step4.test.ts)
- [x] 5 Dynamic synthesis (synthesis.ts, step5.test.ts) & gap negotiation — Brain reports gaps, proposes alternatives, asks user; never invents tools
- [ ] 6 Dynamic Resource & Credential Vault UI — add/remove local/external/Lovable models, runtimes, hosting; secret-free status (connected, health, capabilities, approval needed). Merge HybridSettings + System into SettingsSheet. Fix credential-name mismatch.
- [ ] 7 Real execution & observability — ai-engine uses brain.selectProvider (remove hardcoded gateway, fix stream fallback); job_queue worker/Docker runtime; real logs/exit codes; DEGRADED/UNAVAILABLE honesty; unify proposals denied/rejected
- [ ] 8 Dynamic conversational UI — plan preview, one-click approve/customize, live status, evidence badges, verdict + recovery explanation; unify constitution into ai_constitution (10 primitives + rules)
- [ ] 9 Native export — APK/EXE/ZIP with hash/size verification and download
- [ ] 10 Full E2E proof, cleanup of legacy pages only after parity, system lock

## Lovable resources placement (dynamic, activated when a step needs them)
AI Gateway → Brain model runtime (last resort). Cloud DB → state plane. Cloud functions →
World/Control/TDEF adapters. Secrets → credential vault. Storage → artifact resource +
evidence refs. Web search → research runtime. Auth → Control plane identity.
