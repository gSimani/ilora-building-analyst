import { describe, expect, it } from "vitest";
import { pickNemotron, toChat } from "../src/assistant/nemotron.js";
import type { Message } from "../src/assistant/types.js";

describe("Nemotron brain wiring", () => {
  it("turns a tool round trip into chat messages with matching ids", () => {
    const messages: Message[] = [
      { role: "user", content: [{ text: "How is Coral Wren Plaza doing?" }] },
      { role: "assistant", content: [{ toolUse: { toolUseId: "call_1", name: "get_property_snapshot", input: { property: "coral-wren-plaza" } } }] },
      { role: "user", content: [{ toolResult: { toolUseId: "call_1", status: "success", content: [{ json: { occupancy_pct: 92.1 } }] } }] },
    ];
    const chat = toChat(messages);
    expect(chat[0].role).toBe("system");
    expect(chat[1]).toEqual({ role: "user", content: "How is Coral Wren Plaza doing?" });
    expect(chat[2]).toMatchObject({ role: "assistant", tool_calls: [{ id: "call_1", function: { name: "get_property_snapshot", arguments: '{"property":"coral-wren-plaza"}' } }] });
    expect(chat[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"occupancy_pct":92.1}' });
  });

  it("marks tool errors so the model does not read them as data", () => {
    const chat = toChat([{ role: "user", content: [{ toolResult: { toolUseId: "c", status: "error", content: [{ json: { error: { code: "unknown_property" } } }] } }] }]);
    expect(chat[1]).toMatchObject({ role: "tool", content: expect.stringMatching(/^ERROR /) });
  });

  it("prefers the requested Nemotron size and ignores other models", () => {
    const ids = ["meta-llama/Llama-3.3-70B", "nvidia/Nemotron-3-Nano-30B", "nvidia/Nemotron-3-Super-120B"];
    expect(pickNemotron(ids, ["super"])).toBe("nvidia/Nemotron-3-Super-120B");
    expect(pickNemotron(ids, ["nano"])).toBe("nvidia/Nemotron-3-Nano-30B");
    expect(pickNemotron(["meta-llama/Llama-3.3-70B"], ["super"])).toBeUndefined();
  });
});

import { OfflinePlanner } from "../src/assistant/planner.js";
import { listProperties } from "../src/domain.js";
import { payload, startServer } from "./helpers.js";

describe("portfolio review", () => {
  it("runs every check on every property, then ranks the findings by dollars", async () => {
    const brain = new OfflinePlanner(listProperties());
    const srv = await startServer();
    const tools = (await srv.client.listTools()).tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> }));
    try {
    const messages: Message[] = [{ role: "user", content: [{ text: "Review my whole portfolio." }] }];
    const used: string[] = [];
    for (let step = 0; step < 16; step++) {
      const r = await brain.next({ messages, tools, mode: "review" });
      messages.push(r.message);
      if (r.stop === "end_turn") {
        expect(used).toHaveLength(7);
        const lines = r.text.split("\n");
        expect(lines[0]).toBe("Money to collect: $18,690 across 3 items, largest first.");
        expect(lines[1]).toMatch(/^1\. Coral Wren Plaza: \$9,000 from Suite 104/);
        expect(lines[2]).toMatch(/^2\. Tamarind Grove Apartments: \$5,190 from Unit B-12/);
        expect(lines[3]).toMatch(/^3\. Coral Wren Plaza: \$4,500 from a CAM reconciliation/);
        expect(lines[4]).toBe("Leases to renew:");
        expect(lines[5]).toMatch(/3 leases end within three months, \$108,000 a year/);
        return;
      }
      used.push(r.toolUse.name);
      const result = (await srv.client.callTool({ name: r.toolUse.name, arguments: r.toolUse.input })) as { isError?: boolean; structuredContent?: unknown; content?: unknown };
      messages.push({ role: "user", content: [{ toolResult: { toolUseId: r.toolUse.toolUseId, status: result.isError ? "error" : "success", content: [{ json: payload(result) }] } }] });
    }
    throw new Error("review did not finish in 16 steps");
    } finally {
      await srv.close();
    }
  });
});
