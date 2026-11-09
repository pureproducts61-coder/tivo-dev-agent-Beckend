import { describe, it, expect } from "vitest";
import { wantsPlan, proposePlan, executePlan } from "@/lib/tivo/agentLoop";

const planJson = JSON.stringify({
  summary: "Todo site", steps: ["write html"],
  files: [{ path: "index.html", purpose: "page" }, { path: "../evil.js", purpose: "x" }],
});

describe("agent loop", () => {
  it("detects project requests", () => {
    expect(wantsPlan("/plan todo app")).toBe(true);
    expect(wantsPlan("একটা ওয়েবসাইট বানাও")).toBe(true);
    expect(wantsPlan("hello")).toBe(false);
  });

  it("drops unsafe paths from a plan", async () => {
    const plan = await proposePlan("/plan todo", async () => planJson);
    expect(plan.files.map((f) => f.path)).toEqual(["index.html"]);
    expect(plan.status).toBe("proposed");
  });

  it("reports failure when files are not really stored", async () => {
    const plan = await proposePlan("/plan todo", async () => planJson);
    const r = await executePlan(plan, {
      call: async () => "<html></html>",
      upload: async (f) => f.map((x) => ({ path: x.path, success: true })),
      listStored: async () => [],
      onProgress: () => {},
      correlationId: "t",
    });
    expect(r.ok).toBe(false);
  });

  it("verifies success only from stored file list", async () => {
    const plan = await proposePlan("/plan todo", async () => planJson);
    const r = await executePlan(plan, {
      call: async () => "<html></html>",
      upload: async (f) => f.map((x) => ({ path: x.path, success: true })),
      listStored: async () => ["index.html"],
      onProgress: () => {},
      correlationId: "t",
    });
    expect(r.ok).toBe(true);
  });
});
