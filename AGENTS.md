
- Runtime connections live in backend-only `runtime_connections` referencing `system_credentials` keys; browser gets secret-free descriptors via backend-api `runtimes/*`. Why: Credential != Runtime != Capability, no secrets client-side.
