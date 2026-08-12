-- =============================================================
-- 20260811020000_shopping_social.sql
-- Shopping list PR2 — SOCIAL layer: reactions + notes thread.
--
-- Depends on:
--   * 20260811010000_shopping_list.sql — shopping_list_items (parent),
--     its can_see_content(trip_id, visibility) gate, is_trip_organizer.
--   * 20260710060000_announcement_reactions.sql — the RLS EXISTS shape
--     this migration clones (child-RLS trip_id pin, no-UPDATE
--     immutability). CAVEAT vs that template: it shipped with NO
--     explicit grants; this migration adds them (spec §12.3, #361
--     hygiene) — grants are NOT optional here.
--
-- Design decisions (recorded here per house rule):
--
-- Child-RLS trip_id PIN — every EXISTS below pins BOTH
--   i.id = <child>.item_id AND i.trip_id = <child>.trip_id. Dropping the
--   trip_id pin would let a dual-trip member insert a child row whose
--   trip_id does not match its parent item's trip_id (cross-trip
--   injection). This mirrors the announcement_reactions precedent.
--
-- NO UPDATE POLICY on either table — reactions toggle via insert/delete
--   only; comments are immutable once posted. The ABSENCE of a
--   permissive UPDATE policy is itself the load-bearing immutability
--   guarantee: RLS default-denies, so even if a future #361-style
--   blanket grant-repair re-grants UPDATE at the table-privilege level,
--   there is still no policy that would authorize a row to be touched.
--   (Mirrors the ride_group_members R2 note.)
--
-- Reactions: natural-key idempotency, NO idempotency_key column (rule-9
--   exception, item_flags/announcement_reactions precedent) — unique
--   (item_id, trip_member_id, emoji) IS the idempotency guarantee.
--
-- Comments: DO carry idempotency_key + a partial unique index, since a
--   comment is free text (no natural key to dedupe on).
--
-- Grants (spec §12.3 — REQUIRED, unlike the announcement_reactions
--   precedent which had none): revoke all from public/anon/authenticated,
--   then grant only select/insert/delete to authenticated. No UPDATE
--   grant — there is no UPDATE path on either table.
-- =============================================================

create table public.shopping_item_reactions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.shopping_list_items(id) on delete cascade,
  -- Denormalized for RLS/scoping (announcement_reactions precedent). The
  -- INSERT policy pins it to the parent item's trip_id so it cannot lie.
  trip_id        uuid not null references public.trips(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  -- Fixed set, hard cap 6 — reaction inflation is hard-banned
  -- (CLAUDE.md / killed-and-deferred.md). Mirrored in ONE app-side
  -- config constant: SHOPPING_REACTION_EMOJI in
  -- lib/reactions/shopping-constants.ts. Change there = change here
  -- (new migration), never one without the other.
  emoji          text not null check (emoji in ('👍', '👎', '❤️', '🔥', '😂', '🍻')),
  created_at     timestamptz not null default now(),
  -- Natural key = idempotency (rule-9 exception, see header).
  unique (item_id, trip_member_id, emoji)
);

create index shopping_item_reactions_item_idx
  on public.shopping_item_reactions(item_id);

create index shopping_item_reactions_trip_idx
  on public.shopping_item_reactions(trip_id);

comment on table public.shopping_item_reactions is
  'Fixed-set emoji reactions on shopping list items. Visibility inherited from the parent item via can_see_content(parent.trip_id, parent.visibility). Idempotency via the natural key (item_id, trip_member_id, emoji) — rule-9 exception. No UPDATE policy — toggles via insert/delete only. Aggregate-only in UI: summarizeItemReactions drops trip_member_id before reaching a client component.';

comment on column public.shopping_item_reactions.emoji is
  'One of the fixed 6 (CHECK constrained). Mirrored in SHOPPING_REACTION_EMOJI (lib/reactions/shopping-constants.ts) — keep in lockstep.';

comment on column public.shopping_item_reactions.trip_id is
  'Denormalized from the parent item for scoping; INSERT policy enforces it matches shopping_list_items.trip_id (child-RLS trip_id pin).';

create table public.shopping_item_comments (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references public.shopping_list_items(id) on delete cascade,
  trip_id               uuid not null references public.trips(id) on delete cascade,
  -- ON DELETE SET NULL (not cascade): a departed member's notes stay in
  -- the thread as orphaned/organizer-delete-only rows (author fallback
  -- resolves to "Someone" app-side) rather than vanishing.
  author_trip_member_id uuid references public.trip_members(id) on delete set null,
  body                  text not null,
  idempotency_key       uuid,
  created_at            timestamptz not null default now(),
  constraint shopping_item_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint shopping_item_comments_body_len       check (length(body) <= 500)
);

create unique index shopping_item_comments_idempotency
  on public.shopping_item_comments (item_id, author_trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index shopping_item_comments_item_idx
  on public.shopping_item_comments(item_id);

create index shopping_item_comments_trip_idx
  on public.shopping_item_comments(trip_id);

comment on table public.shopping_item_comments is
  'Flat notes thread on shopping list items. Visibility inherited from the parent item via can_see_content(parent.trip_id, parent.visibility). Immutable once posted — no UPDATE policy (absence is the load-bearing guarantee, survives a #361 blanket grant-repair). Delete: author or organizer. Author fallback is "Someone" (announcements_author_fallback), resolved app-side — never .email.';

comment on column public.shopping_item_comments.trip_id is
  'Denormalized from the parent item for scoping; INSERT policy enforces it matches shopping_list_items.trip_id (child-RLS trip_id pin).';

comment on column public.shopping_item_comments.author_trip_member_id is
  'ON DELETE SET NULL — a departed author leaves the comment in place, orphaned (organizer-delete-only after that; app resolves display name to "Someone").';

-- =============================================================
-- RLS — same migration as the tables, per house rule.
--
-- Every policy requires the parent shopping_list_items row to pass
-- can_see_content() for the caller AND pins the denormalized trip_id to
-- the parent's trip_id: a reaction/comment on a hide_from_celebrant item
-- is invisible AND un-writable for the celebrant, and a dual-trip member
-- cannot insert a child row whose trip_id disagrees with its parent's.
--
-- Writes are own-row/own-seat only on INSERT and (for reactions) DELETE;
-- comment DELETE additionally allows the trip organizer. No UPDATE
-- policy on either table (see header note — load-bearing immutability).
-- =============================================================

alter table public.shopping_item_reactions enable row level security;

create policy "shopping_item_reactions: members read via parent visibility"
  on public.shopping_item_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shopping_list_items i
      where i.id = shopping_item_reactions.item_id
        and i.trip_id = shopping_item_reactions.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "shopping_item_reactions: owner insert via parent visibility"
  on public.shopping_item_reactions
  for insert
  to authenticated
  with check (
    -- Own-row scoping: the caller reacts as themselves, in this trip.
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = shopping_item_reactions.trip_id
        and tm.user_id = auth.uid()
    )
    -- Parent must exist in the SAME trip (pins the denormalized trip_id)
    -- and be visible to the caller.
    and exists (
      select 1
      from public.shopping_list_items i
      where i.id = shopping_item_reactions.item_id
        and i.trip_id = shopping_item_reactions.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "shopping_item_reactions: owner delete"
  on public.shopping_item_reactions
  for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = shopping_item_reactions.trip_id
        and tm.user_id = auth.uid()
    )
  );

alter table public.shopping_item_comments enable row level security;

create policy "shopping_item_comments: members read via parent visibility"
  on public.shopping_item_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shopping_list_items i
      where i.id = shopping_item_comments.item_id
        and i.trip_id = shopping_item_comments.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "shopping_item_comments: author insert via parent visibility"
  on public.shopping_item_comments
  for insert
  to authenticated
  with check (
    author_trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = shopping_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.shopping_list_items i
      where i.id = shopping_item_comments.item_id
        and i.trip_id = shopping_item_comments.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "shopping_item_comments: author or organizer delete"
  on public.shopping_item_comments
  for delete
  to authenticated
  using (
    author_trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = shopping_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

-- =============================================================
-- Grants (spec §12.3 — REQUIRED; the announcement_reactions precedent
-- had none). #361: a clean `db reset` leaves anon/authenticated with no
-- DML on public tables by default — explicit grants are load-bearing,
-- not redundant. No UPDATE grant on either table — there is no UPDATE
-- path (see the no-UPDATE-policy note above).
-- =============================================================

revoke all on public.shopping_item_reactions from public, anon, authenticated;
grant select, insert, delete on public.shopping_item_reactions to authenticated;

revoke all on public.shopping_item_comments from public, anon, authenticated;
grant select, insert, delete on public.shopping_item_comments to authenticated;

-- =============================================================
-- End of 20260811020000_shopping_social.sql
-- =============================================================
