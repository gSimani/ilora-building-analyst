/**
 * Generates the FICTIONAL demo dataset in /data.
 *
 * Every property, tenant, address detail and dollar amount here is made up.
 * The two seeded issues per property are built in on purpose so the demo has
 * something real to find, and tests/data.test.ts asserts each one to the dollar.
 *
 * Run: npm run data
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "data");
const LINES_PER_PAGE = 40;

/** T12 window shared by both properties: Sep 2025 through Aug 2026. */
const MONTHS = [
  "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
  "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
];
const AS_OF = "2026-08-31";

type Step = { effective: string; monthly: number };
type Unit = {
  unit: string;
  tenant: string | null;
  use: string;
  sf: number;
  start?: string;
  end?: string;
  /** Rent schedule, oldest first. One entry means flat rent. */
  schedule: Step[];
  status: "occupied" | "vacant";
  beds?: number;
};

type StatementLine = {
  period_date: string;
  account_code: string;
  account_name: string;
  account_category: "revenue" | "expense";
  unit_number: string;
  memo: string;
  actual_value: number;
  source_document: string;
  source_page: number;
  source_line: number;
};

function rentFor(u: Unit, month: string): number {
  if (u.status !== "occupied" || !u.start) return 0;
  const first = `${month}-01`;
  if (first < u.start.slice(0, 7) + "-01") return 0;
  if (u.end && first > u.end) return 0;
  let rent = 0;
  for (const s of u.schedule) if (s.effective.slice(0, 7) <= month) rent = s.monthly;
  return rent;
}

function csv(rows: Record<string, unknown>[]): string {
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

function paginate(lines: Omit<StatementLine, "source_page" | "source_line">[]): StatementLine[] {
  return lines.map((l, i) => ({
    ...l,
    source_page: Math.floor(i / LINES_PER_PAGE) + 1,
    source_line: (i % LINES_PER_PAGE) + 1,
  }));
}

// ---------------------------------------------------------------- Coral Wren Plaza
const coralWrenUnits: Unit[] = [
  { unit: "101", tenant: "Coastline Grind Coffee", use: "Cafe", sf: 1400, start: "2022-03-01", end: "2029-02-28", schedule: [{ effective: "2022-03-01", monthly: 2900 }], status: "occupied" },
  { unit: "102", tenant: "Palmetto Dry Cleaning", use: "Service", sf: 1200, start: "2021-07-01", end: "2027-06-30", schedule: [{ effective: "2021-07-01", monthly: 2450 }], status: "occupied" },
  { unit: "103", tenant: "Tidewater Nail Studio", use: "Personal care", sf: 1200, start: "2023-01-01", end: "2028-12-31", schedule: [{ effective: "2023-01-01", monthly: 2350 }], status: "occupied" },
  { unit: "104", tenant: "Harbor Light Pilates", use: "Fitness", sf: 1800, start: "2025-03-01", end: "2032-02-29", schedule: [{ effective: "2025-03-01", monthly: 2750 }, { effective: "2026-03-01", monthly: 4250 }], status: "occupied" },
  { unit: "105", tenant: "Sandbar Pizza Co.", use: "Restaurant", sf: 2000, start: "2020-10-01", end: "2030-09-30", schedule: [{ effective: "2020-10-01", monthly: 3900 }], status: "occupied" },
  { unit: "106", tenant: "Mangrove Pet Supply", use: "Retail", sf: 1800, start: "2024-05-01", end: "2029-04-30", schedule: [{ effective: "2024-05-01", monthly: 3500 }], status: "occupied" },
  { unit: "107", tenant: "Pelican Tax & Bookkeeping", use: "Office", sf: 1000, start: "2022-02-01", end: "2027-01-31", schedule: [{ effective: "2022-02-01", monthly: 2150 }], status: "occupied" },
  { unit: "108", tenant: "Saltwater Sushi Bar", use: "Restaurant", sf: 1800, start: "2021-04-01", end: "2031-03-31", schedule: [{ effective: "2021-04-01", monthly: 3600 }], status: "occupied" },
  { unit: "109", tenant: "Reefside Family Dental", use: "Medical", sf: 2400, start: "2023-09-01", end: "2033-08-31", schedule: [{ effective: "2023-09-01", monthly: 4300 }], status: "occupied" },
  { unit: "110", tenant: null, use: "Retail", sf: 1500, schedule: [], status: "vacant" },
  { unit: "111", tenant: "Island Cuts Barbershop", use: "Personal care", sf: 1300, start: "2025-11-01", end: "2030-10-31", schedule: [{ effective: "2025-11-01", monthly: 2500 }], status: "occupied" },
  { unit: "112", tenant: "Gulfstream Wireless", use: "Retail", sf: 1600, start: "2022-08-01", end: "2028-07-31", schedule: [{ effective: "2022-08-01", monthly: 3600 }], status: "occupied" },
];

function coralWrenStatement(): StatementLine[] {
  const doc = "Coral Wren Plaza T12 GL Detail, Sep 2025 to Aug 2026";
  const lines: Omit<StatementLine, "source_page" | "source_line">[] = [];
  for (const m of MONTHS) {
    let baseRentPosted = 0;
    for (const u of coralWrenUnits) {
      let amt = rentFor(u, m);
      // SEEDED ISSUE 1: the March 2026 rent step for Suite 104 was never billed.
      if (u.unit === "104" && m >= "2026-03") amt = 2750;
      if (!amt) continue;
      baseRentPosted += amt;
      lines.push({ period_date: `${m}-01`, account_code: "4000", account_name: "Base Rent", account_category: "revenue", unit_number: u.unit, memo: `${u.tenant} monthly rent`, actual_value: amt, source_document: doc });
    }
    // SEEDED ISSUE 2: a CAM reconciliation credit posted against Base Rent instead of CAM Recoveries.
    if (m === "2026-04") {
      lines.push({ period_date: `${m}-01`, account_code: "4000", account_name: "Base Rent", account_category: "revenue", unit_number: "108", memo: "CAM reconciliation credit, 2025 year-end", actual_value: -4500, source_document: doc });
      baseRentPosted -= 4500;
    }
    lines.push({ period_date: `${m}-01`, account_code: "4100", account_name: "CAM Recoveries", account_category: "revenue", unit_number: "", memo: "CAM estimates, all tenants", actual_value: 6125, source_document: doc });
    const exp: [string, string, number][] = [
      ["5100", "Real Estate Taxes", 4200],
      ["5200", "Insurance", 2350],
      ["5300", "Repairs and Maintenance", 1800],
      ["5400", "Common Area Utilities", 950],
      ["5500", "Landscaping and Janitorial", 1100],
      ["5600", "Management Fee", Math.round(baseRentPosted * 0.04)],
    ];
    for (const [code, name, v] of exp) lines.push({ period_date: `${m}-01`, account_code: code, account_name: name, account_category: "expense", unit_number: "", memo: "", actual_value: v, source_document: doc });
  }
  return paginate(lines);
}

// ---------------------------------------------------------------- Tamarind Grove Apartments
function tamarindUnits(): Unit[] {
  const units: Unit[] = [];
  // Lease end dates spread across the year; only the three townhomes end within 90 days of AS_OF.
  const ends = ["2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30", "2027-07-31", "2027-08-31", "2027-09-30", "2027-10-31", "2027-11-30", "2027-12-31"];
  const plan: { type: string; beds: number; sf: number; rent: number; count: number }[] = [
    { type: "1 bed", beds: 1, sf: 720, rent: 1850, count: 15 },
    { type: "2 bed", beds: 2, sf: 980, rent: 2050, count: 20 },
    { type: "3 bed", beds: 3, sf: 1240, rent: 2595, count: 10 },
  ];
  const surnames = ["Alvarez", "Brooks", "Castillo", "Dunn", "Ellison", "Fontaine", "Garza", "Holt", "Ibarra", "Jansen", "Kowal", "Lindqvist", "Moreau", "Nakamura", "Okafor", "Pereira", "Quinlan", "Rasmussen", "Silva", "Thorne", "Underwood", "Vance", "Whitfield", "Xiong", "Yarrow", "Zeller", "Abernathy", "Bellamy", "Corwin", "Delacroix", "Easton", "Farrow", "Galloway", "Hargrove", "Iverson", "Jaramillo", "Kestrel", "Langley", "Merriweather", "Norcross", "Ostrander", "Pembrook", "Quill", "Redfern", "Stroud"];
  let n = 0;
  let vacantLeft = 2;
  for (const p of plan) {
    for (let i = 0; i < p.count; i++) {
      const bldg = n < 24 ? "A" : "B";
      const unit = `${bldg}-${String((n % 24) + 1).padStart(2, "0")}`;
      n++;
      if (p.beds === 1 && vacantLeft > 0 && i >= p.count - 2) {
        vacantLeft--;
        units.push({ unit, tenant: null, use: p.type, sf: p.sf, schedule: [], status: "vacant", beds: p.beds });
        continue;
      }
      const end = ends[n % ends.length];
      const startYear = Number(end.slice(0, 4)) - 1;
      const start = `${startYear}${end.slice(4, 8)}01`;
      const rent = p.beds === 1 ? 1850 : p.rent;
      units.push({ unit, tenant: `${surnames[(n - 1) % surnames.length]} household`, use: p.type, sf: p.sf, start: start < "2025-09-01" ? start : "2025-06-01", end, schedule: [{ effective: "2020-01-01", monthly: rent }], status: "occupied", beds: p.beds });
    }
  }
  // Three townhomes; their leases end within 90 days of AS_OF.
  const th: [string, string][] = [["2026-09-30", "Rowan household"], ["2026-10-31", "Sterling household"], ["2026-11-15", "Tamsin household"]];
  for (const [end, tenant] of th) {
    const unit = `B-${String((n % 24) + 1).padStart(2, "0")}`;
    n++;
    units.push({ unit, tenant, use: "3 bed townhome", sf: 1650, start: "2025-06-01", end, schedule: [{ effective: "2020-01-01", monthly: 3000 }], status: "occupied", beds: 3 });
  }
  return units;
}
const tamarind = tamarindUnits();
// Fix the 1 bed rent so the occupied rent roll totals exactly $100,000 a month.
const NO_RENT_UNIT = "B-12";

function tamarindStatement(): StatementLine[] {
  const doc = "Tamarind Grove Apartments T12 GL Detail, Sep 2025 to Aug 2026";
  const lines: Omit<StatementLine, "source_page" | "source_line">[] = [];
  for (const m of MONTHS) {
    let rentPosted = 0;
    for (const u of tamarind) {
      const amt = rentFor(u, m);
      if (!amt) continue;
      // SEEDED ISSUE: B-12 shows occupied on the rent roll but no rent posted for July and August 2026.
      if (u.unit === NO_RENT_UNIT && m >= "2026-07") continue;
      rentPosted += amt;
      lines.push({ period_date: `${m}-01`, account_code: "4000", account_name: "Rental Income", account_category: "revenue", unit_number: u.unit, memo: `${u.tenant} rent`, actual_value: amt, source_document: doc });
    }
    lines.push({ period_date: `${m}-01`, account_code: "4200", account_name: "Other Income", account_category: "revenue", unit_number: "", memo: "Laundry and parking", actual_value: 1450, source_document: doc });
    const exp: [string, string, number][] = [
      ["5000", "Payroll", 8500],
      ["5100", "Real Estate Taxes", 13500],
      ["5200", "Insurance", 7800],
      ["5300", "Repairs and Maintenance", 4200],
      ["5400", "Utilities", 5600],
      ["5600", "Management Fee", Math.round(rentPosted * 0.04)],
    ];
    for (const [code, name, v] of exp) lines.push({ period_date: `${m}-01`, account_code: code, account_name: name, account_category: "expense", unit_number: "", memo: "", actual_value: v, source_document: doc });
  }
  return paginate(lines);
}

// ---------------------------------------------------------------- writers
function rentRollRows(units: Unit[], doc: string) {
  return units.map((u, i) => ({
    unit_number: u.unit,
    tenant_name: u.tenant ?? "",
    space_use: u.use,
    square_feet: u.sf,
    lease_start: u.start ?? "",
    lease_end: u.end ?? "",
    contractual_rent: u.status === "occupied" ? rentFor(u, "2026-08") : 0,
    occupancy_status: u.status,
    source_document: doc,
    source_page: Math.floor(i / LINES_PER_PAGE) + 1,
    source_line: (i % LINES_PER_PAGE) + 1,
  }));
}

function leaseAbstract(propertyId: string, u: Unit, extra: Record<string, unknown> = {}) {
  const doc = `Lease, ${propertyId === "coral-wren-plaza" ? "Suite" : "Unit"} ${u.unit}, ${u.tenant}`;
  return {
    lease_id: `${propertyId}:${u.unit}`,
    property_id: propertyId,
    tenant_name: u.tenant,
    suite_unit: u.unit,
    premises_sf: u.sf,
    commencement_date: u.start,
    expiration_date: u.end,
    base_rent_monthly: u.schedule[u.schedule.length - 1].monthly,
    rent_schedule: u.schedule.map((s) => ({ effective_date: s.effective, base_rent_monthly: s.monthly })),
    source_document: doc,
    source_citations: [
      { field: "rent_schedule", page: 3, quote: u.schedule.map((s) => `Beginning ${s.effective}: $${s.monthly.toLocaleString("en-US")} per month`).join("; ") },
      { field: "expiration_date", page: 1, quote: `The Term shall expire on ${u.end}.` },
    ],
    ...extra,
  };
}

function write(propertyId: string, property: Record<string, unknown>, units: Unit[], statement: StatementLine[], leases: object[], rentRollDoc: string) {
  const dir = join(ROOT, propertyId);
  mkdirSync(join(dir, "leases"), { recursive: true });
  writeFileSync(join(dir, "property.json"), JSON.stringify(property, null, 2) + "\n");
  writeFileSync(join(dir, "rent_roll.csv"), csv(rentRollRows(units, rentRollDoc)));
  writeFileSync(join(dir, "t12_operating_statement.csv"), csv(statement));
  for (const l of leases) writeFileSync(join(dir, "leases", `${(l as { suite_unit: string }).suite_unit}.json`), JSON.stringify(l, null, 2) + "\n");
}

const sgUnit = (id: string) => coralWrenUnits.find((u) => u.unit === id)!;
write(
  "coral-wren-plaza",
  { property_id: "coral-wren-plaza", name: "Coral Wren Plaza", property_type: "Neighborhood retail center", city: "Delray Beach", state: "FL", units_label: "suites", unit_count: 12, total_square_feet: coralWrenUnits.reduce((a, u) => a + u.sf, 0), occupancy_basis: "leased square feet", as_of_date: AS_OF, period_start: "2025-09-01", period_end: "2026-08-31", rental_account_codes: ["4000"], fictional: true },
  coralWrenUnits,
  coralWrenStatement(),
  [leaseAbstract("coral-wren-plaza", sgUnit("104"), { notes: "Rent abatement ends February 28, 2026; full base rent of $4,250 per month starts March 1, 2026." }), leaseAbstract("coral-wren-plaza", sgUnit("108")), leaseAbstract("coral-wren-plaza", sgUnit("107")), leaseAbstract("coral-wren-plaza", sgUnit("111"))],
  "Coral Wren Plaza Rent Roll as of Aug 31, 2026",
);

const bnUnit = (id: string) => tamarind.find((u) => u.unit === id)!;
const townhomes = tamarind.filter((u) => u.use === "3 bed townhome");
write(
  "tamarind-grove",
  { property_id: "tamarind-grove", name: "Tamarind Grove Apartments", property_type: "Garden apartments", city: "Boynton Beach", state: "FL", units_label: "units", unit_count: tamarind.length, total_square_feet: tamarind.reduce((a, u) => a + u.sf, 0), occupancy_basis: "occupied units", as_of_date: AS_OF, period_start: "2025-09-01", period_end: "2026-08-31", rental_account_codes: ["4000"], fictional: true },
  tamarind,
  tamarindStatement(),
  [...townhomes.map((u) => leaseAbstract("tamarind-grove", u)), leaseAbstract("tamarind-grove", bnUnit(NO_RENT_UNIT))],
  "Tamarind Grove Apartments Rent Roll as of Aug 31, 2026",
);

writeFileSync(join(ROOT, "README.md"), "# Demo data (fictional)\n\nEvery property, tenant and number in this folder is made up for the demo. Regenerate with `npm run data`.\n");
console.log("demo data written to", ROOT);
