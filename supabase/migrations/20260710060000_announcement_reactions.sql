-- =============================================================
-- 20260710060000_announcement_reactions.sql
-- #389 — the ack loop: fixed-set reactions on announcements.
--
-- Depends on:
--   * 0001_init.sql                      — trips, trip_members, announcements
--   * 20260519123255_m1_foundation.sql   — trip_visibility enum,
--     can_see_content(), is_trip_celebrant(), announcements.visibility
--   * 20260520052357_m3_itinerary_announcements.sql — announcements RLS
--     rewritten visibility-aware (the SELECT policy this table inherits)
--
-- Design decisions (recorded here per house rule):
--
-- RULE-7 EXCEPTION — visibility is INHERITED, not a column.
--   Every user-content table normally ships its own
--   `visibility trip_visibility` column. A reaction is deliberately the
--   exception: it is an *ack on the parent announcement*, so its audience
--   is definitionally the parent's audience. A per-reaction visibility
--   axis would let a reaction outlive or out-broadcast the thing it
--   reacts to (e.g. a celebrant-visible reaction pointing at a
--   hide_from_celebrant announcement — a leak). Every policy below
--   therefore routes through can_see_content(parent.trip_id,
--   parent.visibility): if you can't see the announcement, its reactions
--   are invisible AND un-writable for you.
--
-- RULE-9 EXCEPTION — natural-key idempotency, no idempotency_key column.
--   Mutation-heavy tables normally carry `idempotency_key uuid` + a
--   partial unique index. Reactions follow the itinerary_item_member_flags
--   precedent instead: the natural key
--   unique (announcement_id, trip_member_id, emoji) IS the idempotency
--   guarantee. The action sets a *desired end state* (react / unreact),
--   so a drunk-double-tap replay is a no-op: duplicate insert hits 23505
--   (treated as success), duplicate delete deletes 0 rows (also success).
--
-- FK convention: attendee identity via trip_member_id (M1 foundation).
--   trip_id is denormalized (same as travel_legs) so scoping and the
--   cross-trip-injection guard don't need a join through announcements
--   for the own-row check.
-- =============================================================

create table public.announcement_reactions (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  -- Denormalized for RLS/scoping (travel_legs precedent). The INSERT
  -- policy pins it to the parent announcement's trip_id so it cannot lie.
  trip_id         uuid not null references public.trips(id) on delete cascade,
  trip_member_id  uuid not null references public.trip_members(id) on delete cascade,
  -- Fixed set, hard cap 6 — reaction inflation is hard-banned
  -- (CLAUDE.md / killed-and-deferred.md). Mirrored in ONE app-side
  -- config constant: REACTION_EMOJI in lib/reactions/constants.ts.
  -- Change there = change here (new migration), never one without the
  -- other.
  emoji           text not null check (emoji in ('👍', '❤️', '😂', '🔥', '🫡', '🍻')),
  created_at      timestamptz not null default now(),
  -- Natural key = idempotency (rule-9 exception, see header).
  unique (announcement_id, trip_member_id, emoji)
);

create index announcement_reactions_announcement_idx
  on public.announcement_reactions(announcement_id);

create index announcement_reactions_trip_idx
  on public.announcement_reactions(trip_id);

comment on table public.announcement_reactions is
  'Fixed-set emoji acks on announcements (#389). Visibility is INHERITED from the parent announcement (rule-7 exception — see migration header): all policies route through can_see_content(parent.trip_id, parent.visibility). Idempotency via the natural key (announcement_id, trip_member_id, emoji) — rule-9 exception, item_flags precedent. Aggregate-only in UI: no per-name reaction lists.';

comment on column public.announcement_reactions.emoji is
  'One of the fixed 6 (CHECK constrained). Mirrored in REACTION_EMOJI (lib/reactions/constants.ts) — keep in lockstep.';

comment on column public.announcement_reactions.trip_id is
  'Denormalized from the parent announcement for scoping; INSERT policy enforces it matches announcements.trip_id.';

-- =============================================================
-- RLS — same migration as the table, per house rule.
--
-- Every policy requires the parent announcement to pass
-- can_see_content() for the caller: a reaction on a
-- hide_from_celebrant announcement is invisible AND un-writable for
-- the celebrant; organizers_only announcements likewise scope their
-- reactions to organizers. The subquery on public.announcements also
-- runs under the announcements SELECT policy (defense-in-depth — the
-- explicit can_see_content() call keeps the intent readable and does
-- not rely on that behavior).
--
-- Writes are own-row only: trip_member_id must map to the caller's own
-- membership row for the reaction's trip (travel_legs pattern).
-- No UPDATE policy — a reaction toggles via insert/delete only.
-- =============================================================

alter table public.announcement_reactions enable row level security;

create policy "reactions: members read via parent visibility"
  on public.announcement_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = announcement_reactions.announcement_id
        and a.trip_id = announcement_reactions.trip_id
        and public.can_see_content(a.trip_id, a.visibility)
    )
  );

create policy "reactions: owner insert via parent visibility"
  on public.announcement_reactions
  for insert
  to authenticated
  with check (
    -- Own-row scoping: the caller reacts as themselves, in this trip.
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = announcement_reactions.trip_id
        and tm.user_id = auth.uid()
    )
    -- Parent must exist in the SAME trip (pins the denormalized trip_id)
    -- and be visible to the caller.
    and exists (
      select 1
      from public.announcements a
      where a.id = announcement_reactions.announcement_id
        and a.trip_id = announcement_reactions.trip_id
        and public.can_see_content(a.trip_id, a.visibility)
    )
  );

create policy "reactions: owner delete via parent visibility"
  on public.announcement_reactions
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = announcement_reactions.trip_id
        and tm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.announcements a
      where a.id = announcement_reactions.announcement_id
        and a.trip_id = announcement_reactions.trip_id
        and public.can_see_content(a.trip_id, a.visibility)
    )
  );

-- =============================================================
-- End of 20260710060000_announcement_reactions.sql
-- =============================================================
