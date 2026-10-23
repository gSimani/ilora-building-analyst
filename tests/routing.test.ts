/**
 * The offline planner must pick the same tool a careful reader would for
 * reworded questions. Expected tools were cross-checked with an independent
 * classifier during development; one miss it found ("moving out") is pinned here.
 */
import { describe, expect, it } from "vitest";
import { OfflinePlanner } from "../src/assistant/planner.js";
import { listProperties } from "../src/domain.js";

const planner = new OfflinePlanner(listProperties());
const cases: [string, string, Record<string, unknown>?][] = [
  ["Is Coral Wren making money?", "get_property_snapshot"],
  ["Do the books for Coral Wren tie out?", "check_rent_roll_vs_statement"],
  ["Anybody moving out of Tamarind Grove this year?", "list_expiring_leases", { months_ahead: 12 }],
  ["What's occupancy like at Tamarind?", "get_property_snapshot"],
  ["Which buildings do I own?", "list_properties"],
  ["Is my Coral Wren income statement off from the rent roll?", "check_rent_roll_vs_statement"],
  ["When do the Tamarind leases come up for renewal in the next six months?", "list_expiring_leases", { months_ahead: 6 }],
  ["What was NOI at Coral Wren Plaza?", "get_property_snapshot"],
  ["How's my building doing?", "list_properties"],
];

describe("offline planner routing", () => {
  for (const [q, tool, input] of cases) {
    it(q, async () => {
      const r = await planner.next({ messages: [{ role: "user", content: [{ text: q }] }], tools: [] });
      expect(r.stop).toBe("tool_use");
      if (r.stop !== "tool_use") return;
      expect(r.toolUse.name).toBe(tool);
      if (input) expect(r.toolUse.input).toMatchObject(input);
    });
  }
});
