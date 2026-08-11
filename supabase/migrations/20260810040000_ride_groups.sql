-- =============================================================
-- #581 — ride groups (recommend → add who you're riding with)
-- =============================================================
-- What: a persisted "who's sharing a car" primitive on top of the arrivals
-- data. The ride-share nudge (lib/utils/ride-share.ts) only COUNTED people
-- at an airport; this records the actual ride so coordination stops living
-- in the group chat (#118 Deliverable 1). Both directions: an ARRIVAL ride
-- shares a car FROM the airport (inbound), a DEPARTURE ride shares a car TO
-- the airport (outbound).
--
-- Reuses the #574 write-on-behalf + forgery-proof-attribution pattern, but
-- applied to a NEW entity (a ride is not a travel leg): a rider row's
-- `written_by_trip_member_id` is PERMANENT PROVENANCE (never cleared — there
-- is NO confirm gesture). A self-joined rider is born written_by NULL and
-- reads plain; an added rider reads "added by X" for good. The ONLY member
-- gesture is opt-out = delete your own row. See notes/decisions.md
-- 2026-08-10 #581 ADR for the "shared note, not personal record" rationale.
--
-- ⚠️ 2nd-FK PostgREST trap (took the crew page down on #550): ride_group_members
-- has TWO FKs to trip_members (trip_member_id + written_by_trip_member_id).
-- We ship NO trip_members embed — the ride_group_manifest view exposes both
-- as PLAIN scalar columns; names resolve app-side. Verified with a real curl
-- to local supabase_rest (a bare embed → HTTP 300; we never write one).
-- =============================================================

-- ---- 1. ride_groups -----------------------------------------
-- direction: text + check (mirrors travel_legs.direction — no enum type in
-- this schema). NOT NULL, no default (rule #8: state direction explicitly).
-- created_by ON DELETE SET NULL (never CASCADE — a departing organizer must
-- not nuke a whole ride + its riders); an orphaned group stays cleanable via
-- the organizer escape hatch on the DELETE policy.
create table public.ride_groups (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_trip_member_id uuid
    references public.trip_members(id) on delete set null,
  airport text,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- rule #7: visibility-first. v1 ships 'everyone' and RLS respects the
  -- column; custom / hide_from_celebrant authoring UI is deferred (v2).
  visibility public.trip_visibility not null default 'everyone',
  -- rule #9: drunk-double-tap create is the literal use case.
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

comment on table public.ride_groups is
  '#581. A persisted ride (who''s sharing a car) at an airport, per direction (inbound = ride from airport, outbound = ride to airport). created_by is delete-authority, NOT a rider invariant (an organizer can arrange a ride they''re not in). Riders live in ride_group_members.';

-- rule #9 idempotency scope: member-acting, mirrors travel_legs.
create unique index ride_groups_idempotency
  on public.ride_groups (trip_id, created_by_trip_member_id, idempotency_key)
  where idempotency_key is not null;

alter table public.ride_groups enable row level security;

-- SELECT: any member who can see the trip's content at this visibility.
create policy "ride groups: members read"
  on public.ride_groups
  for select
  to authenticated
  using (public.can_see_content(trip_id, visibility));

-- INSERT: created_by must be the caller's OWN membership in this trip
-- (writer-binding + tenancy, rule #6).
create policy "ride groups: creator insert"
  on public.ride_groups
  for insert
  to authenticated
  with check (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = ride_groups.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- DELETE: the creator, OR any organizer of the trip (so a created_by-SET-NULL
-- orphaned group is still cleanable). No UPDATE policy — ride_groups is
-- immutable after create in v1 (no edit action, no update grant).
create policy "ride groups: creator or organizer delete"
  on public.ride_groups
  for delete
  to authenticated
  using (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = ride_groups.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

-- Grant hygiene (anon-oracle / #361): revoke blanket, grant only what the
-- actions use. Revoke from `authenticated` too — local Supabase default
-- privileges grant ALL to authenticated at create time, so revoking only
-- public/anon would leave authenticated with UPDATE. No UPDATE grant
-- (ride_groups is create-then-delete only). service_role keeps its default
-- (RLS-bypassing admin role).
revoke all on public.ride_groups from public, anon, authenticated;
grant select, insert, delete on public.ride_groups to authenticated;

-- ---- 1b. Tenancy helper -------------------------------------
-- ride_group_members has no trip_id column, so every child-table policy must
-- resolve the group's trip. A SECURITY DEFINER helper bypasses ride_groups
-- RLS (the way is_trip_member bypasses trip_members RLS), avoiding a double-
-- RLS layer, table coupling, and any policy-eval recursion risk. Created
-- AFTER ride_groups — a `language sql` body is parse-validated at creation.
create or replace function public.ride_group_trip_id(p_ride_group_id uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select trip_id from public.ride_groups where id = p_ride_group_id;
$$;

comment on function public.ride_group_trip_id(uuid) is
  '#581. Resolves a ride group''s trip_id for child-table (ride_group_members) RLS. SECURITY DEFINER so tenancy checks do not double-RLS on ride_groups. Anon-revoked (SECURITY DEFINER anon-oracle lesson).';

-- SECURITY DEFINER function is anon-callable via PostgREST unless revoked
-- (project_security_definer_anon_oracle). Authenticated only.
revoke all on function public.ride_group_trip_id(uuid) from public, anon;
grant execute on function public.ride_group_trip_id(uuid) to authenticated;

-- ---- 2. ride_group_members ----------------------------------
-- trip_member_id ON DELETE CASCADE — removing a member from the trip must not
-- FK-block on their ride memberships; their rows just vanish.
-- written_by ON DELETE SET NULL — if the ADDER leaves the trip, attribution
-- nulls and the row reads as self-joined (never CASCADE — that would delete
-- the RIDER's row when the WRITER leaves).
create table public.ride_group_members (
  ride_group_id uuid not null
    references public.ride_groups(id) on delete cascade,
  trip_member_id uuid not null
    references public.trip_members(id) on delete cascade,
  written_by_trip_member_id uuid
    references public.trip_members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ride_group_id, trip_member_id)
);

comment on table public.ride_group_members is
  '#581. Riders in a ride group. PK(ride_group_id, trip_member_id) = one row per person per ride (also the idempotency guard — re-adding is a 23505). written_by_trip_member_id is PERMANENT provenance: NULL = self-joined (reads plain), set = "added by X" (never cleared, there is no confirm). Opt-out = delete own row. TWO FKs to trip_members — never embed (2nd-FK PostgREST 300 trap); read via the ride_group_manifest view''s plain scalars.';

-- Index the second FK so on-delete-set-null does not seq-scan when a
-- trip_members row is removed. Partial — only added rows carry a value.
create index ride_group_members_written_by_idx
  on public.ride_group_members (written_by_trip_member_id)
  where written_by_trip_member_id is not null;

alter table public.ride_group_members enable row level security;

-- SELECT: any member of the group's trip (v1 visibility is 'everyone';
-- tighten to the group's own visibility when custom audiences ship).
create policy "ride members: trip members read"
  on public.ride_group_members
  for select
  to authenticated
  using (public.is_trip_member(public.ride_group_trip_id(ride_group_id)));

-- INSERT self-join: the caller adds THEMSELVES, with NO attribution.
-- trip_member_id pinned to auth.uid() (a self-join can't name someone else);
-- written_by IS NULL. Without the auth.uid() pin this branch is a
-- forge-any-rider hole (the #574 OR-stacking lesson, R2 F3).
create policy "ride members: self join"
  on public.ride_group_members
  for insert
  to authenticated
  with check (
    written_by_trip_member_id is null
    and trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = public.ride_group_trip_id(ride_group_id)
        and tm.user_id = auth.uid()
    )
  );

-- INSERT on-behalf ("add a rider"): forgery-proof attribution, mirrors
-- #574's "members tag co-travelers". Three load-bearing clauses:
--  (a) writer-binding + tenancy — written_by is the caller's OWN membership
--      in the GROUP's trip (resolved by the definer helper, not an
--      attacker-supplied column). A member of trip A has no membership in
--      trip B → cannot add into a trip-B ride.
--  (b) target tenancy — the target belongs to the GROUP's trip (NOT merely
--      "a trip the caller shares" — is_trip_member_by_member_id would admit
--      a cross-trip target for a dual-trip user, R2 F4).
--  (c) anti-forgery — target <> writer (an add can't masquerade as a self-join).
create policy "ride members: add on behalf"
  on public.ride_group_members
  for insert
  to authenticated
  with check (
    written_by_trip_member_id in (
      select w.id from public.trip_members w
      where w.trip_id = public.ride_group_trip_id(ride_group_id)
        and w.user_id = auth.uid()
    )
    and trip_member_id in (
      select t.id from public.trip_members t
      where t.trip_id = public.ride_group_trip_id(ride_group_id)
    )
    and trip_member_id <> written_by_trip_member_id
  );

-- DELETE (opt-out): a member removes their OWN rider row. That's the whole
-- member lifecycle — there is no confirm/edit. (deleteRideGroup removes the
-- parent + cascades the rest.)
create policy "ride members: leave own row"
  on public.ride_group_members
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = public.ride_group_trip_id(ride_group_id)
        and tm.user_id = auth.uid()
    )
  );

-- Grant hygiene: NO UPDATE granted (written_by is permanent provenance; the
-- absence of an update surface closes the "confirm-UPDATE repoints
-- trip_member_id" class by construction, R2 bonus). Revoke from
-- `authenticated` too (default privileges grant it ALL at create time — see
-- ride_groups above). service_role keeps its default. Re-assert after any
-- local #361 grant-repair.
revoke all on public.ride_group_members from public, anon, authenticated;
grant select, insert, delete on public.ride_group_members to authenticated;

-- ---- 3. ride_group_manifest view ----------------------------
-- Read surface. Exposes trip_member_id + written_by_trip_member_id as PLAIN
-- scalars (NO trip_members embed → no PostgREST 300 ambiguity). security_invoker
-- so the caller's RLS applies. Names resolve app-side via resolveMemberName.
create view public.ride_group_manifest
  with (security_invoker = true)
as
select
  m.ride_group_id,
  m.trip_member_id,
  m.written_by_trip_member_id,
  m.created_at,
  g.trip_id,
  g.airport,
  g.direction,
  g.visibility,
  g.created_by_trip_member_id,
  -- group creation instant — stable ride ordering (rider created_at only
  -- orders WITHIN a ride).
  g.created_at as group_created_at
from public.ride_group_members m
join public.ride_groups g on g.id = m.ride_group_id;

comment on view public.ride_group_manifest is
  '#581 read surface: one row per rider, flattened with its group''s facts (airport, direction, created_by). Plain scalar member ids (NO embed — 2nd-FK PostgREST 300 trap). security_invoker — caller RLS on the base tables applies.';

revoke all on public.ride_group_manifest from public, anon, authenticated, service_role;
grant select on public.ride_group_manifest to authenticated;

-- End of 20260810040000_ride_groups.sql
