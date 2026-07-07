/**
 * Tests for `parseDateOnly` (lib/utils/date-only.ts).
 *
 * Pin the process timezone to a US zone west of UTC before importing
 * anything — this is exactly the condition under which the bug this
 * util exists to prevent (`new Date('YYYY-MM-DD')` parses as UTC
 * midnight, rendering one calendar day early) manifests. See
 * notes/design-system.md "Parsing axis (date-only columns)".
 */
process.env.TZ = "America/Los_Angeles";

import { format } from "date-fns";
import { describe, expect, it } from "vitest";

import { parseDateOnly } from "@/lib/utils/date-only";

describe("parseDateOnly", () => {
  it("parses a Postgres date-only string ('2027-03-12') as local midnight, formatting as March 12", () => {
    const parsed = parseDateOnly("2027-03-12");
    expect(format(parsed, "MMM d, yyyy")).toBe("Mar 12, 2027");
  });

  it("documents the hazard it prevents: `new Date('2027-03-12')` would format as Mar 11 under TZ=America/Los_Angeles (UTC-rollback bug)", () => {
    const broken = new Date("2027-03-12");
    expect(format(broken, "MMM d, yyyy")).toBe("Mar 11, 2027");
  });
});
