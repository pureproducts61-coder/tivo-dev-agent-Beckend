import { describe, it, expect, beforeEach } from "vitest";
import { observe, contentHash, recordEvidence, evidenceFor, _resetEvidence } from "@/lib/tivo/evidence";
import { selectProvider, reviewProposal } from "@/lib/tivo/brain";

describe("Step 3 evidence", () => {
  beforeEach(() => _resetEvidence());
  it("no output => no proof", () => {
    const e = observe({ correlationId: "c", affordanceId: "project.build", primitive: "EXECUTE", runtime: "r", error: "boom" });
    expect(e.hasProof).toBe(false);
  });
  it("captures exit code, hash and artifacts", () => {
    const e = observe({ correlationId: "c", affordanceId: "project.build", primitive: "EXECUTE", runtime: "r",
      output: { exitCode: 0, output: "ok", artifacts: [{ name: "app.apk" }] } });
    expect(e.items.find((i) => i.kind === "exit_code")?.value).toBe(0);
    expect(e.items.find((i) => i.kind === "content_hash")?.value).toBe(contentHash("ok"));
    expect(e.items.some((i) => i.kind === "artifact")).toBe(true);
    expect(e.hasProof).toBe(true);
  });
  it("stores evidence per task", () => {
    recordEvidence(observe({ correlationId: "t1", affordanceId: "web.fetch", primitive: "ACCESS", runtime: "r", output: { status: 200 } }));
    expect(evidenceFor("t1")).toHaveLength(1);
  });
});

describe("One Brain: providers propose, Lovable last", () => {
  it("prefers local, then configured; Lovable only as last resort", () => {
    const lov = { id: "lovable", tier: "lovable" as const, available: true };
    expect(selectProvider([lov, { id: "openai", tier: "configured", available: true }])?.id).toBe("openai");
    expect(selectProvider([lov, { id: "ollama", tier: "local", available: true }])?.id).toBe("ollama");
    expect(selectProvider([lov, { id: "ollama", tier: "local", available: false }])?.id).toBe("lovable");
    expect(selectProvider([])).toBeNull();
  });
  it("brain drops unknown primitives and model self-authorization", () => {
    const r = reviewProposal({ providerId: "x", primitives: ["PERCEIVE", "HACK"], claimsSuccess: true, wantsToExecute: true });
    expect(r.intent.primitives).toEqual(["PERCEIVE"]);
    expect(r.rejected.length).toBe(3);
  });
});
