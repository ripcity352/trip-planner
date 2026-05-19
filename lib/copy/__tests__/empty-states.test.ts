/**
 * Sanity tests for the empty-state copy palette. We verify shape and
 * length — the *voice* check ("would you say this at a pre-trip dinner?")
 * is a human PR-review item, not something we can assert in code.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_STATES,
  EMPTY_STATE_CTAS,
  ATTENDEE_COUNT_BUCKET_LABELS,
  M2_UI_STRINGS,
  type EmptyStateKey,
  type AttendeeCountBucketLabelKey,
} from "@/lib/copy/empty-states";

const EXPECTED_KEYS: readonly EmptyStateKey[] = [
  "itinerary",
  "members",
  "expenses",
  "announcements",
  "polls",
  "photos",
  "trips_mine",
  "invites_for_trip",
];

// ~120 chars keeps strings to a tweet-line; anything longer is a paragraph,
// which is the wrong primitive for an empty state.
const MAX_LENGTH = 120;

describe("EMPTY_STATES", () => {
  it("covers every key in EmptyStateKey", () => {
    for (const key of EXPECTED_KEYS) {
      expect(EMPTY_STATES).toHaveProperty(key);
    }
    expect(Object.keys(EMPTY_STATES).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("has a non-empty string for every key", () => {
    for (const key of EXPECTED_KEYS) {
      const value = EMPTY_STATES[key];
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it(`keeps every string under ${MAX_LENGTH} characters`, () => {
    for (const key of EXPECTED_KEYS) {
      expect(EMPTY_STATES[key].length).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });
});

// CTA buttons sit on the mobile target (~375px); much longer than this
// and they wrap or get truncated.
const CTA_MAX_LENGTH = 40;

describe("EMPTY_STATE_CTAS", () => {
  it("has a non-empty trips_mine CTA <= 40 chars", () => {
    const cta = EMPTY_STATE_CTAS.trips_mine;
    expect(typeof cta).toBe("string");
    expect(cta?.trim().length).toBeGreaterThan(0);
    expect(cta?.length ?? 0).toBeLessThanOrEqual(CTA_MAX_LENGTH);
  });
});

// Bucket labels sit under an attendee-count chip on the logged-out
// invite preview. ~40 chars is plenty — anything longer wraps.
const BUCKET_LABEL_MAX_LENGTH = 40;
const EXPECTED_BUCKET_KEYS: readonly AttendeeCountBucketLabelKey[] = [
  "just-getting-started",
  "small-crew",
  "full-house",
  "big-group",
];

describe("ATTENDEE_COUNT_BUCKET_LABELS", () => {
  it("covers every bucket key returned by invite_preview", () => {
    for (const key of EXPECTED_BUCKET_KEYS) {
      expect(ATTENDEE_COUNT_BUCKET_LABELS).toHaveProperty(key);
    }
    expect(Object.keys(ATTENDEE_COUNT_BUCKET_LABELS).sort()).toEqual(
      [...EXPECTED_BUCKET_KEYS].sort()
    );
  });

  it("has a non-empty string of reasonable length for every bucket", () => {
    for (const key of EXPECTED_BUCKET_KEYS) {
      const value = ATTENDEE_COUNT_BUCKET_LABELS[key];
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value.length).toBeLessThanOrEqual(BUCKET_LABEL_MAX_LENGTH);
    }
  });
});

// M2 surface strings — paging-title, button labels, body copy on the
// /trips/new, /trips/[tripId], and /invite/[token] surfaces. We don't
// enumerate every key by name here (the type already pins exhaustiveness
// at compile time); we just sweep the recorded palette for shape.
describe("M2_UI_STRINGS", () => {
  it("every value is a non-empty string under 120 chars", () => {
    Object.values(M2_UI_STRINGS).forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value.length).toBeLessThanOrEqual(MAX_LENGTH);
    });
  });
});

// Wave 3 — date-poll surface strings. The sweep above already covers
// shape + length; we additionally pin specific keys exist with non-empty
// values, so a future refactor doesn't accidentally drop a chip label
// (the M2_UI_STRINGS object loses no compile-time exhaustiveness when
// a key is removed without an updated consumer). Chip labels are kept
// under ~24 chars so they fit a 375px chip without wrapping.
const DATE_POLL_CHIP_KEYS = [
  "datePoll_celebrant_chip_works",
  "datePoll_celebrant_chip_works_with_effort",
  "datePoll_celebrant_chip_no_go",
  "datePoll_member_vote_yes",
  "datePoll_member_vote_no",
] as const;
const DATE_POLL_CHIP_MAX = 24;

describe("M2_UI_STRINGS — date-poll keys", () => {
  it("date-poll chips fit a 375px chip without wrapping", () => {
    for (const key of DATE_POLL_CHIP_KEYS) {
      const value = M2_UI_STRINGS[key];
      expect(value, `${key} length`).toBeDefined();
      expect(value.length, `${key} length`).toBeLessThanOrEqual(
        DATE_POLL_CHIP_MAX
      );
    }
  });

  it("date-poll heading + subheads exist", () => {
    expect(M2_UI_STRINGS.datePoll_heading.length).toBeGreaterThan(0);
    expect(M2_UI_STRINGS.datePoll_celebrant_subhead.length).toBeGreaterThan(
      0
    );
    expect(M2_UI_STRINGS.datePoll_member_subhead.length).toBeGreaterThan(0);
    expect(
      M2_UI_STRINGS.datePoll_no_candidates_yet.length
    ).toBeGreaterThan(0);
  });
});
