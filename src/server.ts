/**
 * ILORA.ai MCP server for the Building Analyst.
 *
 * Five intent-shaped tools. Each returns complete structured data (outputSchema +
 * structuredContent) and never scripts prose: the model writes the reply.
 * Failures return isError with a structured error that names alternatives.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  allFlagIds,
  expiringLeases,
  findFlag,
  listProperties,
  reconcile,
  resolveProperty,
  snapshot,
} from "./domain.js";
import { registerUiResources, UI } from "./ui.js";

export const SERVER_INFO = { name: "ilora-building-analyst", title: "ILORA.ai property checks", version: "0.1.0" };

const DATA_NOTE = "Demo data: fictional properties and tenants.";

// ------------------------------------------------------------------ shared schemas

const source = z.object({
  document: z.string().describe("Source document title"),
  page: z.number().int().describe("Page number in the source document"),
  line: z.number().int().optional().describe("Line number on that page"),
  label: z.string().describe("What this line says, in plain words"),
  amount: z.number().optional().describe("Dollar amount on the line"),
  period: z.string().optional().describe("Month the line belongs to, YYYY-MM"),
});

const propertyArg = z
  .string()
  .min(1)
  .describe("Property id from list_properties, or the property's name as the customer said it, e.g. 'Coral Wren Plaza'.");

function ok<T extends Record<string, unknown>>(data: T): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

/**
 * Errors carry their JSON in the text content only. The SDK client validates
 * structuredContent against the tool's outputSchema even when isError is set,
 * so putting an error object there makes a strict client throw instead of
 * reading the error.
 */
function fail(code: string, message: string, extra: Record<string, unknown> = {}): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message, ...extra } }) }] };
}

function unknownProperty(query: string, candidates: { property_id: string; name: string }[]): CallToolResult {
  return fail("unknown_property", `No property matches "${query}". Ask which of these the customer means.`, { did_you_mean: candidates });
}

// ------------------------------------------------------------------ server

export function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {}, resources: {} },
    instructions:
      "Answers questions about a commercial property's rent roll, operating statement and lease expirations, and explains any figure that does not reconcile, with the source page and line. All money is US dollars. The data is a fictional demo portfolio.",
  });

  registerUiResources(server);

  // 1. list_properties
  server.registerTool(
    "list_properties",
    {
      title: "List properties",
      description:
        "Call when the customer asks which properties they have, or when you need a property id and the customer has not named one clearly. Returns id, name, type and city for every property in the account. Does not return any financial figures.",
      inputSchema: {},
      outputSchema: {
        properties: z.array(
          z.object({ property_id: z.string(), name: z.string(), property_type: z.string(), city: z.string(), state: z.string() }),
        ),
        note: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ok({ properties: listProperties(), note: DATA_NOTE }),
  );

  // 2. get_property_snapshot
  server.registerTool(
    "get_property_snapshot",
    {
      title: "Property snapshot",
      description:
        "Call when the customer asks how a property is doing, or asks for its occupancy, net operating income (NOI), rent or number of issues. Returns occupancy, rent scheduled on the rent roll and rental income on the operating statement for the trailing 12 months, NOI, and how many verification flags are open with the most important one. Does not list the flags in detail (use check_rent_roll_vs_statement or explain_flag) or list leases (use list_expiring_leases).",
      inputSchema: { property: propertyArg },
      outputSchema: {
        property_id: z.string(),
        name: z.string(),
        property_type: z.string(),
        city: z.string(),
        state: z.string(),
        as_of_date: z.string().describe("Date of the latest rent roll, YYYY-MM-DD"),
        period: z.object({ start: z.string(), end: z.string(), label: z.string() }),
        occupancy_pct: z.number(),
        occupancy_basis: z.string(),
        scheduled_rent_t12: z.number().describe("Rent the leases call for over the period, from the rent roll"),
        rental_income_t12: z.number().describe("Rental income posted on the operating statement over the period"),
        rent_gap_t12: z.number().describe("scheduled_rent_t12 minus rental_income_t12"),
        total_revenue_t12: z.number(),
        operating_expenses_t12: z.number(),
        noi_t12: z.number().describe("Net operating income: total revenue minus operating expenses"),
        open_flags: z.number().int(),
        top_flag: z.object({ flag_id: z.string(), label: z.string() }).nullable(),
        note: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ property }) => {
      const r = resolveProperty(property);
      if (!r.ok) return unknownProperty(r.query, r.candidates);
      return ok({ ...snapshot(r.data), note: DATA_NOTE });
    },
  );

  // 3. check_rent_roll_vs_statement
  server.registerTool(
    "check_rent_roll_vs_statement",
    {
      title: "Check rent roll against income statement",
      description:
        "Call when the customer asks whether their rent roll matches their income or operating statement, why rental income is short, or whether the numbers check out. Compares rent scheduled on the rent roll and leases with rental income posted on the operating statement for the trailing 12 months, and returns both totals, the gap, and every cause ranked by dollar amount, each with a plain reason, a suggested fix, and the source document, page and line. Does not change any records.",
      inputSchema: { property: propertyArg },
      outputSchema: {
        property_id: z.string(),
        name: z.string(),
        period: z.object({ start: z.string(), end: z.string() }),
        matches: z.boolean().describe("True when the two totals agree to the dollar"),
        rent_roll_total: z.number(),
        statement_total: z.number(),
        gap: z.number().describe("rent_roll_total minus statement_total; positive means the statement is short"),
        unexplained: z.number().describe("Part of the gap no cause accounts for; 0 when fully explained"),
        causes: z.array(
          z.object({
            position: z.number().int(),
            flag_id: z.string().describe("Pass to explain_flag for the detail"),
            rule: z
              .enum(["unbilled_rent_step", "misposted_cam_reconciliation", "occupied_no_rent", "under_billed_rent", "over_billed_rent", "unmatched_posting"])
              .describe("Which check found it"),
            label: z.string(),
            unit: z.string(),
            tenant: z.string(),
            amount: z.number().describe("How much of the gap this cause explains"),
            share_of_gap_pct: z.number(),
            months: z.array(z.string()),
            reason: z.string(),
            suggested_fix: z.string(),
            sources: z.array(source),
          }),
        ),
        note: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.rentCheck }, "ui/resourceUri": UI.rentCheck },
    },
    async ({ property }) => {
      const r = resolveProperty(property);
      if (!r.ok) return unknownProperty(r.query, r.candidates);
      const rec = reconcile(r.data);
      const p = r.data.property;
      return ok({
        property_id: p.property_id,
        name: p.name,
        period: { start: p.period_start, end: p.period_end },
        matches: rec.gap === 0,
        rent_roll_total: rec.scheduled_rent,
        statement_total: rec.rental_income,
        gap: rec.gap,
        unexplained: rec.unexplained,
        causes: rec.causes.map((c, i) => ({
          position: i + 1,
          flag_id: c.flag_id,
          rule: c.rule,
          label: c.label,
          unit: c.unit,
          tenant: c.tenant,
          amount: c.amount,
          share_of_gap_pct: rec.gap ? Math.round((c.amount / rec.gap) * 1000) / 10 : 0,
          months: c.months,
          reason: c.reason,
          suggested_fix: c.suggested_fix,
          sources: c.sources,
        })),
        note: DATA_NOTE,
      });
    },
  );

  // 4. list_expiring_leases
  server.registerTool(
    "list_expiring_leases",
    {
      title: "Leases expiring soon",
      description:
        "Call when the customer asks which leases expire or end soon, or what rent is at risk from move-outs. Returns every occupied lease ending within the next months_ahead months of the latest rent roll date, soonest first, with tenant, unit, end date, rent and share of rent roll income, plus totals. Each lease has a position (1, 2, 3...) and a stable item_id so the customer can say 'the second one'. Does not include vacant units or renewal terms.",
      inputSchema: {
        property: propertyArg,
        months_ahead: z
          .number()
          .int()
          .min(1)
          .max(60)
          .default(12)
          .describe("How many months ahead to look, from the latest rent roll date. 'Next 90 days' is 3."),
      },
      outputSchema: {
        property_id: z.string(),
        name: z.string(),
        window_start: z.string(),
        window_end: z.string(),
        months_ahead: z.number().int(),
        count: z.number().int(),
        total_annual_rent: z.number(),
        share_of_income_pct: z.number(),
        leases: z.array(
          z.object({
            position: z.number().int(),
            item_id: z.string(),
            label: z.string(),
            tenant: z.string(),
            unit: z.string(),
            expiration_date: z.string(),
            days_until_expiration: z.number().int(),
            monthly_rent: z.number(),
            annual_rent: z.number(),
            share_of_income_pct: z.number(),
            source,
          }),
        ),
        note: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: UI.leaseList }, "ui/resourceUri": UI.leaseList },
    },
    async ({ property, months_ahead }) => {
      const r = resolveProperty(property);
      if (!r.ok) return unknownProperty(r.query, r.candidates);
      const e = expiringLeases(r.data, months_ahead ?? 12);
      return ok({ property_id: r.data.property.property_id, name: r.data.property.name, ...e, note: DATA_NOTE });
    },
  );

  // 5. explain_flag
  server.registerTool(
    "explain_flag",
    {
      title: "Explain a verification flag",
      description:
        "Call when the customer asks why something is flagged, asks to see the lines behind a mismatch, or picks one cause from a previous answer ('tell me about the first one'). Takes a flag_id returned by get_property_snapshot or check_rent_roll_vs_statement. Returns the rule that fired, the figures, every source citation (document, page, line) and a suggested fix. Does not resolve or dismiss the flag.",
      inputSchema: { flag_id: z.string().min(1).describe("A flag_id from an earlier result") },
      outputSchema: {
        flag_id: z.string(),
        property_id: z.string(),
        property_name: z.string(),
        rule: z.string(),
        label: z.string(),
        severity: z.enum(["high", "medium", "info"]),
        amount: z.number(),
        reason: z.string(),
        suggested_fix: z.string(),
        figures: z.array(z.object({ label: z.string(), value: z.number(), unit: z.enum(["USD", "percent", "count"]) })),
        sources: z.array(source),
        note: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ flag_id }) => {
      const hit = findFlag(flag_id);
      if (!hit) {
        return fail("unknown_flag", `No open flag has id "${flag_id}". Use one of the open flags below, or run check_rent_roll_vs_statement first.`, {
          open_flags: allFlagIds(),
        });
      }
      return ok({
        ...hit.flag,
        property_id: hit.property.property_id,
        property_name: hit.property.name,
        note: DATA_NOTE,
      });
    },
  );

  return server;
}
