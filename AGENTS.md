
- Runtime connections live in backend-only `runtime_connections` referencing `system_credentials` keys; browser gets secret-free descriptors via backend-api `runtimes/*`. Why: Credential != Runtime != Capability, no secrets client-side.
- One Brain (`src/lib/tivo/brain.ts`) picks the AI provider (local → configured → Lovable last) and reviews model output as untrusted proposals; models never execute, authorize, or declare success. Why: providers are swappable, the Brain is singular.
- Evidence (`src/lib/tivo/evidence.ts`) records only facts a runtime actually returned and attaches them to every TDEF result; success of a goal requires VERIFY on this evidence. Why: no fake progress or completion.
