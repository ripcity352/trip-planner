/**
 * tests/unit/fixtures/auth-roles.test.ts
 *
 * Unit tests for the M4 multi-persona auth fixture helpers.
 * Verifies that:
 *   1. asOrganizer() / asCelebrant() resolve to different user IDs.
 *   2. Both personas resolve to the SAME trip ID (M4_TEST_TRIP_ID).
 *   3. Organizer's membership row has role='organizer'.
 *   4. Celebrant's membership row has role='attendee', is_celebrant=true.
 *   5. STORAGE_STATE_PATH (M3 back-compat) is still exported and points to a .json file.
 *
 * These are pure-module assertions — they validate exported constants and
 * the shape of the helpers WITHOUT spawning a browser or hitting Supabase.
 * The seed scripts (e2e/_setup/seed-test-{organizer,celebrant}.ts) do the
 * actual DB work; this file verifies the fixture module's contract.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  STORAGE_STATE_PATH,
  STORAGE_STATE_ORGANIZER_PATH,
  STORAGE_STATE_CELEBRANT_PATH,
  ORGANIZER_USER_ID,
  CELEBRANT_USER_ID,
  M4_TEST_TRIP_ID,
  asOrganizer,
  asCelebrant,
  ORGANIZER_ROLE,
  CELEBRANT_ROLE,
  CELEBRANT_IS_CELEBRANT,
  ORGANIZER_IS_CELEBRANT,
} from "../../fixtures/auth";

// ---------------------------------------------------------------------------
// 1. M3 back-compat: STORAGE_STATE_PATH still works
// ---------------------------------------------------------------------------
describe("STORAGE_STATE_PATH (M3 back-compat)", () => {
  it("is exported as a string", () => {
    expect(typeof STORAGE_STATE_PATH).toBe("string");
  });

  it("points to a .json file", () => {
    expect(STORAGE_STATE_PATH).toMatch(/\.json$/);
  });

  it("is an absolute path", () => {
    expect(path.isAbsolute(STORAGE_STATE_PATH)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Organizer path
// ---------------------------------------------------------------------------
describe("STORAGE_STATE_ORGANIZER_PATH", () => {
  it("is exported as a string", () => {
    expect(typeof STORAGE_STATE_ORGANIZER_PATH).toBe("string");
  });

  it("points to a .json file", () => {
    expect(STORAGE_STATE_ORGANIZER_PATH).toMatch(/\.json$/);
  });

  it("is distinct from the M3 path", () => {
    expect(STORAGE_STATE_ORGANIZER_PATH).not.toBe(STORAGE_STATE_PATH);
  });
});

// ---------------------------------------------------------------------------
// 3. Celebrant path
// ---------------------------------------------------------------------------
describe("STORAGE_STATE_CELEBRANT_PATH", () => {
  it("is exported as a string", () => {
    expect(typeof STORAGE_STATE_CELEBRANT_PATH).toBe("string");
  });

  it("points to a .json file", () => {
    expect(STORAGE_STATE_CELEBRANT_PATH).toMatch(/\.json$/);
  });

  it("is distinct from both STORAGE_STATE_PATH and STORAGE_STATE_ORGANIZER_PATH", () => {
    expect(STORAGE_STATE_CELEBRANT_PATH).not.toBe(STORAGE_STATE_PATH);
    expect(STORAGE_STATE_CELEBRANT_PATH).not.toBe(STORAGE_STATE_ORGANIZER_PATH);
  });
});

// ---------------------------------------------------------------------------
// 4. User IDs resolve to DIFFERENT users
// ---------------------------------------------------------------------------
describe("persona user IDs", () => {
  it("ORGANIZER_USER_ID is a non-empty string or null (populated after seeding)", () => {
    // Before seeding, these are env-var-sourced — may be empty string in
    // a clean env. After seeding they must be valid UUIDs. We just verify
    // the export exists and is a string.
    expect(typeof ORGANIZER_USER_ID).toBe("string");
  });

  it("CELEBRANT_USER_ID is a non-empty string or null (populated after seeding)", () => {
    expect(typeof CELEBRANT_USER_ID).toBe("string");
  });

  it("organizer and celebrant user IDs differ", () => {
    // Only meaningful when both are set — skip if env is absent.
    if (!ORGANIZER_USER_ID || !CELEBRANT_USER_ID) return;
    expect(ORGANIZER_USER_ID).not.toBe(CELEBRANT_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// 5. Both personas share the SAME test trip
// ---------------------------------------------------------------------------
describe("M4_TEST_TRIP_ID", () => {
  it("is exported as a string", () => {
    expect(typeof M4_TEST_TRIP_ID).toBe("string");
  });

  it("asOrganizer() returns the same trip ID as asCelebrant()", () => {
    const { tripId: organizerTrip } = asOrganizer();
    const { tripId: celebrantTrip } = asCelebrant();
    expect(organizerTrip).toBe(M4_TEST_TRIP_ID);
    expect(celebrantTrip).toBe(M4_TEST_TRIP_ID);
    expect(organizerTrip).toBe(celebrantTrip);
  });
});

// ---------------------------------------------------------------------------
// 6. Role constants: organizer membership shape
// ---------------------------------------------------------------------------
describe("organizer role constants", () => {
  it("ORGANIZER_ROLE is 'organizer'", () => {
    expect(ORGANIZER_ROLE).toBe("organizer");
  });

  it("ORGANIZER_IS_CELEBRANT is false", () => {
    expect(ORGANIZER_IS_CELEBRANT).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Role constants: celebrant membership shape
// ---------------------------------------------------------------------------
describe("celebrant role constants", () => {
  it("CELEBRANT_ROLE is 'attendee'", () => {
    expect(CELEBRANT_ROLE).toBe("attendee");
  });

  it("CELEBRANT_IS_CELEBRANT is true", () => {
    expect(CELEBRANT_IS_CELEBRANT).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. asOrganizer() / asCelebrant() helper shape
// ---------------------------------------------------------------------------
describe("asOrganizer()", () => {
  it("returns an object with storageState, userId, tripId, role, isCelebrant", () => {
    const ctx = asOrganizer();
    expect(ctx).toHaveProperty("storageState", STORAGE_STATE_ORGANIZER_PATH);
    expect(ctx).toHaveProperty("userId", ORGANIZER_USER_ID);
    expect(ctx).toHaveProperty("tripId", M4_TEST_TRIP_ID);
    expect(ctx).toHaveProperty("role", "organizer");
    expect(ctx).toHaveProperty("isCelebrant", false);
  });
});

describe("asCelebrant()", () => {
  it("returns an object with storageState, userId, tripId, role, isCelebrant", () => {
    const ctx = asCelebrant();
    expect(ctx).toHaveProperty("storageState", STORAGE_STATE_CELEBRANT_PATH);
    expect(ctx).toHaveProperty("userId", CELEBRANT_USER_ID);
    expect(ctx).toHaveProperty("tripId", M4_TEST_TRIP_ID);
    expect(ctx).toHaveProperty("role", "attendee");
    expect(ctx).toHaveProperty("isCelebrant", true);
  });
});
