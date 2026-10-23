/** The demo must never contradict itself: every seeded issue is asserted to the dollar. */
import { describe, expect, it } from "vitest";
import { loadAll } from "../src/data.js";
import { expiringLeases, flags, reconcile, snapshot, statementTotals } from "../src/domain.js";

const data = loadAll();
const coralWren = data.get("coral-wren-plaza")!;
const tamarind = data.get("tamarind-grove")!;

describe("Coral Wren Plaza seeded issues", () => {
  const rec = reconcile(coralWren);
  it("rent roll is $412,000 and the statement is $398,500, a $13,500 gap", () => {
    expect(rec.scheduled_rent).toBe(412000);
    expect(rec.rental_income).toBe(398500);
    expect(rec.gap).toBe(13500);
    expect(rec.unexplained).toBe(0);
  });
  it("the gap is the unbilled Suite 104 March step ($9,000) plus a misposted CAM reconciliation ($4,500)", () => {
    expect(rec.causes.map((c) => [c.rule, c.unit, c.amount])).toEqual([
      ["unbilled_rent_step", "104", 9000],
      ["misposted_cam_reconciliation", "108", 4500],
    ]);
    expect(rec.causes[0].months[0]).toBe("2026-03");
    expect(rec.causes[0].months).toHaveLength(6);
  });
  it("every cause cites at least one document page", () => {
    for (const c of rec.causes) {
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) expect(s.page).toBeGreaterThan(0);
    }
  });
});

describe("Tamarind Grove seeded issues", () => {
  it("three leases end within 90 days, 9% of rent roll income", () => {
    const e = expiringLeases(tamarind, 3);
    expect(e.count).toBe(3);
    expect(e.share_of_income_pct).toBe(9);
    expect(e.total_annual_rent).toBe(108000);
  });
  it("one unit is occupied on the rent roll with no rent posted for two months", () => {
    const rec = reconcile(tamarind);
    expect(rec.causes).toHaveLength(1);
    expect(rec.causes[0].rule).toBe("occupied_no_rent");
    expect(rec.causes[0].months).toEqual(["2026-07", "2026-08"]);
    expect(rec.gap).toBe(rec.causes[0].amount);
    expect(rec.unexplained).toBe(0);
  });
  it("rent roll is exactly $100,000 a month", () => {
    expect(tamarind.rentRoll.reduce((a, r) => a + r.contractual_rent, 0)).toBe(100000);
  });
});

describe("snapshot ties to the statement", () => {
  for (const d of [coralWren, tamarind]) {
    it(`${d.property.name}: NOI equals revenue minus expenses, and flags match the check`, () => {
      const s = snapshot(d);
      const t = statementTotals(d);
      expect(s.noi_t12).toBe(t.total_revenue - t.operating_expenses);
      expect(s.open_flags).toBe(flags(d).length);
      expect(s.rent_gap_t12).toBe(s.scheduled_rent_t12 - s.rental_income_t12);
    });
  }
});

describe("dataset hygiene", () => {
  it("every property is marked fictional", () => {
    for (const d of data.values()) expect(d.property.fictional).toBe(true);
  });
});
