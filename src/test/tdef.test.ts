import { describe, it, expect, beforeEach } from "vitest";
import { proposeInteraction } from "@/lib/tivo/world";
import { executeInteraction, _resetTdefCache } from "@/lib/tivo/tdef";

const ctx = { userId: "u1" };
const web = { kind: "web" as const, id: "w" };
const proj = { kind: "project" as const, id: "p1", ownerId: "u1" };
let calls = 0;
const fetchRt: any = { id: "research-fetch", fetchUrl: async (u: string) => { calls++; return { text: "hi", citation: { url: u } }; } };
const reg = (rt: any) => ({ select: async () => ({ runtime: rt, reason: rt ? "ok" : "none online" }) });

beforeEach(() => { _resetTdefCache(); calls = 0; });

describe("TDEF", () => {
  it("runs an allowed fetch on the real runtime", async () => {
    const r = await executeInteraction(proposeInteraction(web, "web.fetch", { url: "https://example.com" }, ctx), reg(fetchRt));
    expect(r.status).toBe("succeeded");
    expect(calls).toBe(1);
  });
  it("never runs twice for the same request", async () => {
    const req = proposeInteraction(web, "web.fetch", { url: "https://example.com" }, ctx);
    await executeInteraction(req, reg(fetchRt));
    await executeInteraction(req, reg(fetchRt));
    expect(calls).toBe(1);
  });
  it("does not run denied requests", async () => {
    const r = await executeInteraction(proposeInteraction(web, "web.fetch", {}, ctx), reg(fetchRt));
    expect(r.status).toBe("denied");
    expect(calls).toBe(0);
  });
  it("deploy waits for approval", async () => {
    const r = await executeInteraction(proposeInteraction(proj, "project.deploy", {}, ctx), reg({ id: "x", deploy: async () => ({ ok: true }) }));
    expect(r.status).toBe("needs_approval");
  });
  it("reports unavailable instead of faking", async () => {
    const r = await executeInteraction(proposeInteraction(web, "web.fetch", { url: "https://a.com" }, ctx), reg(null));
    expect(r.status).toBe("unavailable");
  });
});
