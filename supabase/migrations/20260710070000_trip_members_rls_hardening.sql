-- =============================================================
-- 20260710070000_trip_members_rls_hardening.sql
-- #418 — harden trip_members RLS so role/founder/celebrant guards are
-- DB-enforced, not app-only.
--
-- Gap (found in the 2026-07-09 review of the #416 roster PR): the M1
-- trip_members UPDATE/DELETE policies gate WHO may touch a row but not
-- WHAT values they may write. Because the anon key is a public
-- NEXT_PUBLIC_ env var, a client can call PostgREST directly and bypass
-- every server action:
--   * "users can update their own RSVP" had no column constraint → a
--     plain attendee could update({role:'organizer'}) on their own row
--     (self-escalation to organizer).
--   * "organizers can update any trip member" had no WITH CHECK on role
--     and no founder/celebrant protection → a co_organizer could demote
--     the founder, promote anyone (incl. themselves via their own row),
--     or flip is_celebrant.
--   * "organizers can remove members" could delete the founder or
--     celebrant seat.
--
-- This migration moves those invariants into the policy layer, mirroring
-- the app guards in lib/actions/members.ts (#416). Vocabulary:
--   * FOUNDER  = role='organizer' — the single seat minted by
--     create_trip_with_organizer; never assigned through the roster.
--   * co_organizer / attendee = the roster-settable roles.
--   * is_trip_organizer() = FOUNDER *or* co_organizer (the WHO gate).
--   * is_trip_founder()   = FOUNDER only (introduced below).
--
-- CHECK/WITH CHECK constraints apply to WRITES, not existing rows. Prod
-- pre-flight (project bonvqazcqwkrowtkdmuq, 2026-07-11): 7 members / 6
-- trips, distinct (role,is_celebrant) = {(organizer,false) x6,
-- (attendee,false) x1}, exactly 1 founder per trip, 0 co_organizers, 0
-- celebrants, 0 celebrant-founder anomalies. No existing row or app flow
-- is rejected by the new checks.
-- =============================================================

-- ---- helpers -------------------------------------------------
-- is_trip_founder: true only for the ORIGINAL organizer (role='organizer').
-- Distinct from is_trip_organizer(), which also matches co_organizers.
-- SECURITY DEFINER + stable, mirroring the existing helper convention.
create or replace function public.is_trip_founder(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = p_trip_id
      and user_id = auth.uid()
      and role = 'organizer'
  );
$$;

comment on function public.is_trip_founder(uuid) is
  'True if auth.uid() is the FOUNDER (role=''organizer'') of the trip. The founder seat is minted once by create_trip_with_organizer and keeps full roster power; co_organizers do not. Used by trip_members WITH CHECK hardening (#418).';

-- OLD-value accessors. A policy WITH CHECK can only see the NEW row, and
-- Postgres does not expose OLD inside a policy expression. These
-- SECURITY DEFINER lookups return the row's *committed* (pre-UPDATE)
-- value under the statement snapshot, letting a WITH CHECK pin a column
-- to its current value (NEW.col = current_col(id)). Verified locally:
-- the escalation matrix in the PR proves these read OLD, not NEW.
create or replace function public.trip_member_current_role(p_member_id uuid)
returns public.trip_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.trip_members where id = p_member_id;
$$;

comment on function public.trip_member_current_role(uuid) is
  'Committed (pre-UPDATE) role of a trip_members row. Lets a WITH CHECK pin/compare against the current value since policies cannot reference OLD (#418).';

create or replace function public.trip_member_current_is_celebrant(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_celebrant from public.trip_members where id = p_member_id;
$$;

comment on function public.trip_member_current_is_celebrant(uuid) is
  'Committed (pre-UPDATE) is_celebrant of a trip_members row. Pairs with trip_member_current_role for policy-level immutability pins (#418).';

-- ---- trip_members UPDATE/DELETE hardening --------------------
drop policy if exists "users can update their own RSVP"     on public.trip_members;
drop policy if exists "organizers can update any trip member" on public.trip_members;
drop policy if exists "organizers can remove members"       on public.trip_members;

-- (1) Self-update: a member may edit their OWN row (rsvp_status,
-- display_name, …) but role and is_celebrant are pinned to their current
-- values — no self-escalation to organizer, no self-anointing as
-- celebrant. The subquery accessors read the OLD value.
create policy "users can update their own RSVP"
  on public.trip_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and role = public.trip_member_current_role(id)
    and is_celebrant = public.trip_member_current_is_celebrant(id)
  );

-- (2) Organizer-update: WHO gate stays is_trip_organizer(). The FOUNDER
-- keeps full power. A NON-founder organizer (co_organizer) is
-- constrained:
--   (a) assignable role ∈ {attendee, co_organizer} — never 'organizer';
--   (b) may not mutate the FOUNDER row (current role='organizer');
--   (c) may not mutate a CELEBRANT row, nor flip is_celebrant either way.
-- Constraints (b)/(c) compare against the committed (OLD) values via the
-- accessor helpers. Multiple permissive UPDATE policies OR together, so a
-- co_organizer editing their OWN row still cannot escalate: neither this
-- policy (role∉set) nor the self-policy (role pinned) admits it.
create policy "organizers can update any trip member"
  on public.trip_members for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (
    public.is_trip_organizer(trip_id)
    and (
      public.is_trip_founder(trip_id)
      or (
        role in ('attendee', 'co_organizer')
        and public.trip_member_current_role(id) <> 'organizer'
        and coalesce(public.trip_member_current_is_celebrant(id), false) = false
        and is_celebrant = public.trip_member_current_is_celebrant(id)
      )
    )
  );

-- (3) Removal: the FOUNDER seat (role='organizer') and any CELEBRANT seat
-- are undeletable by anyone via RLS — the smallest safe move, mirroring
-- the app's member_organizer_locked / member_remove_celebrant guards.
-- Organizers may still remove ordinary members; a normal member may still
-- self-leave. (Removing a founder/celebrant is an admin/service-role op.)
-- Expense-ties and self-removal remain app-layer guards (rule 9 / UX
-- copy); they aren't privilege-escalation vectors so they stay out of RLS.
create policy "organizers can remove members"
  on public.trip_members for delete
  to authenticated
  using (
    (public.is_trip_organizer(trip_id) or auth.uid() = user_id)
    and role <> 'organizer'
    and is_celebrant = false
  );

-- (4) SELECT / declined-RSVP redaction — DECISION: unchanged here.
-- The base-table SELECT stays "any trip member can read the roster"; the
-- declined-status redaction remains enforced by the security_invoker view
-- public.trip_members_visible_rsvp, which every app read path already uses
-- (lib/db/rsvp.ts). RLS is row-level, not column-level, so there is no
-- clean policy-level redaction of a single column without breaking the
-- view or membership reads. This migration hardens WRITES (the actual
-- privilege-escalation surface in #418); the declined-column read
-- redaction is tracked as view-enforced and is out of scope here.

-- =============================================================
-- End of 20260710070000_trip_members_rls_hardening.sql
-- =============================================================
