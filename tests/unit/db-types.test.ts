/**
 * Smoke test for the lib/db wiring: imports compile, enum unions are
 * narrow, row shapes carry the expected required fields. Doesn't hit
 * a database — purely TypeScript-shape verification.
 */

import { describe, expectTypeOf, it } from "vitest";
import type {
  Availability,
  AvailabilityStatus,
  ExpenseSplit,
  Profile,
  RsvpStatus,
  Trip,
  TripKind,
  TripMember,
  TripMemberDay,
  TripMemberDayStatus,
  TripRole,
  TripVisibility,
} from "@/lib/db";

describe("lib/db types", () => {
  it("narrows enum unions to the exact migration values", () => {
    expectTypeOf<TripRole>().toEqualTypeOf<
      "organizer" | "co_organizer" | "attendee"
    >();
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

  it("M1 enums narrow correctly", () => {
    expectTypeOf<TripKind>().toEqualTypeOf<"bachelor">();
    expectTypeOf<TripVisibility>().toEqualTypeOf<
      "everyone" | "organizers_only" | "hide_from_celebrant" | "custom"
    >();
    expectTypeOf<TripMemberDayStatus>().toEqualTypeOf<
      "going" | "maybe" | "declined"
    >();
  });

  it("Trip gains M1 columns", () => {
    expectTypeOf<Trip["kind"]>().toEqualTypeOf<TripKind>();
    expectTypeOf<Trip["is_template"]>().toBeBoolean();
    expectTypeOf<Trip["deleted_at"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Trip["archived_at"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Trip["vibe_tags"]>().toEqualTypeOf<string[]>();
  });

  it("TripMember supports accountless attendees", () => {
    expectTypeOf<TripMember["id"]>().toBeString();
    expectTypeOf<TripMember["user_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<TripMember["is_celebrant"]>().toBeBoolean();
    expectTypeOf<TripMember["display_name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<TripMember["phone_e164"]>().toEqualTypeOf<string | null>();
    expectTypeOf<TripMember["email"]>().toEqualTypeOf<string | null>();
  });

  it("Availability and ExpenseSplit are now FK-retargeted", () => {
    expectTypeOf<Availability["trip_member_id"]>().toBeString();
    expectTypeOf<Availability["idempotency_key"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<ExpenseSplit["trip_member_id"]>().toBeString();
    expectTypeOf<ExpenseSplit["currency"]>().toBeString();
  });

  it("TripMemberDay rows carry idempotency + status", () => {
    expectTypeOf<TripMemberDay["status"]>().toEqualTypeOf<TripMemberDayStatus>();
    expectTypeOf<TripMemberDay["idempotency_key"]>().toEqualTypeOf<
      string | null
    >();
  });
});
