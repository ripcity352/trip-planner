-- =============================================================
-- 20260813010000_poll_comments.sql
-- #620 (part 1/3 of #616) — flat comment thread on polls.
--
-- Depends on:
--   * 20260710060100_polls.sql — polls (parent), its own
--     can_see_content(trip_id, visibility) gate, is_trip_organizer.
--   * 20260811020000_shopping_social.sql — the RLS/grants shape this
--     migration clones (child-RLS trip_id pin, no-UPDATE immutability,
--     author-or-organizer delete). Structural change from that
--     precedent: the parent is `polls` (not `shopping_list_items`), and
--     visibility routes through the POLL's OWN can_see_content(trip_id,
--     visibility) — polls carry visibility directly on the row (like
--     shopping_list_items does), so the EXISTS shape is identical.
--
-- Scope: ONE flat thread per poll, no nesting/replies. Comments are
-- immutable once posted — no UPDATE policy (absence is the load-bearing
-- guarantee — see the note below).
--
-- NO UPDATE POLICY — comments are immutable once posted. The ABSENCE of
--   a permissive UPDATE policy is itself the load-bearing immutability
--   guarantee: RLS default-denies, so even if a future #361-style
--   blanket grant-repair re-grants UPDATE at the table-privilege level,
--   there is still no policy that would authorize a row to be touched
--   (mirrors shopping_item_comments / ride_group_members R2).
--
-- Grants (REQUIRED, #361 hygiene): revoke all from public/anon/
--   authenticated, then grant only select/insert/delete to
--   authenticated. No UPDATE grant — there is no UPDATE path.
-- =============================================================

create table public.poll_comments (
  id                    uuid primary key default gen_random_uuid(),
  poll_id               uuid not null references public.polls(id) on delete cascade,
  -- Denormalized for RLS/scoping (shopping_item_comments precedent). The
  -- INSERT policy pins it to the parent poll's trip_id so it cannot lie.
  trip_id               uuid not null references public.trips(id) on delete cascade,
  -- ON DELETE SET NULL (not cascade): a departed member's comment stays
  -- in the thread as an orphaned/organizer-delete-only row (author
  -- fallback resolves to "Someone" app-side) rather than vanishing.
  author_trip_member_id uuid references public.trip_members(id) on delete set null,
  body                  text not null,
  idempotency_key       uuid,
  created_at            timestamptz not null default now(),
  constraint poll_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint poll_comments_body_len       check (length(body) <= 500)
);

create unique index poll_comments_idempotency
  on public.poll_comments (poll_id, author_trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index poll_comments_poll_idx on public.poll_comments(poll_id);
create index poll_comments_trip_idx on public.poll_comments(trip_id);

comment on table public.poll_comments is
  'Flat comment thread on polls (#620). Visibility inherited from the parent poll via can_see_content(poll.trip_id, poll.visibility). Immutable once posted — no UPDATE policy (absence is the load-bearing guarantee, survives a #361 blanket grant-repair). Delete: author or organizer. Author fallback is "Someone" (announcements_author_fallback), resolved app-side — never .email.';

comment on column public.poll_comments.trip_id is
  'Denormalized from the parent poll for scoping; INSERT policy enforces it matches polls.trip_id (child-RLS trip_id pin).';

comment on column public.poll_comments.author_trip_member_id is
  'ON DELETE SET NULL — a departed author leaves the comment in place, orphaned (organizer-delete-only after that; app resolves display name to "Someone").';

-- =============================================================
-- RLS — same migration as the table, per house rule.
--
-- Every policy requires the parent poll row to pass can_see_content()
-- for the caller AND pins the denormalized trip_id to the parent's
-- trip_id: a comment on a hide_from_celebrant poll is invisible AND
-- un-writable for the celebrant, and a dual-trip member cannot insert a
-- child row whose trip_id disagrees with its parent's.
--
-- INSERT binds author_trip_member_id to the caller's OWN trip_members
-- row (H1 anti-spoofing pattern, mirrors votes/shopping comments) —
-- a member can only post as themselves, on a poll they can see. DELETE
-- allows the author or an organizer. No UPDATE policy.
-- =============================================================

alter table public.poll_comments enable row level security;

create policy "poll_comments: members read via parent visibility"
  on public.poll_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.polls p
      where p.id = poll_comments.poll_id
        and p.trip_id = poll_comments.trip_id
        and public.can_see_content(p.trip_id, p.visibility)
    )
  );

create policy "poll_comments: author insert via parent visibility"
  on public.poll_comments
  for insert
  to authenticated
  with check (
    author_trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = poll_comments.trip_id
        and tm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.polls p
      where p.id = poll_comments.poll_id
        and p.trip_id = poll_comments.trip_id
        and public.can_see_content(p.trip_id, p.visibility)
    )
  );

create policy "poll_comments: author or organizer delete"
  on public.poll_comments
  for delete
  to authenticated
  using (
    author_trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = poll_comments.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

-- NOTE: no UPDATE policy — comments are immutable once posted (see the
-- header note — load-bearing immutability guarantee).

-- =============================================================
-- Grants (#361 hygiene — REQUIRED). A clean `db reset` leaves anon/
-- authenticated with no DML on public tables by default. No UPDATE
-- grant — there is no UPDATE path (see the no-UPDATE-policy note).
-- =============================================================

revoke all on public.poll_comments from public, anon, authenticated;
grant select, insert, delete on public.poll_comments to authenticated;

-- =============================================================
-- Realtime publication add — guarded, no-op when the
-- supabase_realtime publication doesn't exist (bare CI Postgres).
-- NOTE: the UI must NOT hard-depend on this — see lib/actions/polls.ts
-- postPollCommentAction/deletePollCommentAction (revalidatePath) and
-- the poll-card comment thread (router.refresh() on success, #349).
-- =============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.poll_comments';
  end if;
end
$$;

-- =============================================================
-- End of 20260813010000_poll_comments.sql
-- =============================================================
