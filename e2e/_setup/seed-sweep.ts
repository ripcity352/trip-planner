/**
 * e2e/_setup/seed-sweep.ts
 *
 * Idempotent seed for the sweep e2e matrix. Builds three trips:
 *
 *   Trip A "Sweep Trip A" — dated, full content matrix + 8 personas
 *                           spanning every role / rsvp / visibility.
 *   Trip B "Sweep Trip B" — undated, live date poll (candidates, votes,
 *                           celebrant mark).
 *   Trip C "Sweep Trip C" — empty, membership disjoint from A/B.
 *
 * Admin (service-role) inserts bypass RLS — fine for seeding. Every write
 * is idempotent (deterministic idempotency keys or natural-key lookups),
 * so re-running never duplicates rows.
 *
 * Run (from project root, with the local-stack env sourced):
 *   pnpm dlx tsx e2e/_setup/seed-sweep.ts
 *
 * NOT a test file — no describe/test/it blocks.
 */

import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeAdminClient } from "./seed-m4-shared";
import {
  seedPersona,
  deterministicUuid,
  type SeededPersona,
} from "./seed-personas";
import type { TripVisibility } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PASSWORD = "Sweep-e2e-123";
const SUMMARY_PATH =
  "/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/42d65685-0084-44cc-950e-0ea7c4f40868/scratchpad/seed-summary.json";

/** Trip A locked dates (fixed so re-runs are deterministic). */
const TRIP_A_START = "2026-08-01";
const TRIP_A_END = "2026-08-04";

// ---------------------------------------------------------------------------
// Small idempotent helpers
// ---------------------------------------------------------------------------

/** ISO date string offset by `days` from a YYYY-MM-DD base. */
function addDays(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ensures a trip exists (idempotent by slug). Returns its id. */
async function ensureTrip(
  admin: SupabaseClient,
  opts: {
    slug: string;
    name: string;
    createdBy: string;
    startsAt: string | null;
    endsAt: string | null;
  }
): Promise<string> {
  const { slug, name, createdBy, startsAt, endsAt } = opts;

  const { data: existing, error: findError } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (findError) throw new Error(`ensureTrip(${slug}): ${findError.message}`);
  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from("trips")
    .insert({
      slug,
      name,
      created_by: createdBy,
      kind: "bachelor",
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`ensureTrip(${slug}) insert: ${error?.message ?? "no row"}`);
  }
  return created.id as string;
}

/** Ensures an itinerary item exists (idempotent by deterministic key). */
async function ensureItineraryItem(
  admin: SupabaseClient,
  opts: {
    tripId: string;
    createdBy: string;
    title: string;
    day: string;
    kind: "event" | "lodging" | "transport" | "meal" | "activity";
    visibility: TripVisibility;
    location?: string;
    costCents?: number;
  }
): Promise<string> {
  const key = deterministicUuid(`itin:${opts.tripId}:${opts.title}`);
  const { data: existing } = await admin
    .from("itinerary_items")
    .select("id")
    .eq("trip_id", opts.tripId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from("itinerary_items")
    .insert({
      trip_id: opts.tripId,
      created_by: opts.createdBy,
      title: opts.title,
      day: opts.day,
      kind: opts.kind,
      visibility: opts.visibility,
      location: opts.location ?? null,
      cost_cents: opts.costCents ?? null,
      idempotency_key: key,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`ensureItineraryItem(${opts.title}): ${error?.message ?? "no row"}`);
  }
  return created.id as string;
}

/** Ensures an announcement exists (idempotent by deterministic key). */
async function ensureAnnouncement(
  admin: SupabaseClient,
  opts: {
    tripId: string;
    authorId: string;
    body: string;
    visibility: TripVisibility;
    pinned?: boolean;
  }
): Promise<string> {
  const key = deterministicUuid(`ann:${opts.tripId}:${opts.body}`);
  const { data: existing } = await admin
    .from("announcements")
    .select("id")
    .eq("trip_id", opts.tripId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from("announcements")
    .insert({
      trip_id: opts.tripId,
      author_id: opts.authorId,
      created_by: opts.authorId,
      body: opts.body,
      visibility: opts.visibility,
      pinned: opts.pinned ?? false,
      idempotency_key: key,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`ensureAnnouncement: ${error?.message ?? "no row"}`);
  }
  return created.id as string;
}

/** Ensures a reaction exists (idempotent by the natural unique key). */
async function ensureReaction(
  admin: SupabaseClient,
  opts: { tripId: string; announcementId: string; memberId: string; emoji: string }
): Promise<void> {
  const { data: existing } = await admin
    .from("announcement_reactions")
    .select("id")
    .eq("announcement_id", opts.announcementId)
    .eq("trip_member_id", opts.memberId)
    .eq("emoji", opts.emoji)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("announcement_reactions").insert({
    trip_id: opts.tripId,
    announcement_id: opts.announcementId,
    trip_member_id: opts.memberId,
    emoji: opts.emoji,
  });
  if (error) throw new Error(`ensureReaction: ${error.message}`);
}

/**
 * Ensures a poll + its options exist. Returns poll id and option ids.
 * NOTE: `createdBy` is a trip_members id (polls.created_by → trip_members),
 * unlike the other content tables whose creator FK points at auth.users.
 */
async function ensurePoll(
  admin: SupabaseClient,
  opts: {
    tripId: string;
    createdBy: string;
    question: string;
    options: string[];
    visibility: TripVisibility;
  }
): Promise<{ pollId: string; optionIds: string[] }> {
  const key = deterministicUuid(`poll:${opts.tripId}:${opts.question}`);
  let pollId: string;

  const { data: existing } = await admin
    .from("polls")
    .select("id")
    .eq("trip_id", opts.tripId)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (existing) {
    pollId = existing.id as string;
  } else {
    const { data: created, error } = await admin
      .from("polls")
      .insert({
        trip_id: opts.tripId,
        created_by: opts.createdBy,
        question: opts.question,
        visibility: opts.visibility,
        idempotency_key: key,
      })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(`ensurePoll: ${error?.message ?? "no row"}`);
    }
    pollId = created.id as string;
  }

  const optionIds: string[] = [];
  for (let i = 0; i < opts.options.length; i++) {
    const label = opts.options[i];
    const { data: existingOpt } = await admin
      .from("poll_options")
      .select("id")
      .eq("poll_id", pollId)
      .eq("position", i)
      .maybeSingle();
    if (existingOpt) {
      optionIds.push(existingOpt.id as string);
      continue;
    }
    const { data: opt, error } = await admin
      .from("poll_options")
      .insert({ poll_id: pollId, label, position: i })
      .select("id")
      .single();
    if (error || !opt) {
      throw new Error(`ensurePoll option(${label}): ${error?.message ?? "no row"}`);
    }
    optionIds.push(opt.id as string);
  }

  return { pollId, optionIds };
}

/** Ensures a poll vote exists (idempotent by pk poll_id+trip_member_id). */
async function ensurePollVote(
  admin: SupabaseClient,
  opts: { pollId: string; optionId: string; memberId: string }
): Promise<void> {
  const { data: existing } = await admin
    .from("poll_votes")
    .select("poll_id")
    .eq("poll_id", opts.pollId)
    .eq("trip_member_id", opts.memberId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("poll_votes").insert({
    poll_id: opts.pollId,
    option_id: opts.optionId,
    trip_member_id: opts.memberId,
    idempotency_key: deterministicUuid(`pollvote:${opts.pollId}:${opts.memberId}`),
  });
  if (error) throw new Error(`ensurePollVote: ${error.message}`);
}

/**
 * Ensures an expense + even splits exist. Direct admin inserts (not the
 * create_expense_with_splits RPC, which requires an authenticated auth.uid()
 * as payer). Idempotent by the expense's deterministic key.
 */
async function ensureExpense(
  admin: SupabaseClient,
  opts: {
    tripId: string;
    payerUserId: string;
    description: string;
    amountCents: number;
    occurredOn: string;
    visibility: TripVisibility;
    splitMemberIds: string[];
  }
): Promise<string> {
  const key = deterministicUuid(`exp:${opts.tripId}:${opts.description}`);
  const { data: existing } = await admin
    .from("expenses")
    .select("id")
    .eq("trip_id", opts.tripId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: expense, error } = await admin
    .from("expenses")
    .insert({
      trip_id: opts.tripId,
      payer_id: opts.payerUserId,
      amount_cents: opts.amountCents,
      currency: "USD",
      description: opts.description,
      occurred_on: opts.occurredOn,
      visibility: opts.visibility,
      idempotency_key: key,
    })
    .select("id")
    .single();
  if (error || !expense) {
    throw new Error(`ensureExpense(${opts.description}): ${error?.message ?? "no row"}`);
  }

  // Even split, sum-exact: distribute the remainder across the first cents.
  const n = opts.splitMemberIds.length;
  const base = Math.floor(opts.amountCents / n);
  const remainder = opts.amountCents - base * n;
  const rows = opts.splitMemberIds.map((memberId, i) => ({
    expense_id: expense.id as string,
    trip_member_id: memberId,
    amount_cents: base + (i < remainder ? 1 : 0),
    currency: "USD",
  }));
  const { error: splitError } = await admin.from("expense_splits").insert(rows);
  if (splitError) {
    throw new Error(`ensureExpense splits(${opts.description}): ${splitError.message}`);
  }

  return expense.id as string;
}

/** Ensures an on-time flight leg exists (idempotent by deterministic key). */
async function ensureOnTimeLeg(
  admin: SupabaseClient,
  opts: { tripId: string; memberId: string; startsAt: string }
): Promise<void> {
  const key = deterministicUuid(`travel-leg:ontime:${opts.tripId}:${opts.memberId}`);
  const { data: existing } = await admin
    .from("travel_legs")
    .select("id")
    .eq("trip_id", opts.tripId)
    .eq("trip_member_id", opts.memberId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return;

  const arrive = new Date(`${opts.startsAt}T15:00:00Z`);
  const depart = new Date(`${opts.startsAt}T12:00:00Z`);
  const { error } = await admin.from("travel_legs").insert({
    trip_id: opts.tripId,
    trip_member_id: opts.memberId,
    kind: "flight",
    direction: "inbound",
    depart_at: depart.toISOString(),
    arrive_at: arrive.toISOString(),
    carrier: "Sweep Air",
    airline_iata: "SW",
    flight_number: "SW100",
    notes: "On-time arrival for day 1.",
    idempotency_key: key,
  });
  if (error) throw new Error(`ensureOnTimeLeg: ${error.message}`);
}

/** Ensures a lodging assignment exists (idempotent by natural unique key). */
async function ensureLodgingAssignment(
  admin: SupabaseClient,
  opts: { itemId: string; memberId: string; roomLabel: string }
): Promise<void> {
  const { data: existing } = await admin
    .from("lodging_assignments")
    .select("id")
    .eq("item_id", opts.itemId)
    .eq("trip_member_id", opts.memberId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("lodging_assignments").insert({
    item_id: opts.itemId,
    trip_member_id: opts.memberId,
    room_label: opts.roomLabel,
  });
  if (error) throw new Error(`ensureLodgingAssignment: ${error.message}`);
}

/** Ensures a trip_member_days row exists (idempotent by member+date). */
async function ensureMemberDay(
  admin: SupabaseClient,
  opts: { memberId: string; date: string; status: "going" | "maybe" | "declined" }
): Promise<void> {
  const { data: existing } = await admin
    .from("trip_member_days")
    .select("id")
    .eq("trip_member_id", opts.memberId)
    .eq("date", opts.date)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("trip_member_days").insert({
    trip_member_id: opts.memberId,
    date: opts.date,
    status: opts.status,
    idempotency_key: deterministicUuid(`memberday:${opts.memberId}:${opts.date}`),
  });
  if (error) throw new Error(`ensureMemberDay: ${error.message}`);
}

/**
 * Ensures an invite exists (idempotent by deterministic key). A revoked
 * invite is modeled the way the app models it: `expires_at` clamped to the
 * past (see revokeInvite in lib/db/invites.ts).
 */
async function ensureInvite(
  admin: SupabaseClient,
  opts: { tripId: string; createdBy: string; label: string; revoked: boolean }
): Promise<string> {
  const key = deterministicUuid(`invite:${opts.tripId}:${opts.label}`);
  const { data: existing } = await admin
    .from("invites")
    .select("token")
    .eq("trip_id", opts.tripId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return existing.token as string;

  const expiresAt = opts.revoked
    ? new Date(Date.now() - 60_000).toISOString() // clamped to the past
    : null; // active: no expiry
  const { data: created, error } = await admin
    .from("invites")
    .insert({
      trip_id: opts.tripId,
      created_by: opts.createdBy,
      expires_at: expiresAt,
      uses_left: opts.revoked ? 0 : null,
      idempotency_key: key,
    })
    .select("token")
    .single();
  if (error || !created) {
    throw new Error(`ensureInvite(${opts.label}): ${error?.message ?? "no row"}`);
  }
  return created.token as string;
}

/** Ensures a date-poll candidate exists (idempotent by trip+label). */
async function ensureDateCandidate(
  admin: SupabaseClient,
  opts: {
    tripId: string;
    createdBy: string;
    label: string;
    startsOn: string;
    endsOn: string;
  }
): Promise<string> {
  const { data: existing } = await admin
    .from("date_poll_candidates")
    .select("id")
    .eq("trip_id", opts.tripId)
    .eq("label", opts.label)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from("date_poll_candidates")
    .insert({
      trip_id: opts.tripId,
      created_by: opts.createdBy,
      label: opts.label,
      starts_on: opts.startsOn,
      ends_on: opts.endsOn,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`ensureDateCandidate(${opts.label}): ${error?.message ?? "no row"}`);
  }
  return created.id as string;
}

/** Ensures a date-poll vote exists (idempotent by pk candidate+member). */
async function ensureDateVote(
  admin: SupabaseClient,
  opts: { candidateId: string; memberId: string; vote: boolean }
): Promise<void> {
  const { data: existing } = await admin
    .from("date_poll_votes")
    .select("candidate_id")
    .eq("candidate_id", opts.candidateId)
    .eq("trip_member_id", opts.memberId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("date_poll_votes").insert({
    candidate_id: opts.candidateId,
    trip_member_id: opts.memberId,
    vote: opts.vote,
    idempotency_key: deterministicUuid(`datevote:${opts.candidateId}:${opts.memberId}`),
  });
  if (error) throw new Error(`ensureDateVote: ${error.message}`);
}

/** Ensures a celebrant date mark exists (idempotent by pk candidate_id). */
async function ensureCelebrantMark(
  admin: SupabaseClient,
  opts: {
    candidateId: string;
    markedBy: string;
    mark: "works" | "works-with-effort" | "no-go";
  }
): Promise<void> {
  const { data: existing } = await admin
    .from("date_poll_celebrant_marks")
    .select("candidate_id")
    .eq("candidate_id", opts.candidateId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("date_poll_celebrant_marks").insert({
    candidate_id: opts.candidateId,
    marked_by: opts.markedBy,
    mark: opts.mark,
  });
  if (error) throw new Error(`ensureCelebrantMark: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Trip A — dated, full content matrix
// ---------------------------------------------------------------------------

async function seedTripA(
  admin: SupabaseClient
): Promise<{ tripId: string; personas: SeededPersona[] }> {
  // The founder user must exist before the trip row (trips.created_by FK),
  // but seedPersona needs a tripId — so create the user, then the trip, then
  // seed the founder's membership.
  const { seedUser } = await import("./seed-m4-shared");
  const founderUser = await seedUser(admin, "sweep-founder@e2e.local", PASSWORD);
  const tripId = await ensureTrip(admin, {
    slug: "sweep-trip-a",
    name: "Sweep Trip A",
    createdBy: founderUser.userId,
    startsAt: TRIP_A_START,
    endsAt: TRIP_A_END,
  });

  const founder = await seedPersona(admin, {
    tripId,
    email: "sweep-founder@e2e.local",
    password: PASSWORD,
    role: "organizer",
    rsvp: "going",
  });

  const personas: SeededPersona[] = [founder];

  personas.push(
    await seedPersona(admin, {
      tripId,
      email: "sweep-co-organizer@e2e.local",
      password: PASSWORD,
      role: "co_organizer",
      rsvp: "going",
    })
  );
  const celebrant = await seedPersona(admin, {
    tripId,
    email: "sweep-celebrant@e2e.local",
    password: PASSWORD,
    role: "attendee",
    rsvp: "going",
    isCelebrant: true,
  });
  personas.push(celebrant);
  const memberGoing = await seedPersona(admin, {
    tripId,
    email: "sweep-member-going@e2e.local",
    password: PASSWORD,
    role: "attendee",
    rsvp: "going",
  });
  personas.push(memberGoing);
  personas.push(
    await seedPersona(admin, {
      tripId,
      email: "sweep-member-maybe@e2e.local",
      password: PASSWORD,
      role: "attendee",
      rsvp: "maybe",
    })
  );
  personas.push(
    await seedPersona(admin, {
      tripId,
      email: "sweep-member-declined@e2e.local",
      password: PASSWORD,
      role: "attendee",
      rsvp: "declined",
    })
  );
  personas.push(
    await seedPersona(admin, {
      tripId,
      email: "sweep-member-pending@e2e.local",
      password: PASSWORD,
      role: "attendee",
      rsvp: "pending",
    })
  );
  const memberLate = await seedPersona(admin, {
    tripId,
    email: "sweep-member-late@e2e.local",
    password: PASSWORD,
    role: "attendee",
    rsvp: "going",
    arrival: "late",
  });
  personas.push(memberLate);

  const goingMemberIds = [
    founder.memberId,
    personas[1].memberId, // co-organizer
    celebrant.memberId,
    memberGoing.memberId,
    memberLate.memberId,
  ];

  // --- Itinerary: ≥3 items incl. hide_from_celebrant, organizers_only, lodging
  await ensureItineraryItem(admin, {
    tripId,
    createdBy: founder.userId,
    title: "Welcome Dinner",
    day: TRIP_A_START,
    kind: "meal",
    visibility: "everyone",
    location: "The Boathouse",
    costCents: 8000,
  });
  await ensureItineraryItem(admin, {
    tripId,
    createdBy: founder.userId,
    title: "Surprise Roast Prep",
    day: addDays(TRIP_A_START, 1),
    kind: "event",
    visibility: "hide_from_celebrant",
  });
  await ensureItineraryItem(admin, {
    tripId,
    createdBy: founder.userId,
    title: "Organizer Budget Sync",
    day: addDays(TRIP_A_START, 1),
    kind: "activity",
    visibility: "organizers_only",
  });
  const lodgingItemId = await ensureItineraryItem(admin, {
    tripId,
    createdBy: founder.userId,
    title: "Lakeside Cabin",
    day: TRIP_A_START,
    kind: "lodging",
    visibility: "everyone",
    location: "42 Shoreline Rd",
  });

  // --- Announcements: ≥2 (one organizers_only) + a reaction
  const welcomeAnnId = await ensureAnnouncement(admin, {
    tripId,
    authorId: founder.userId,
    body: "Welcome to the trip — lock in your travel and RSVP when you can.",
    visibility: "everyone",
    pinned: true,
  });
  await ensureAnnouncement(admin, {
    tripId,
    authorId: founder.userId,
    body: "Organizers: keep the roast prep off the group thread.",
    visibility: "organizers_only",
  });
  await ensureReaction(admin, {
    tripId,
    announcementId: welcomeAnnId,
    memberId: memberGoing.memberId,
    emoji: "🔥",
  });

  // --- Poll (regular) with options + a couple votes
  const { pollId, optionIds } = await ensurePoll(admin, {
    tripId,
    createdBy: founder.memberId, // polls.created_by → trip_members(id), not auth.users
    question: "Which activity should we do Saturday?",
    options: ["Kayaking", "Wine tour", "Golf"],
    visibility: "everyone",
  });
  await ensurePollVote(admin, {
    pollId,
    optionId: optionIds[0],
    memberId: memberGoing.memberId,
  });
  await ensurePollVote(admin, {
    pollId,
    optionId: optionIds[1],
    memberId: celebrant.memberId,
  });

  // --- Expenses (≥2) with even splits across going members
  await ensureExpense(admin, {
    tripId,
    payerUserId: founder.userId,
    description: "Cabin deposit",
    amountCents: 60000,
    occurredOn: TRIP_A_START,
    visibility: "everyone",
    splitMemberIds: goingMemberIds,
  });
  await ensureExpense(admin, {
    tripId,
    payerUserId: personas[1].userId, // co-organizer paid
    description: "Group dinner",
    amountCents: 24000,
    occurredOn: TRIP_A_START,
    visibility: "everyone",
    splitMemberIds: goingMemberIds,
  });

  // --- Travel legs for 2 members (founder on-time; member-late already seeded)
  await ensureOnTimeLeg(admin, {
    tripId,
    memberId: founder.memberId,
    startsAt: TRIP_A_START,
  });

  // --- Lodging assignment
  await ensureLodgingAssignment(admin, {
    itemId: lodgingItemId,
    memberId: memberGoing.memberId,
    roomLabel: "Room 1",
  });

  // --- trip_member_days for a couple members across the trip window
  for (let d = 0; d <= 3; d++) {
    const date = addDays(TRIP_A_START, d);
    await ensureMemberDay(admin, { memberId: founder.memberId, date, status: "going" });
    await ensureMemberDay(admin, {
      memberId: memberLate.memberId,
      date,
      status: d === 0 ? "declined" : "going", // absent day 1 (late arrival)
    });
  }

  // --- Invites: 1 active + 1 revoked
  await ensureInvite(admin, {
    tripId,
    createdBy: founder.userId,
    label: "active",
    revoked: false,
  });
  await ensureInvite(admin, {
    tripId,
    createdBy: founder.userId,
    label: "revoked",
    revoked: true,
  });

  return { tripId, personas };
}

// ---------------------------------------------------------------------------
// Trip B — undated, live date poll
// ---------------------------------------------------------------------------

async function seedTripB(
  admin: SupabaseClient
): Promise<{ tripId: string; personas: SeededPersona[] }> {
  const { seedUser } = await import("./seed-m4-shared");
  const founderUser = await seedUser(admin, "sweep-founder@e2e.local", PASSWORD);
  const tripId = await ensureTrip(admin, {
    slug: "sweep-trip-b",
    name: "Sweep Trip B",
    createdBy: founderUser.userId,
    startsAt: null,
    endsAt: null,
  });

  const founder = await seedPersona(admin, {
    tripId,
    email: "sweep-founder@e2e.local",
    password: PASSWORD,
    role: "organizer",
    rsvp: "going",
  });
  const celebrant = await seedPersona(admin, {
    tripId,
    email: "sweep-celebrant@e2e.local",
    password: PASSWORD,
    role: "attendee",
    rsvp: "going",
    isCelebrant: true,
  });
  const memberGoing = await seedPersona(admin, {
    tripId,
    email: "sweep-member-going@e2e.local",
    password: PASSWORD,
    role: "attendee",
    rsvp: "going",
  });

  // Date poll: candidates + votes + celebrant mark
  const cand1 = await ensureDateCandidate(admin, {
    tripId,
    createdBy: founder.userId,
    label: "Labor Day weekend",
    startsOn: "2026-09-04",
    endsOn: "2026-09-07",
  });
  const cand2 = await ensureDateCandidate(admin, {
    tripId,
    createdBy: founder.userId,
    label: "Mid-September",
    startsOn: "2026-09-18",
    endsOn: "2026-09-21",
  });

  await ensureDateVote(admin, { candidateId: cand1, memberId: founder.memberId, vote: true });
  await ensureDateVote(admin, { candidateId: cand1, memberId: memberGoing.memberId, vote: true });
  await ensureDateVote(admin, { candidateId: cand2, memberId: founder.memberId, vote: false });
  await ensureDateVote(admin, { candidateId: cand2, memberId: memberGoing.memberId, vote: true });

  await ensureCelebrantMark(admin, {
    candidateId: cand1,
    markedBy: celebrant.userId,
    mark: "works",
  });
  await ensureCelebrantMark(admin, {
    candidateId: cand2,
    markedBy: celebrant.userId,
    mark: "works-with-effort",
  });

  return { tripId, personas: [founder, celebrant, memberGoing] };
}

// ---------------------------------------------------------------------------
// Trip C — empty, disjoint membership
// ---------------------------------------------------------------------------

async function seedTripC(
  admin: SupabaseClient
): Promise<{ tripId: string; personas: SeededPersona[] }> {
  const { seedUser } = await import("./seed-m4-shared");
  const founderUser = await seedUser(admin, "sweep-c-founder@e2e.local", PASSWORD);
  const tripId = await ensureTrip(admin, {
    slug: "sweep-trip-c",
    name: "Sweep Trip C",
    createdBy: founderUser.userId,
    startsAt: null,
    endsAt: null,
  });

  const founder = await seedPersona(admin, {
    tripId,
    email: "sweep-c-founder@e2e.local",
    password: PASSWORD,
    role: "organizer",
    rsvp: "going",
  });
  const member = await seedPersona(admin, {
    tripId,
    email: "sweep-c-member@e2e.local",
    password: PASSWORD,
    role: "attendee",
    rsvp: "going",
  });

  return { tripId, personas: [founder, member] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "seed-sweep: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set " +
        "(did you source local-stack.env?)"
    );
  }
  const admin = makeAdminClient();

  console.log("[seed-sweep] Trip A (dated, full matrix)...");
  const a = await seedTripA(admin);
  console.log("[seed-sweep] Trip B (undated, date poll)...");
  const b = await seedTripB(admin);
  console.log("[seed-sweep] Trip C (empty, disjoint)...");
  const c = await seedTripC(admin);

  // Dedupe personas by email for the summary (Trip A/B share personas).
  const byEmail = new Map<string, SeededPersona>();
  for (const p of [...a.personas, ...b.personas, ...c.personas]) {
    byEmail.set(p.email, p);
  }

  const summary = {
    tripIds: { A: a.tripId, B: b.tripId, C: c.tripId },
    slugs: { A: "sweep-trip-a", B: "sweep-trip-b", C: "sweep-trip-c" },
    personas: [...byEmail.values()].map((p) => ({
      email: p.email,
      role: p.role,
      rsvp: p.rsvp,
      isCelebrant: p.isCelebrant,
      storageState: p.storageState,
    })),
  };

  const json = JSON.stringify(summary, null, 2);
  fs.writeFileSync(SUMMARY_PATH, json, "utf-8");
  console.log(`[seed-sweep] Summary written to ${SUMMARY_PATH}`);
  console.log(json);
}

const isMain =
  process.argv[1]?.endsWith("seed-sweep.ts") ||
  process.argv[1]?.endsWith("seed-sweep.js");

if (isMain) {
  main().catch((err) => {
    console.error("[seed-sweep] FATAL:", err);
    process.exit(1);
  });
}
