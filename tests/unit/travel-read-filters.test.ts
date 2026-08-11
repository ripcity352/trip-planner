/**
 * I7 — Confirmed-only / tenancy filters on travel reads (miscount gate).
 *
 * THE INVARIANT: every read of the travel / ride tables in lib/db that can
 * feed a "landed / everyone's in / who's confirmed" glance must filter:
 *   - `.eq("trip_id", …)` — tenancy (rule #6); ALWAYS required, and
 *   - `.is("written_by_trip_member_id", null)` — confirmed-only; required
 *     unless the read is a full manifest that deliberately DISPLAYS unconfirmed
 *     co-traveler tags (marking them distinct in the UI).
 *
 * THE TELL: a new consumer of travel_legs / ride_group_members (or their
 * manifest views) missing a filter — the canonical correct read is
 * getArrivalTimesByTrip (trip_id + inbound + confirmed-only). Prior incidents:
 * #477 (a logged return flight double-counted toward arrivals — missing the
 * direction scope), #574 (an unconfirmed tag counted as landed — missing
 * confirmed-only), #558.
 *
 * THE CHECKER (this file): a listing meta-test. It AST-extracts every travel
 * read in lib/db with its filter chain, asserts trip_id on all and
 * confirmed-only on all but a documented SHOWS_UNCONFIRMED allowlist. A new
 * read is forced to either carry both filters or declare its display intent
 * here. Direction is recorded but not asserted (per-read: #526's /me cue and
 * the full manifests legitimately span both directions).
 *
 * SCOPE: lib/db only (rule #2 — the canonical read surface). Action-layer
 * `.from("travel_legs")` calls are writes / by-id pre-write validation, a
 * different contract.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { extractTravelReads } from "./meta/travel-read-filters";

const DB_DIR = join(process.cwd(), "lib/db");

/**
 * Structural exemption (durable, line-independent): the `*_manifest` views are
 * the DISPLAY surface — they render every leg/rider and mark unconfirmed tags
 * distinctly in the UI, so they legitimately omit the confirmed-only filter.
 * The base tables (`travel_legs`, `ride_group_members`) are the glance/count
 * surface and MUST be confirmed-only. Counting for a manifest happens through a
 * separate base-table read (e.g. getArrivalTimesByTrip) which IS confirmed-only.
 */
const MANIFEST_VIEWS = new Set(["travel_legs_manifest", "ride_group_manifest"]);

const reads = extractTravelReads(DB_DIR);

describe("I7 — travel-read filters", () => {
  it("finds the travel reads (extractor sanity)", () => {
    expect(reads.length).toBeGreaterThanOrEqual(4);
    // Every read resolves to a known travel table.
    expect(reads.every((r) => r.table.length > 0)).toBe(true);
  });

  it("every travel read is tenancy-scoped by trip_id (rule #6)", () => {
    const leaks = reads
      .filter((r) => !r.hasTripId)
      .map((r) => `${r.file}:${r.line} .from(${r.table}) missing .eq("trip_id") [filters: ${r.filters.join(",")}]`);
    expect(leaks, "travel reads without a trip_id tenancy filter").toEqual([]);
  });

  it("every base-table travel read filters confirmed-only (manifests exempt)", () => {
    const violations = reads
      .filter((r) => !MANIFEST_VIEWS.has(r.table) && !r.hasConfirmedOnly)
      .map(
        (r) =>
          `${r.file}:${r.line} .from(${r.table}) missing .is("written_by_trip_member_id", null) [filters: ${r.filters.join(",")}]`,
      );
    expect(
      violations,
      "base-table travel glance reads that would count unconfirmed tags",
    ).toEqual([]);
  });

  it("both manifest views are actually read (exemption is not vacuous)", () => {
    // If a manifest view stops being read, the exemption is dead — the base
    // tables would then be the only surface and must all be confirmed-only.
    const tablesRead = new Set(reads.map((r) => r.table));
    for (const view of MANIFEST_VIEWS) {
      expect(tablesRead.has(view), `${view} should still be read in lib/db`).toBe(
        true,
      );
    }
  });
});
