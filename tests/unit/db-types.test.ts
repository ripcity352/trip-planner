/**
 * Smoke test for the lib/db wiring: imports compile, enum unions are
 * narrow, row shapes carry the expected required fields. Doesn't hit
 * a database — purely TypeScript-shape verification.
 */

import { describe, expectTypeOf, it } from "vitest";
import type {
  AvailabilityStatus,
  Profile,
  RsvpStatus,
  Trip,
  TripRole,
} from "@/lib/db";

describe("lib/db types", () => {
  it("narrows enum unions to the exact migration values", () => {
    expectTypeOf<TripRole>().toEqualTypeOf<"organizer" | "attendee">();
    expectTypeOf<RsvpStatus>().toEqualTypeOf<
      "pending" | "going" | "maybe" | "declined"
    >();
    expectTypeOf<AvailabilityStatus>().toEqualTypeOf<"yes" | "no" | "maybe">();
  });

  it("Trip carries non-nullable identity + audit fields", () => {
    expectTypeOf<Trip["id"]>().toBeString();
    expectTypeOf<Trip["slug"]>().toBeString();
    expectTypeOf<Trip["name"]>().toBeString();
    expectTypeOf<Trip["created_by"]>().toBeString();
    expectTypeOf<Trip["created_at"]>().toBeString();
  });

  it("Trip nullables match the migration", () => {
    expectTypeOf<Trip["description"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Trip["location"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Trip["starts_at"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Trip["ends_at"]>().toEqualTypeOf<string | null>();
  });

  it("Profile nullables match the migration", () => {
    expectTypeOf<Profile["display_name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Profile["avatar_url"]>().toEqualTypeOf<string | null>();
  });
});
