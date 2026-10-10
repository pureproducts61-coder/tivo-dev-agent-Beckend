import { describe, expect, it } from "vitest";
import { dissectGoal } from "@/lib/tivo/cognition";

const project = { kind: "project" as const, id: "p1" };

describe("dissectGoal", () => {
  it("is composable when resources and capabilities exist", () => {
    const d = dissectGoal("build my apk", {
      userId: "u1", resources: [project], availableCapabilities: ["build", "file_read", "chat"],
    });
    expect(d.taskKind).toBe("build");
    expect(d.composable).toBe(true);
    expect(d.gaps).toEqual([]);
  });

  it("reports a capability gap instead of pretending", () => {
    const d = dissectGoal("build my apk", { userId: "u1", resources: [project], availableCapabilities: ["chat"] });
    expect(d.composable).toBe(false);
    expect(d.gaps.some((g) => g.kind === "capability" && g.need === "build")).toBe(true);
  });

  it("reports a resource gap when no project is selected", () => {
    const d = dissectGoal("build it", { userId: "u1", resources: [], availableCapabilities: ["build", "file_read"] });
    expect(d.gaps.some((g) => g.kind === "resource" && g.need === "project")).toBe(true);
  });

  it("reports an authority gap when signed out", () => {
    const d = dissectGoal("hello", { userId: null, resources: [], availableCapabilities: ["chat"] });
    expect(d.gaps.some((g) => g.kind === "authority")).toBe(true);
  });

  it("prefers the Brain's own primitive chain over the keyword hint", () => {
    const d = dissectGoal("anything", { userId: "u1", resources: [], availableCapabilities: ["research", "chat"] },
      { primitives: ["ACCESS", "UNDERSTAND"], capabilities: ["research"] });
    expect(d.source).toBe("brain");
    expect(d.primitives).toEqual(["ACCESS", "UNDERSTAND"]);
    expect(d.composable).toBe(true);
  });
});
