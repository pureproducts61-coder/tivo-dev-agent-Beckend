import { describe, it, expect } from "vitest";
import { proposeInteraction, idempotencyKeyFor } from "@/lib/tivo/world";

const ctx = { userId: "u1" };
const proj = { kind: "project" as const, id: "p1", ownerId: "u1" };

describe("World Foundation control", () => {
  it("denies unauthenticated", () => {
    expect(proposeInteraction(proj, "project.inspect", {}, { userId: null }).control.decision).toBe("DENY");
  });
  it("denies non-owner", () => {
    expect(proposeInteraction(proj, "project.inspect", {}, { userId: "u2" }).control.decision).toBe("DENY");
  });
  it("allows low-risk read", () => {
    expect(proposeInteraction(proj, "project.inspect", {}, ctx).control.decision).toBe("ALLOW");
  });
  it("requires approval for deploy", () => {
    expect(proposeInteraction(proj, "project.deploy", {}, ctx).control.decision).toBe("REQUIRE_APPROVAL");
  });
  it("denies missing required input", () => {
    expect(proposeInteraction(proj, "project.write_file", { path: "a" }, ctx).control.decision).toBe("DENY");
  });
  it("denies unavailable capability", () => {
    const r = proposeInteraction(proj, "project.build", {}, { userId: "u1", availableCapabilities: ["chat"] });
    expect(r.control.decision).toBe("DENY");
  });
  it("idempotency key is stable", () => {
    expect(idempotencyKeyFor(proj, "x", { a: 1 })).toBe(idempotencyKeyFor(proj, "x", { a: 1 }));
  });
});
