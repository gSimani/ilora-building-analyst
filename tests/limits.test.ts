/** The paid routes stop at their caps and say why; /mcp is never capped. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SPEAK_LIMIT_PER_IP = "3";
process.env.BRAIN_LIMIT_PER_IP = "2";
const { startServer } = await import("./helpers.js");

let s: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  s = await startServer();
});
afterAll(async () => s.close());

const post = (path: string, body: unknown) =>
  fetch(`${s.base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("request caps", () => {
  it("/api/speak answers until the per-IP cap, then 429 with a reason", async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post("/api/speak", { text: "hello" })).status);
    expect(codes.slice(0, 3)).toEqual([204, 204, 204]); // Polly is off in tests, so 204
    expect(codes[3]).toBe(429);
    const r = await post("/api/speak", { text: "hello" });
    expect((await r.json()).error).toMatch(/Demo limit/);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });

  it("/api/brain has its own cap", async () => {
    const body = { messages: [{ role: "user", content: [{ text: "What properties do I have?" }] }], tools: [] };
    expect((await post("/api/brain", body)).status).toBe(200);
    expect((await post("/api/brain", body)).status).toBe(200);
    expect((await post("/api/brain", body)).status).toBe(429);
  });

  it("MCP tool calls are not capped", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await s.client.callTool({ name: "list_properties", arguments: {} });
      expect(r.isError).toBeFalsy();
    }
  });
});
