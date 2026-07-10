/**
 * Tests for lib/utils/expense-visibility.ts (#384).
 *
 * One predicate drives both layers of the fix: the composer filters its
 * visibility options with it (layer 2) and the server action rejects
 * with it as the backstop (layer 1). The matrix mirrors
 * `can_see_content()` for the actor's own seat.
 */

import { describe, expect, it } from "vitest";

import {
  EXPENSE_VISIBILITY_OPTIONS,
  canViewerReadVisibility,
  isOrganizerRole,
  readableVisibilityOptions,
} from "../expense-visibility";

const ORGANIZER = { isOrganizer: true, isCelebrant: false };
const MEMBER = { isOrganizer: false, isCelebrant: false };
const CELEBRANT = { isOrganizer: false, isCelebrant: true };
/** Groom-runs-his-own-party edge: organizer AND celebrant. */
const ORGANIZER_CELEBRANT = { isOrganizer: true, isCelebrant: true };

describe("canViewerReadVisibility", () => {
  it.each([
    ["everyone", ORGANIZER, true],
    ["everyone", MEMBER, true],
    ["everyone", CELEBRANT, true],
    ["organizers_only", ORGANIZER, true],
    ["organizers_only", MEMBER, false],
    ["organizers_only", CELEBRANT, false],
    ["hide_from_celebrant", ORGANIZER, true],
    ["hide_from_celebrant", MEMBER, true],
    ["hide_from_celebrant", CELEBRANT, false],
    ["hide_from_celebrant", ORGANIZER_CELEBRANT, false],
  ] as const)("%s for %o → %s", (visibility, viewer, expected) => {
    expect(canViewerReadVisibility(visibility, viewer)).toBe(expected);
  });
});

describe("readableVisibilityOptions", () => {
  it("organizer sees all three", () => {
    expect(readableVisibilityOptions(ORGANIZER)).toEqual([
      "everyone",
      "organizers_only",
      "hide_from_celebrant",
    ]);
  });

  it("plain member sees everyone + hide_from_celebrant", () => {
    expect(readableVisibilityOptions(MEMBER)).toEqual([
      "everyone",
      "hide_from_celebrant",
    ]);
  });

  it("celebrant sees only everyone — the hiding mechanism never surfaces in their composer", () => {
    expect(readableVisibilityOptions(CELEBRANT)).toEqual(["everyone"]);
  });

  it("organizer-celebrant never sees the option that would self-hide", () => {
    expect(readableVisibilityOptions(ORGANIZER_CELEBRANT)).toEqual([
      "everyone",
      "organizers_only",
    ]);
  });

  it("preserves the canonical option order", () => {
    expect(EXPENSE_VISIBILITY_OPTIONS).toEqual([
      "everyone",
      "organizers_only",
      "hide_from_celebrant",
    ]);
  });
});

describe("isOrganizerRole", () => {
  it.each([
    ["organizer", true],
    ["co_organizer", true],
    ["attendee", false],
  ] as const)("%s → %s", (role, expected) => {
    expect(isOrganizerRole(role)).toBe(expected);
  });
});
