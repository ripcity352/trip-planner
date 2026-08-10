-- =============================================================
-- #550 — organizer-write-on-behalf for trip_member_days (day chips)
-- =============================================================
-- What: lets an organizer set a member's day-availability chips when the
-- member volunteered their dates out-of-band ("Rob texted me his dates,
-- let me set them"), WITH explicit attribution and a member-side
-- keep/remove path. Recording, not assuming — the persona-edge-attendees
-- master principle, generalized from #171 (itinerary_item_member_flags)
-- to a second table.
--
-- ⚠️ Load-bearing (security review, mirrors the #171 OR-stacking finding,
-- but WORSE here): trip_member_days already carries a DORMANT policy
-- "organizers write any days for their trip" (M1 migration
-- 20260519123255, ~line 720) — organizers can INSERT/UPDATE/**DELETE**
-- any member's day rows today, with NO attribution and NO anti-forgery.
-- That is the same permissive-older-policy-defeats-attribution class the
-- #171 review caught, but it is `FOR ALL` and includes DELETE. Adding an
-- attribution policy beside it is worthless: an organizer could still
-- write days with no attribution (silent uncounting → the rule #8
-- violation this issue exists to prevent). So this migration REPLACES,
-- it does not merely add:
--   1. DROP the dormant FOR ALL policy.
--   2. attribution column + partial index (mirror #171).
--   3. TIGHTEN member self-write to leave written_by NULL (closes the
--      OR-stacking forge-attribution hole from the member direction).
--   4. Organizer INSERT + UPDATE on-behalf policies (NO DELETE), with the
--      #171 four-clause anti-forgery shape.
--
-- No app consumer of the dropped FOR ALL exists (verified 2026-08-10):
-- the only writer, lib/actions/trip-member-days.ts:setMemberDayAction,
-- resolves trip_member_id from its own auth.uid() and rides the "members
-- write own days" policy; DayHeadcount / DayHeadcountList are read-only.
-- =============================================================

-- ---- 1. DROP the dormant, attribution-free FOR ALL grant -----
-- This is the crux. Once gone, NO path writes another member's days
-- without attribution — the organizer's only route is the on-behalf
-- policies below, all of which force written_by = the caller's own
-- membership.
drop policy "organizers write any days for their trip" on public.trip_member_days;

-- ---- 2. Attribution column ----------------------------------
-- FK → trip_members(id), NOT auth.users(id): follows the M1 FK-retargeting
-- convention and matches trip_member_id's shape. Nullable: pre-migration
-- rows and normal self-written rows carry NULL; only an organizer
-- on-behalf write sets it (to the organizer's own trip_member_id).
alter table public.trip_member_days
  add column written_by_trip_member_id uuid
    references public.trip_members(id) on delete set null;

comment on column public.trip_member_days.written_by_trip_member_id is
  '#550. NULL for self-written rows (the default). Set to the ORGANIZER''s own trip_member_id when an organizer sets a day on a member''s behalf. Detection of an unconfirmed on-behalf row: written_by_trip_member_id is not null AND <> trip_member_id. The member''s keep (re-tap / clears this to NULL) or remove (DELETE) is the consent path. FK is `on delete set null`: if the writing organizer''s membership is deleted, attribution nulls and the row reads as self-owned — the least-bad option (cascade would delete the member''s day data; restrict would block organizer removal).';

-- Index the attribution FK: the app never looks rows UP by writer (it
-- detects on-behalf rows within an already-member-scoped result), but this
-- keeps the FK off a seq-scan of the days table when a trip_members row is
-- deleted and `on delete set null` fires. Partial — only on-behalf rows
-- carry a non-NULL value.
create index trip_member_days_written_by_idx
  on public.trip_member_days (written_by_trip_member_id)
  where written_by_trip_member_id is not null;

-- ---- 3. TIGHTEN the member self-write policy ----------------
-- Recreate "members write own days" verbatim + one added WITH CHECK
-- clause: a member's own INSERT/UPDATE may NOT carry attribution
-- (written_by must be NULL). This closes the OR-stacking hole from the
-- member direction — it stops a member forging organizer attribution on
-- their own row via the self path. It ALSO makes the member's own chip
-- re-tap the [Keep] confirm: writing their own day clears any prior
-- organizer attribution (the app sets written_by = null on the self
-- path). WITH CHECK governs INSERT/UPDATE only, so DELETE ([Remove]) and
-- SELECT are unaffected — the member can still remove an on-behalf row.
drop policy "members write own days" on public.trip_member_days;

create policy "members write own days"
  on public.trip_member_days for all
  to authenticated
  using (public.is_trip_member_by_member_id(trip_member_id)
         and exists (
           select 1 from public.trip_members tm
           where tm.id = trip_member_id and tm.user_id = auth.uid()
         ))
  with check (public.is_trip_member_by_member_id(trip_member_id)
              and exists (
                select 1 from public.trip_members tm
                where tm.id = trip_member_id and tm.user_id = auth.uid()
              )
              and written_by_trip_member_id is null);

comment on policy "members write own days" on public.trip_member_days is
  'M1 self-write, tightened by #550: a member writes their OWN day row AND must leave written_by_trip_member_id NULL. The null clause closes the RLS OR-stacking hole (stops a member forging organizer attribution on their own row) and doubles as the [Keep] confirm (a self write clears prior organizer attribution). Only "organizers set days on behalf" may set written_by. DELETE/SELECT unaffected (WITH CHECK governs INSERT/UPDATE only), so [Remove] still works.';

-- ---- 4a. Additive organizer INSERT-on-behalf policy ---------
-- Four load-bearing clauses (mirror #171):
--   (a) caller is an organizer of the day's trip;
--   (b) WRITER BINDING — written_by is the caller's OWN membership in that
--       same trip (so an organizer cannot ghost-write under another
--       organizer's name, and TENANCY [rule #6] is enforced: an organizer
--       of trip A has no membership in trip B, so cannot write for B);
--   (c) ANTI-FORGERY — trip_member_id <> written_by_trip_member_id, so an
--       organizer can never write a row that claims the member set it
--       themselves (forged self-attribution).
-- Together with the tightened self-write above (self path forces
-- written_by NULL), these are the TABLE-WIDE guarantee that on-behalf
-- attribution cannot be faked from EITHER direction.
create policy "organizers insert days on behalf"
  on public.trip_member_days for insert
  to authenticated
  with check (
    public.is_trip_organizer(
      (select tm.trip_id from public.trip_members tm where tm.id = trip_member_id)
    )
    and written_by_trip_member_id in (
      select w.id
      from public.trip_members w
      where w.trip_id = (
              select tm.trip_id from public.trip_members tm where tm.id = trip_member_id
            )
        and w.user_id = auth.uid()
    )
    and trip_member_id <> written_by_trip_member_id
  );

comment on policy "organizers insert days on behalf" on public.trip_member_days is
  '#550. Additive to "members write own days" (stacks via OR). Lets an organizer set a day on a member''s behalf with forgery-proof attribution: written_by must be the caller''s own membership in the day''s trip, and target <> writer. INSERT only — the UPDATE half is a separate policy so the upsert conflict path works; there is deliberately NO organizer DELETE (the dropped FOR ALL had it; setting a date on someone''s behalf must not let an organizer erase the member''s own prior entries).';

-- ---- 4b. Additive organizer UPDATE-on-behalf policy ---------
-- The upsert conflict path (INSERT ... ON CONFLICT DO UPDATE) needs an
-- UPDATE policy too. USING lets the organizer target any row in their
-- trip; WITH CHECK pins the post-state to the same attribution binding as
-- the INSERT policy, so an organizer UPDATE can only ever land an
-- attributed, non-forged row. Still NO DELETE.
create policy "organizers update days on behalf"
  on public.trip_member_days for update
  to authenticated
  using (
    public.is_trip_organizer(
      (select tm.trip_id from public.trip_members tm where tm.id = trip_member_id)
    )
  )
  with check (
    public.is_trip_organizer(
      (select tm.trip_id from public.trip_members tm where tm.id = trip_member_id)
    )
    and written_by_trip_member_id in (
      select w.id
      from public.trip_members w
      where w.trip_id = (
              select tm.trip_id from public.trip_members tm where tm.id = trip_member_id
            )
        and w.user_id = auth.uid()
    )
    and trip_member_id <> written_by_trip_member_id
  );

comment on policy "organizers update days on behalf" on public.trip_member_days is
  '#550. The UPDATE half of the organizer on-behalf upsert (INSERT ... ON CONFLICT DO UPDATE needs both). USING targets any row in the organizer''s trip; WITH CHECK pins the post-state to attributed + non-forged (written_by = caller''s own membership, target <> writer), identical to the INSERT policy. No organizer DELETE policy exists — organizer day-erasure is deliberately not granted.';

-- End of 20260810010000_member_days_organizer_on_behalf.sql
