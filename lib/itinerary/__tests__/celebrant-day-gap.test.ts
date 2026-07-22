/**
 * Unit tests for isCelebrantGapDay (#480) — pure helper flagging days
 * whose items are ALL invisible to the celebrant. TDD: written first.
 */

import { describe, it, expect } from "vitest";
import { isCelebrantGapDay } from "../celebrant-day-gap";
import type { TripVisibility } from "@/lib/db/types";

const items = (...visibilities: TripVisibility[]) =>
  visibilities.map((visibility) => ({ visibility }));

describe("isCelebrantGapDay", () => {
  it("returns true when every item is hide_from_celebrant", () => {
    expect(
      isCelebrantGapDay(items("hide_from_celebrant", "hide_from_celebrant"))
    ).toBe(true);
  });

  it("returns true when items are only hide_from_celebrant + organizers_only", () => {
    expect(
      isCelebrantGapDay(items("hide_from_celebrant", "organizers_only"))
    ).toBe(true);
  });

  it("returns false for a mixed day (one everyone item breaks the gap)", () => {
    expect(
      isCelebrantGapDay(items("hide_from_celebrant", "everyone"))
    ).toBe(false);
  });

  it("returns false when every item is visible to everyone", () => {
    expect(isCelebrantGapDay(items("everyone", "everyone"))).toBe(false);
  });

  it("treats custom visibility as celebrant-visible (conservative)", () => {
    // Documented simplification: we don't consult content_visibility_grants,
    // so a custom item counts as visible. A false negative is harmless —
    // the nudge is advisory, not a gate.
    expect(isCelebrantGapDay(items("custom", "hide_from_celebrant"))).toBe(
      false
    );
  });

  it("returns false for an empty item list (no items ≠ hidden items)", () => {
    expect(isCelebrantGapDay([])).toBe(false);
  });
});
