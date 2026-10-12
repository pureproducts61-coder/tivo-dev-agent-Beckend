import { describe, it, expect } from "vitest";
import { proposeInteraction, findAffordance } from "@/lib/tivo/world";
import { grantCovers, crossesBoundary, type PlanGrant } from "@/lib/tivo/approval";
import { verifyStep, verifyGoal } from "@/lib/tivo/verification";
import { runWithRecovery, MAX_HEALING_STEPS } from "@/lib/tivo/recovery";
import type { TdefResult } from "@/lib/tivo/tdef";

const ctx = { userId: "u1" };
const proj = { kind: "project" as const, id: "p1", ownerId: "u1" };
const grant: PlanGrant = { planId: "pl1", resourceIds: ["p1"], affordanceIds: ["project.write_file", "project.deploy"], approvedAt: "now" };

const base = { correlationId: "c", idempotencyKey: "k", startedAt: "", finishedAt: "" };
const ev = (items: any[], hasProof = true) => ({ correlationId: "c", items, hasProof } as any);
const ok: TdefResult = { ...base, status: "succeeded", evidence: ev([{ kind: "http_status", value: 200 }]) };
const bad: TdefResult = { ...base, status: "failed", error: "boom", evidence: ev([{ kind: "error", value: "boom" }], false) };

describe("Scoped approval", () => {
  it("one plan approval covers in-project file writes", () => {
    const req = proposeInteraction(proj, "project.write_file", { path: "a.ts", content: "x" }, ctx);
    expect(grantCovers(grant, findAffordance("project.write_file")!, req)).toBe(true);
  });
  it("deploy always asks again even if listed in the plan", () => {
    const req = proposeInteraction(proj, "project.deploy", {}, ctx);
    expect(crossesBoundary(findAffordance("project.deploy")!, req)).toBe("high_risk");
    expect(grantCovers(grant, findAffordance("project.deploy")!, req)).toBe(false);
  });
  it("destructive input always asks again", () => {
    const req = proposeInteraction(proj, "project.write_file", { path: "x", content: "rm -rf /" }, ctx);
    expect(grantCovers(grant, findAffordance("project.write_file")!, req)).toBe(false);
  });
  it("a different project is not covered", () => {
    const req = proposeInteraction({ ...proj, id: "p2" }, "project.write_file", { path: "a", content: "x" }, ctx);
    expect(grantCovers(grant, findAffordance("project.write_file")!, req)).toBe(false);
  });
});

describe("Verification (6 states)", () => {
  it("PASS only with real proof", () => expect(verifyStep(ok).state).toBe("PASS"));
  it("FAILED on error evidence", () => expect(verifyStep(bad).state).toBe("FAILED"));
  it("BLOCKED when waiting for permission", () => expect(verifyStep({ ...base, status: "needs_approval" }).state).toBe("BLOCKED"));
  it("NOT_VERIFIABLE without evidence", () => expect(verifyStep({ ...base, status: "succeeded" }).state).toBe("NOT_VERIFIABLE"));
  it("UNCERTAIN when evidence has no proof", () => expect(verifyStep({ ...base, status: "succeeded", evidence: ev([], false) }).state).toBe("UNCERTAIN"));
  it("PARTIAL when only some steps pass", () => expect(verifyGoal([ok, bad]).state).toBe("PARTIAL"));
});

describe("Recovery (max 5)", () => {
  it("stops at 5 attempts when it keeps failing", async () => {
    const r = await runWithRecovery(async () => bad);
    expect(r.attempts).toBe(MAX_HEALING_STEPS);
    expect(r.verdict.state).toBe("FAILED");
  });
  it("heals on a later attempt", async () => {
    const r = await runWithRecovery(async (n) => (n < 3 ? bad : ok));
    expect(r.attempts).toBe(3);
    expect(r.verdict.state).toBe("PASS");
  });
  it("never retries around a block", async () => {
    const r = await runWithRecovery(async () => ({ ...base, status: "needs_approval" }));
    expect(r.attempts).toBe(1);
  });
});
