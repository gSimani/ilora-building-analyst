/**
 * Reads the fictional demo dataset from /data.
 *
 * This is the "thin client" seam: a production deployment would replace these
 * readers with calls to the ILORA.ai API. The shapes are similar to that API's
 * rent roll lines, lease abstracts and general-ledger statement lines.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Property = {
  property_id: string;
  name: string;
  property_type: string;
  city: string;
  state: string;
  units_label: "suites" | "units";
  unit_count: number;
  total_square_feet: number;
  occupancy_basis: "leased square feet" | "occupied units";
  as_of_date: string;
  period_start: string;
  period_end: string;
  rental_account_codes: string[];
  fictional: boolean;
};

export type RentRollLine = {
  unit_number: string;
  tenant_name: string;
  space_use: string;
  square_feet: number;
  lease_start: string;
  lease_end: string;
  contractual_rent: number;
  occupancy_status: "occupied" | "vacant";
  source_document: string;
  source_page: number;
  source_line: number;
};

export type StatementLine = {
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

export type LeaseAbstract = {
  lease_id: string;
  property_id: string;
  tenant_name: string;
  suite_unit: string;
  premises_sf: number;
  commencement_date: string;
  expiration_date: string;
  base_rent_monthly: number;
  rent_schedule: { effective_date: string; base_rent_monthly: number }[];
  source_document: string;
  source_citations: { field: string; page: number; quote: string }[];
  notes?: string;
};

export type PropertyData = {
  property: Property;
  rentRoll: RentRollLine[];
  statement: StatementLine[];
  leases: LeaseAbstract[];
};

const NUMERIC = new Set(["square_feet", "contractual_rent", "source_page", "source_line", "actual_value"]);

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, no embedded newlines. */
export function parseCsv<T>(text: string): T[] {
  const rows = text.trim().split(/\r?\n/).map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  });
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, NUMERIC.has(h) ? Number(r[i]) : r[i]])) as T);
}

export const DATA_DIR = process.env.ILORA_DATA_DIR ?? join(import.meta.dirname, "..", "data");

let cache: Map<string, PropertyData> | undefined;

/** Loads every property once; the dataset is small and read-only. */
export function loadAll(dir = DATA_DIR): Map<string, PropertyData> {
  if (cache && dir === DATA_DIR) return cache;
  const map = new Map<string, PropertyData>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = join(dir, entry.name);
    const property = JSON.parse(readFileSync(join(p, "property.json"), "utf8")) as Property;
    const leases = readdirSync(join(p, "leases")).map((f) => JSON.parse(readFileSync(join(p, "leases", f), "utf8")) as LeaseAbstract);
    map.set(property.property_id, {
      property,
      rentRoll: parseCsv<RentRollLine>(readFileSync(join(p, "rent_roll.csv"), "utf8")),
      statement: parseCsv<StatementLine>(readFileSync(join(p, "t12_operating_statement.csv"), "utf8")),
      leases,
    });
  }
  if (dir === DATA_DIR) cache = map;
  return map;
}
