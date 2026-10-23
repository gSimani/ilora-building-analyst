/**
 * Golden conversation: the four demo questions, run exactly the way the simulator
 * runs them. A real MCP client calls the real server; the offline planner decides
 * which tool to call. Asserts the spoken answers carry the right numbers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OfflinePlanner } from "../src/assistant/planner.js";
import type { McpTool, Message } from "../src/assistant/types.js";
import { listProperties } from "../src/domain.js";
import { payload, startServer } from "./helpers.js";

let s: Awaited<ReturnType<typeof startServer>>;
let tools: McpTool[];
const brain = new OfflinePlanner(listProperties());
const messages: Message[] = [];
const toolsCalled: string[] = [];

async function ask(text: string): Promise<string> {
  messages.push({ role: "user", content: [{ text }] });
  for (let step = 0; step < 4; step++) {
    const out = await brain.next({ messages, tools });
    messages.push(out.message);
    if (out.stop === "end_turn") return out.text;
    toolsCalled.push(out.toolUse.name);
    const r = await s.client.callTool({ name: out.toolUse.name, arguments: out.toolUse.input });
    messages.push({
      role: "user",
      content: [{ toolResult: { toolUseId: out.toolUse.toolUseId, status: r.isError ? "error" : "success", content: [{ json: payload(r) }] } }],
    });
  }
  throw new Error("no answer after 4 steps");
}

beforeAll(async () => {
  s = await startServer();
  tools = (await s.client.listTools()).tools as McpTool[];
});
afterAll(async () => s.close());

describe("demo conversation", () => {
  it("1. How is Coral Wren Plaza doing?", async () => {
    const a = await ask("How is Coral Wren Plaza doing?");
    expect(toolsCalled.at(-1)).toBe("get_property_snapshot");
    expect(a).toContain("92.1%");
    expect(a).toContain("$331,260");
  });
  it("2. Does my rent roll match my income statement for Coral Wren Plaza? (the wow moment)", async () => {
    const a = await ask("Does my rent roll match my income statement for Coral Wren Plaza?");
    expect(toolsCalled.at(-1)).toBe("check_rent_roll_vs_statement");
    expect(a).toMatch(/^Not quite\./);
    expect(a).toContain("$13,500 short");
    expect(a).toContain("$9,000");
    expect(a).toContain("Suite 104, whose lease shows a rent step in March that wasn't billed");
    expect(a).toContain("CAM reconciliation for Suite 108");
  });
  it("3. Show me the lines (follow-up)", async () => {
    const a = await ask("Yes, show me the lines.");
    expect(toolsCalled.at(-1)).toBe("explain_flag");
    expect(a).toMatch(/March 2026/);
    expect(a).toMatch(/page \d+, line \d+ of the Coral Wren Plaza T12 GL Detail/);
  });
  it("4. Which leases expire in the next 90 days at Tamarind Grove?", async () => {
    const a = await ask("Which leases expire in the next 90 days at Tamarind Grove?");
    expect(toolsCalled.at(-1)).toBe("list_expiring_leases");
    expect(a).toContain("3 leases end");
    expect(a).toContain("9%");
  });
  it("5. Tell me about the second one (follow-up by position)", async () => {
    const before = toolsCalled.length;
    const a = await ask("Tell me about the second one.");
    expect(toolsCalled.length).toBe(before); // answered from the previous result
    expect(a).toContain("B-23");
    expect(a).toContain("October 31, 2026");
  });
});
