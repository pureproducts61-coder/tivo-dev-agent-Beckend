import { describe, it, expect } from "vitest";
import { dissectGoal } from "@/lib/tivo/cognition";
import { synthesizeAlternatives, negotiateGap } from "@/lib/tivo/synthesis";
import { AFFORDANCES } from "@/lib/tivo/world";

const ids = new Set(AFFORDANCES.map((a) => a.id));

describe("Step 5 synthesis", () => {
  it("no gaps → ready, no negotiation", () => {
    const w = { resources: [], availableCapabilities: ["chat", "reasoning"] as any, userId: "u" };
    const r = synthesizeAlternatives(dissectGoal("hello", w), w);
    expect(r.ready).toBe(true);
    expect(r.negotiations).toHaveLength(0);
  });

  it("signed-out → sign_in option", () => {
    const w = { resources: [], availableCapabilities: ["chat"] as any, userId: null };
    const r = synthesizeAlternatives(dissectGoal("hello", w), w);
    expect(r.negotiations.some((n) => n.options.some((o) => o.kind === "sign_in"))).toBe(true);
  });

  it("never invents tools: substitutes reference only catalog affordances", () => {
    const w = { resources: [{ kind: "web" as const, id: "w" }], availableCapabilities: ["research", "chat"] as any, userId: "u" };
    const n = negotiateGap({ kind: "capability", need: "deploy", remedy: "Connect hosting" }, w);
    expect(n.options[0].kind).toBe("connect");
    for (const o of n.options) {
      expect(o.requiresUser).toBe(true);
      if (o.affordanceId) expect(ids.has(o.affordanceId)).toBe(true);
    }
  });
});
