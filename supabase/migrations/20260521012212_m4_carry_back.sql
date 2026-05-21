-- =============================================================
-- 20260521012212_m4_carry_back.sql
-- M4 Wave 0b — Carry-back schema deltas.
--
-- Depends on:
--   * 20260520052357_m3_itinerary_announcements.sql  — all M3 tables,
--     itinerary_item_member_flags + its organizer-read SELECT policy
--
-- Closes (schema portions): #108, #154, #158, #166, #168
-- PR coverage: C1 (server-action contracts), C4 (decoy-RLS triad),
--              Lazy-Path H2 (per-row ADR)
--
-- Deltas shipped (per M4 execution plan Schema-Deltas table):
--   Delta 1 — itinerary_item_member_flags: additive SELECT policy "item flags: owner reads own"
--   Delta 2 — invites: idempotency_key column + partial unique index
--   Delta 4 — invites: UPDATE policy "organizers can update invites"
--   Delta 5 — trips: timezone column
--   Delta 6 — itinerary_items: address_place_id + address_provider columns
--   Delta 7 — travel_legs: airline_iata + flight_number columns
--
-- Deltas explicitly NOT shipped here:
--   Delta 3  — M5-deferred
--   Delta 8  — code-only, W0c
--   Delta 9  — code-only, W0c
-- =============================================================

-- =============================================================
-- Delta 1 — itinerary_item_member_flags: additive owner SELECT policy
--
-- The M3 migration created "item flags: organizers read" which allows
-- organizers to see ALL flags. This new policy allows each member to
-- read their OWN flags. Both policies stack via OR (Postgres additive
-- semantics) — organizer still sees everything, members now see their own.
--
-- ADDITIVE: does NOT drop the existing organizer-read policy.
-- =============================================================

create policy "item flags: owner reads own"
  on public.itinerary_item_member_flags for select
  using (
    trip_member_id in (
      select id from public.trip_members where user_id = auth.uid()
    )
  );

comment on policy "item flags: owner reads own" on public.itinerary_item_member_flags is
  'M4 Delta 1. Additive to the M3 organizer-read policy. Allows a member to SELECT their own flag rows. Stacks via OR — organizer context returns all flags, member context returns own flags only. Coverage C4 (decoy-RLS triad).';

-- =============================================================
-- Delta 2 — invites: idempotency_key column + partial unique index
--
-- Nullable UUID. Scope: (trip_id, idempotency_key) — organizer-acting
-- scope per notes/database-workflow.md ADR (Lazy-Path H2).
-- The partial index covers only non-null keys to keep the index lean.
-- W2-era server actions populate this column; W0b just provisions it.
-- =============================================================

alter table public.invites
  add column idempotency_key uuid;

comment on column public.invites.idempotency_key is
  'M4 Delta 2. Client-generated UUID for invite-creation replay safety. Scope (trip_id, idempotency_key) — organizer-acting per ADR. Partial unique index enforces replay safety; null = no idempotency guard. Populated by W2-era server actions. Closes #158.';

create unique index invites_idempotency_key_partial
  on public.invites (trip_id, idempotency_key)
  where idempotency_key is not null;

-- =============================================================
-- Delta 4 — invites: UPDATE policy for organizers
--
-- The M3 band-aid (revokeInvite chaining .select("token") + throwing on
-- zero rows) exists because there was no UPDATE RLS policy. This policy
-- grants organizers and co-organizers (is_trip_organizer = true for both)
-- the ability to UPDATE invite rows. After this migration, revokeInvite
-- can drop the band-aid and rely on normal affected-count semantics.
-- Closes #154.
-- =============================================================

create policy "organizers can update invites"
  on public.invites for update
  using (public.is_trip_organizer(trip_id))
  with check (public.is_trip_organizer(trip_id));

comment on policy "organizers can update invites" on public.invites is
  'M4 Delta 4. Allows organizers and co-organizers (is_trip_organizer covers both roles) to UPDATE invite rows — e.g. revoking via expires_at clamp. Removes the need for the M3 band-aid in lib/db/invites.ts::revokeInvite. Closes #154.';

-- =============================================================
-- Delta 5 — trips: timezone column
--
-- Not null with a safe default so existing rows get a valid value.
-- 'America/Los_Angeles' is the Party Trip MVP market default; organizers
-- can update per-trip. Closes #108.
-- =============================================================

alter table public.trips
  add column timezone text not null default 'America/Los_Angeles';

comment on column public.trips.timezone is
  'M4 Delta 5. IANA timezone identifier for this trip, e.g. "America/Los_Angeles". Drives start_time display on itinerary items and calendar exports. Default: America/Los_Angeles (MVP market). Closes #108.';

-- =============================================================
-- Delta 6 — itinerary_items: address place-ID + provider columns
--
-- Nullable — legacy rows have no place lookup. The pair (address_place_id,
-- address_provider) lets the UI deep-link to the original map result without
-- re-querying the Places API.
-- =============================================================

alter table public.itinerary_items
  add column address_place_id text,
  add column address_provider text;

comment on column public.itinerary_items.address_place_id is
  'M4 Delta 6. Opaque place identifier from the provider (Google Place ID, Foursquare venue ID, etc.). Nullable — absent for manually entered addresses. Pair with address_provider.';

comment on column public.itinerary_items.address_provider is
  'M4 Delta 6. Source of the place ID, e.g. "google_places" or "foursquare". Nullable — absent for manually entered addresses. Pair with address_place_id.';

-- =============================================================
-- Delta 7 — travel_legs: airline_iata + flight_number columns
--
-- IATA airline code is CHAR(2) — enforced by the type; NULL for non-flight
-- legs. flight_number is text (some carriers use alphanumeric codes).
-- Both nullable because only flight-kind legs populate them; drive/train/
-- other legs leave them null.
-- =============================================================

alter table public.travel_legs
  add column airline_iata char(2),
  add column flight_number text;

comment on column public.travel_legs.airline_iata is
  'M4 Delta 7. IATA two-letter airline code, e.g. "UA", "DL". Null for non-flight travel legs. CHAR(2) enforces exact length at the DB level.';

comment on column public.travel_legs.flight_number is
  'M4 Delta 7. Airline flight number, e.g. "2345" or "UA2345". Text rather than integer to handle carrier prefixes and leading zeros. Null for non-flight legs.';

-- =============================================================
-- End of 20260521012212_m4_carry_back.sql
-- =============================================================
