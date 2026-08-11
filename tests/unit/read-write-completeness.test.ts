/**
 * I1 — Read/write column completeness (data-loss regression gate).
 *
 * THE INVARIANT: for every table a `lib/actions/*.ts` server action writes
 * to via `.insert` / `.update` / `.upsert`, every written column must be
 * readable through some `lib/db/*.ts` `.select(...)` projection for that
 * table (or a view of it). A column written but never selected hydrates the
 * edit form as `undefined`; the next save's `?? null` / `|| null` fallback
 * then nulls it — silent, psql-only-visible data loss.
 *
 * THE TELL: a write key absent from the union of read projections for its
 * table, and not a server-derived / audit column (which never round-trips
 * through a form prefill).
 *
 * THE CHECKER (this file): AST-extract both sets from source (never a
 * hand-maintained list — that was the old per-table travel-legs test's
 * weakness, #453) and assert containment across the whole repo. Ships as a
 * permanent CI gate so the next dropped column fails here, not in prod.
 *
 * PRIOR INCIDENTS: audit-report P0#1 (`TRAVEL_LEG_COLUMNS` dropped
 * `airline_iata`/`flight_number`), `trips.timezone` (#200), and — caught by
 * THIS checker on first run — `ITINERARY_ITEM_COLUMNS` dropped
 * `address_place_id` / `address_provider` (the update path wrote + selected
 * them; the hydration read didn't → editing any field nulled the place link).
 *
 * SCOPE BOUNDARY: only JS-level `.insert/.update/.upsert` object writes are
 * analyzed. `expenses` writes through a Postgres RPC (atomic expense+splits),
 * so its columns live in SQL, not a JS literal — out of this checker's reach
 * (a different surface with its own function-signature contract).
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import {
  readColumnsByTable,
  extractWrites,
  type WriteSite,
} from "./meta/db-write-read-usage";

const DB_DIR = join(process.cwd(), "lib/db");
const ACTIONS_DIR = join(process.cwd(), "lib/actions");

// ---------------------------------------------------------------------------
// Config (externalized + guarded — a new table / pattern forces an update
// here rather than silently escaping the check).
// ---------------------------------------------------------------------------

/**
 * Base table → security-invoker views that ALSO read it. A write to the base
 * table is covered if the column appears in the base OR any of its views'
 * projections (the manifest views are the canonical hydration read for these).
 */
const VIEW_OF: Record<string, readonly string[]> = {
  travel_legs: ["travel_legs_manifest"],
  ride_groups: ["ride_group_manifest"],
  ride_group_members: ["ride_group_manifest"],
};

/**
 * Columns exempt from the containment rule: always written from server-derived
 * context (auth / session / tenant scope) or auto-generated — NEVER sourced
 * from an edit-form prefill, so structurally immune to the prefill-null
 * data-loss class this invariant guards. Missing one from a read projection is
 * a display choice, not a loss vector.
 */
const GLOBAL_EXEMPT = new Set<string>([
  "trip_id",
  "trip_member_id",
  "written_by_trip_member_id",
  "created_by",
  "created_by_trip_member_id",
  "sent_by_trip_member_id",
  "marked_by",
  "author_id",
  "idempotency_key",
  "created_at",
  "updated_at",
  "marked_at",
  "voted_at",
  "sent_at",
]);

/**
 * Write-target tables that legitimately have NO read projection (write-only
 * from JS — no edit-form hydration round-trip). Empty today: every writable
 * table currently has at least one read path. If a future write-only table
 * appears, the coverage guard below fails until it's added here with a reason.
 */
const NO_PROJECTION_ALLOWLIST = new Set<string>([]);

// ---------------------------------------------------------------------------

const reads = readColumnsByTable(DB_DIR);
const writes = extractWrites(ACTIONS_DIR);

function coveredColumns(table: string): Set<string> {
  const cover = new Set<string>();
  const sources = [table, ...(VIEW_OF[table] ?? [])];
  for (const t of sources) {
    reads.get(t)?.forEach((c) => cover.add(c));
  }
  return cover;
}

describe("I1 — read/write column completeness", () => {
  it("extracts a non-empty write set (extractor sanity)", () => {
    expect(writes.length).toBeGreaterThan(0);
    expect(reads.size).toBeGreaterThan(0);
  });

  it("resolves every write payload (no unparseable insert/update/upsert)", () => {
    // An unresolved payload means the extractor under-reports columns and
    // could hide a real violation. If this fires, extend collectKeys in
    // db-write-read-usage.ts — do NOT loosen the assertion.
    const unresolved = writes
      .filter((w) => w.unresolved.length > 0)
      .map((w) => `${w.file}:${w.line} ${JSON.stringify(w.unresolved)}`);
    expect(unresolved, "unresolved write payloads").toEqual([]);
  });

  it("resolves the target table of every write (no dynamic .from)", () => {
    const dynamic = writes
      .filter((w) => w.table === null)
      .map((w) => `${w.file}:${w.line} ${w.method}`);
    expect(dynamic, "writes with an unresolved .from() table").toEqual([]);
  });

  it("every write-target table has a read projection or is allowlisted", () => {
    const orphaned = [
      ...new Set(
        writes
          .map((w) => w.table)
          .filter((t): t is string => t !== null)
          .filter(
            (t) =>
              coveredColumns(t).size === 0 && !NO_PROJECTION_ALLOWLIST.has(t),
          ),
      ),
    ];
    expect(orphaned, "write-target tables with no read projection").toEqual([]);
  });

  it("every written column is covered by a read projection (data-loss gate)", () => {
    const violations: string[] = [];
    for (const w of writes as WriteSite[]) {
      if (w.table === null || NO_PROJECTION_ALLOWLIST.has(w.table)) continue;
      const cover = coveredColumns(w.table);
      if (cover.size === 0) continue; // handled by the orphan guard above
      const missing = w.keys.filter(
        (k) => !cover.has(k) && !GLOBAL_EXEMPT.has(k),
      );
      if (missing.length > 0) {
        violations.push(
          `${w.table} <- ${w.file}:${w.line} ${w.method}: read projection omits ${JSON.stringify(missing)}`,
        );
      }
    }
    expect(violations, "columns written but not readable (hydration drift)").toEqual([]);
  });
});
