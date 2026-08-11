/**
 * I8 — Date-only columns never hit native `new Date(string)` (off-by-one gate).
 *
 * THE INVARIANT (#350/#351, audit P0#2): a Postgres `date` column value
 * (`'YYYY-MM-DD'`) rendered through `new Date('YYYY-MM-DD')` parses as UTC
 * midnight, so anywhere west of UTC it shows one calendar day early. Date-only
 * values must parse local — via `parseDateOnly` / `parseISO` or the
 * `new Date(y, m, d)` component form — never native single-string `new Date`.
 *
 * THE TELL: `new Date(<expr>)` whose single argument reads a `date`-typed
 * column (starts_at / ends_at / starts_on / ends_on / closes_on / occurred_on
 * / date / day). Timestamptz columns (created_at / arrive_at / expires_at) are
 * full ISO instants and parse correctly, so keying on the schema's date-only
 * column names is the precise discriminator.
 *
 * THE CHECKER (this file): an AST scan of app/ + components/ + lib/. Baseline
 * is clean — the codebase already routes every date-only render through the
 * local-parse helpers (every risky site carries a "not new Date(YYYY-MM-DD)"
 * comment). This gate stops the next one from regressing. Prior: #382/#396/#408
 * travel-leg parse, #351 date-only contract, #200 timezone.
 *
 * SCOPE: the render/UTC-parse hazard only. The write-side widget↔column-type
 * check (a `datetime-local` value into a `time`/`date` column) is handled by
 * the format-trip-tz.ts parse helpers (DATETIME_LOCAL_FORMAT), a separate
 * contract.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import {
  findDateOnlyMisparses,
  DATE_ONLY_COLUMNS,
} from "./meta/date-only-parse";

const ROOTS = ["app", "components", "lib"].map((r) => join(process.cwd(), r));

describe("I8 — date-only parse safety", () => {
  it("knows the date-only column set (sanity)", () => {
    expect(DATE_ONLY_COLUMNS.size).toBeGreaterThanOrEqual(6);
    expect(DATE_ONLY_COLUMNS.has("starts_at")).toBe(true);
  });

  it("no date-only column value is parsed with native new Date(string)", () => {
    const misparses = findDateOnlyMisparses(ROOTS).map(
      (m) => `${m.file}:${m.line}  new Date(${m.arg}) — use parseDateOnly / parseISO`,
    );
    expect(
      misparses,
      "date-only column values parsed as UTC midnight (off-by-one render)",
    ).toEqual([]);
  });
});
