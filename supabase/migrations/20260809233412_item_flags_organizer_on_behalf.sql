-- =============================================================
-- #171 — organizer-write-on-behalf for itinerary_item_member_flags
-- =============================================================
-- What: lets an organizer transcribe a participation flag a member
-- volunteered out-of-band (the "Marcus DM'd his shellfish allergy in
-- March, Dave has no path to bank it" case), WITH explicit attribution
-- and a member-side confirm/remove path. Recording, not assuming — see
-- the persona-edge-attendees master principle (lines 11-18) and the
-- 2026-05-20 sim synthesis ("M5+ on scope, principle holds with
-- attribution", findings.md:55).
--
-- Three preserve-conditions ship together (issue #171 forbids splitting):
--   1. attribution column (this migration)
--   2. additive organizer INSERT policy (this migration)
--   3. member-confirm UI surface (the accompanying app PR) — backed by
--      the owner-confirm UPDATE policy added here.
--
-- Mostly additive: two NEW policies (on-behalf INSERT, owner-confirm
-- UPDATE) plus a TIGHTENING of the M3 owner-insert policy. The M3
-- owner-delete and the M3 organizer-read + M4 owner-reads-own SELECT
-- policies are UNCHANGED.
--
-- Why owner-insert must be tightened (security review, 2026-08-09): RLS
-- INSERT policies OR together, so the anti-forgery guard in the on-behalf
-- policy is worthless while the OLDER owner-insert policy — which predates
-- this column and constrains only trip_member_id — offers an unconstrained
-- alternate path to set written_by. Without the fix a MEMBER could insert
-- their OWN flag with written_by = an organizer's id, fabricating "an
-- organizer transcribed this" on their own row. The invariant "only the
-- on-behalf path may set written_by" is caller-dependent, so it can't be a
-- CHECK constraint; it must live in the self-insert policy as
-- `written_by_trip_member_id is null`. This is a NARROWING (still not a
-- widening — issue anti-pattern #1 holds: the on-behalf case remains its
-- own separate, independently-revocable policy).
-- =============================================================

-- ---- 1. Attribution column ----------------------------------
-- FK → trip_members(id), NOT auth.users(id): follows the M1 FK-retargeting
-- convention (database-workflow.md:256-271) and matches the existing
-- trip_member_id column shape on this table. Nullable: pre-migration rows
-- and normal self-written rows carry NULL; only an organizer-on-behalf
-- INSERT sets it (to the organizer's own trip_member_id).
alter table public.itinerary_item_member_flags
  add column written_by_trip_member_id uuid
    references public.trip_members(id) on delete set null;

comment on column public.itinerary_item_member_flags.written_by_trip_member_id is
  '#171. NULL for self-written rows (the default). Set to the ORGANIZER''s own trip_member_id when an organizer transcribes a flag on a member''s behalf. Detection of an unconfirmed on-behalf row: written_by_trip_member_id is not null AND <> trip_member_id. The member''s confirm (clears this to NULL) or remove (DELETE) is the consent path. FK is `on delete set null`: if the transcribing organizer''s membership is deleted, attribution nulls and the row reads as self-owned — the least-bad option (cascade would delete the member''s data; restrict would block organizer removal).';

-- Index the attribution FK: the app never looks rows UP by writer (it
-- detects on-behalf rows within an already-item-scoped result), but this
-- keeps the FK off a seq-scan of the flags table when a trip_members row
-- is deleted and `on delete set null` fires. Partial — only on-behalf rows
-- carry a non-NULL value.
create index item_member_flags_written_by_idx
  on public.itinerary_item_member_flags (written_by_trip_member_id)
  where written_by_trip_member_id is not null;

-- ---- 2. TIGHTEN the M3 owner-insert policy -----------------
-- Recreate it verbatim + one added clause: a self-insert may NOT carry
-- attribution. This closes the OR-stacking hole (security review): it is
-- what makes "written_by is trustworthy provenance" a TABLE-WIDE
-- guarantee rather than a policy-local one. Self path = written_by NULL;
-- the ONLY path that may set written_by is the on-behalf policy below.
drop policy "item flags: owner insert" on public.itinerary_item_member_flags;

create policy "item flags: owner insert"
  on public.itinerary_item_member_flags
  for insert
  to authenticated
  with check (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = itinerary_item_member_flags.item_id
        and tm.user_id = auth.uid()
    )
    and written_by_trip_member_id is null
  );

comment on policy "item flags: owner insert" on public.itinerary_item_member_flags is
  'M3 self-insert, tightened by #171: a member inserts their OWN flag AND must leave written_by_trip_member_id NULL. The null clause closes the RLS OR-stacking hole — it stops a member forging organizer attribution on their own row via this path. Only "item flags: organizer insert on behalf" may set written_by.';

-- ---- 3. Additive organizer INSERT-on-behalf policy ----------
-- Four load-bearing clauses:
--   (a) caller is an organizer of the item's trip;
--   (b) TENANCY (rule #6) — the target member belongs to the item's trip
--       (an organizer of trip A cannot forge a row for a member of trip B);
--   (c) WRITER BINDING — written_by is the caller's OWN membership in this
--       trip, so an organizer cannot ghost-write under another organizer's
--       name either;
--   (d) ANTI-FORGERY — trip_member_id <> written_by_trip_member_id, so an
--       organizer can never insert a row that claims the member wrote it
--       themselves (forged self-attribution).
-- Together with the tightened owner-insert above (self path forces
-- written_by NULL), these two policies are the TABLE-WIDE guarantee that
-- on-behalf attribution cannot be faked from EITHER direction — no member
-- can fake organizer authorship, no organizer can fake member authorship.
create policy "item flags: organizer insert on behalf"
  on public.itinerary_item_member_flags
  for insert
  to authenticated
  with check (
    public.is_trip_organizer(
      (select ii.trip_id from public.itinerary_items ii where ii.id = item_id)
    )
    and trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = item_id
    )
    and written_by_trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = item_id
        and tm.user_id = auth.uid()
    )
    and trip_member_id <> written_by_trip_member_id
  );

comment on policy "item flags: organizer insert on behalf" on public.itinerary_item_member_flags is
  '#171. Additive to the M3 owner-insert policy (stacks via OR). Lets an organizer transcribe a flag on a member''s behalf with forgery-proof attribution: written_by must be the caller''s own membership in the trip, target must be a member of the same trip, and target <> writer.';

-- ---- 4. Additive owner-confirm UPDATE policy ----------------
-- The [Keep] half of the member-confirm affordance: the owning member
-- accepts an organizer-transcribed row by clearing its attribution,
-- converting it into a normal self-owned row (the member's own action is
-- what makes it authoritative — the strictest reading of "opt into
-- participation"). [Remove] is a DELETE the owner already holds (M3).
--
-- UPDATE needs a SELECT policy to see the row first (M4 owner-reads-own
-- provides it) and BOTH using + with check (Supabase RLS checklist). The
-- with-check pins the only permitted post-state to NULL attribution, so a
-- member can neither forge attribution onto their own row nor reassign it.
create policy "item flags: owner confirms on-behalf row"
  on public.itinerary_item_member_flags
  for update
  to authenticated
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = item_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      join public.itinerary_items ii on ii.trip_id = tm.trip_id
      where ii.id = item_id
        and tm.user_id = auth.uid()
    )
    and written_by_trip_member_id is null
  );

comment on policy "item flags: owner confirms on-behalf row" on public.itinerary_item_member_flags is
  '#171. The member-confirm [Keep] path: the owning member may UPDATE their own flag row only to clear written_by_trip_member_id (with-check pins the post-state to NULL). Cannot forge or reassign attribution. [Remove] is the existing M3 owner-delete.';

-- End of 20260809233412_item_flags_organizer_on_behalf.sql
