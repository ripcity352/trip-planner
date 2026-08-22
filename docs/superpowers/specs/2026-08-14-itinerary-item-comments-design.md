# Itinerary item comments

Date: 2026-08-14
Status: **approved for implementation**
Clones: `poll_comments` (#620, migration `20260813010000_poll_comments.sql`) —
same table shape, same RLS pattern, same DB/action layer. This spec exists to
record the deliberate deviations, not to re-derive the pattern from scratch.

## 0. What this is

Itinerary item cards (the "plans" tab) have no way for members to leave a
comment on a specific plan — "what time are we actually leaving", "I can
drive 3 people", "bring cash for the entry fee". Polls already have exactly
this: a flat, immutable comment thread scoped to the parent's visibility.
This ports that pattern onto `itinerary_items`.

`itinerary_items` already uses the same `can_see_content(trip_id,
visibility)` RLS helper polls use for its own SELECT policy — so the
poll_comments migration is a near-verbatim template.

## 1. Data model

New table `itinerary_item_comments`, structurally identical to
`poll_comments`:

```sql
create table public.itinerary_item_comments (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references public.itinerary_items(id) on delete cascade,
  trip_id               uuid not null references public.trips(id) on delete cascade,
  author_trip_member_id uuid references public.trip_members(id) on delete set null,
  body                  text not null,
  idempotency_key       uuid,
  created_at            timestamptz not null default now(),
  constraint itinerary_item_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint itinerary_item_comments_body_len       check (length(body) <= 500)
);

create unique index itinerary_item_comments_idempotency
  on public.itinerary_item_comments (item_id, author_trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index itinerary_item_comments_item_idx on public.itinerary_item_comments(item_id);
create index itinerary_item_comments_trip_idx on public.itinerary_item_comments(trip_id);
```

- `trip_id` is denormalized from the parent item (same reason as
  `poll_comments.trip_id`): RLS/scoping without a join, INSERT policy pins it
  to the parent's actual `trip_id` so it can't lie.
- `author_trip_member_id` is `ON DELETE SET NULL` — a departed member's
  comment stays in the thread as an orphaned row; app resolves the name to
  "Someone" (`M3_UI_STRINGS.announcements_author_fallback`).
- No UPDATE policy — comments are immutable once posted. The absence of a
  permissive UPDATE policy is the load-bearing guarantee (survives a #361
  blanket grant-repair), matching `poll_comments`' documented rationale.
- 500-char cap, non-blank constraint — identical to `poll_comments`.

### RLS

```sql
alter table public.itinerary_item_comments enable row level security;

create policy "itinerary_item_comments: members read via parent visibility"
  on public.itinerary_item_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.itinerary_items i
      where i.id = itinerary_item_comments.item_id
        and i.trip_id = itinerary_item_comments.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "itinerary_item_comments: author insert via parent visibility"
  on public.itinerary_item_comments
  for insert
  to authenticated
  with check (
    author_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = itinerary_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.itinerary_items i
      where i.id = itinerary_item_comments.item_id
        and i.trip_id = itinerary_item_comments.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "itinerary_item_comments: author or organizer delete"
  on public.itinerary_item_comments
  for delete
  to authenticated
  using (
    author_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = itinerary_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

revoke all on public.itinerary_item_comments from public, anon, authenticated;
grant select, insert, delete on public.itinerary_item_comments to authenticated;
```

Realtime publication add, guarded (no-op on bare CI Postgres), same as
`poll_comments` — UI must not hard-depend on it (see §4).

## 2. Backend layer

- `lib/db/itinerary-item-comments.ts` — clone of `lib/db/poll-comments.ts`:
  `ITEM_COMMENT_COLUMNS`, `enrichItemComments(comments, memberMap)` ("Someone"
  fallback via `announcements_author_fallback`), `getItemComments(supabase,
  itemId)`, `getCommentsForTrip(supabase, tripId)` (bulk fetch for the page's
  server-side fold), `deleteComment(supabase, commentId)`,
  `ItemCommentDbError` with a `ITEM_COMMENT_NO_ROW` sentinel.
- `lib/actions/itinerary.ts` — add `postItemCommentAction` /
  `deleteItemCommentAction`. Same shape as `postPollCommentAction` /
  `deletePollCommentAction`: idempotency-key validation, zod input schema,
  `resolveItemCommentContext` (fetch parent item's `trip_id` under RLS — null
  means invisible/nonexistent → `rls_denied`; then the caller's own
  `trip_member_id`), rate-limited insert with 23505-replay handling, no-row
  delete converges to `{ ok: true }`.
- `lib/rate-limit/index.ts` — new scope `MUTATE_ITEM_COMMENT:
  "mutateItemComment"`, default 30/60s, fail-open (content mutation, not
  credential minting) — own bucket, same posture as `MUTATE_POLL_COMMENT`.
- `lib/copy/empty-states.ts` (`M3_UI_STRINGS`, since itinerary is the M3
  surface) — new keys: `itinerary_item_comments_heading`,
  `itinerary_item_comments_disclosure_zero`,
  `itinerary_item_comments_disclosure_one`,
  `itinerary_item_comments_disclosure_other_template`,
  `itinerary_item_comments_empty`,
  `itinerary_item_comment_author_line_template`,
  `itinerary_item_comment_placeholder`,
  `itinerary_item_comment_delete_confirm`,
  `itinerary_item_comment_delete_aria`,
  `itinerary_item_comment_delete_cta`,
  `itinerary_item_comment_composer_submit_aria` — mirroring the
  `polls_comment_*` keys 1:1, plus the three disclosure-row labels (zero /
  one / N comments — no count-as-badge, just the row's own label text, same
  register as `PollsDisclosure`'s open-poll count strings).
- `lib/copy/errors.ts` — `item_comment_save_rejected` /
  `item_comment_save_failed` error keys, mirroring the poll-comment pair.

## 3. Frontend

One new client component, `ItemCommentSection`
(`components/trip/itinerary/item-comment-section.tsx`), combining what polls
split into three pieces (`PollsDisclosure` + `PollCommentThread` +
`PollCommentComposer`) into one — item cards are already dense, so this is a
single self-contained unit rather than three:

- **Collapsed row** (default state, always): `aria-expanded` +
  `aria-controls` + chevron-rotate idiom, identical to `PollsDisclosure`.
  Label: zero comments → `itinerary_item_comments_disclosure_zero` ("Add a
  comment"); 1 → `_one`; N → `_other_template`. No auto-expand-on-existing —
  deliberately always collapsed by default (confirmed choice — item cards
  are more crowded than the polls surface this pattern is borrowed from).
- **Expanded panel**: flat list, oldest-first, each row
  `{name} · {relative time}` (via `resolveContentAuthorName` +
  `date-fns/formatDistance` pinned to a server `now` prop) + body text.
  Delete control (text button, not an icon) renders only on the viewer's own
  row or when the viewer is an organizer — absent otherwise, no disabled
  state (rule 11). Composer renders only when the viewer has a
  `trip_member_id` (a seat to author as); a read-only viewer sees the thread
  but no input.
  - Comment `body` renders as plain JSX text (React auto-escapes) — no
    `dangerouslySetInnerHTML`, matching the #631/#632 review's confirmed-safe
    pattern for other freeform fields on this card.
- **Optimistic overlay**: local `optimisticComments` state, merged with
  server-provided `comments` prop and deduped by `idempotency_key` — same
  `mergedComments`/`handleCommentSubmitted`/`handleCommentDeleted` shape as
  `PollCard`. A successful delete calls `router.refresh()` (#349 — must not
  hard-depend on the Realtime channel landing the DELETE).
- Reuses existing primitives: `resolveContentAuthorName`, `callAction`,
  `ERROR_LINE_CLASS`, the `Button` component. No new UI primitives.

`ItemCard` mounts `ItemCommentSection` as its last section (after the
existing per-item flag surfaces), passing `itemId`, this item's slice of
`commentsByItem`, `viewerTripMemberId`, `isOrganizer`, `viewerDisplayName`,
`now`.

## 4. Wiring

`app/(authed)/trips/[tripId]/itinerary/page.tsx` already fetches
`tripMembers` (reused for `memberMapById`, same as the announcements page's
`memberMapById`) and computes `now` (already needed for `nowNextItemIds`).
Add:

- `getCommentsForTrip(supabase, trip.id)` (parallel-fetched alongside the
  existing `Promise.all` fan-out)
- `viewerDisplayName` derived from `tripMembers` (mirrors the announcements
  page's #405-C pattern — a freshly-posted comment shows the real name
  immediately instead of flashing "Someone")
- `enrichItemComments(comments, memberMapById)` then group into
  `commentsByItem: Record<string, ItemComment[]>` (single-pass Map build,
  same O(n) pattern as the announcements page's `commentsByPollMap`)
- Thread `commentsByItem`, `memberDisplayNameById` isn't needed here (unlike
  polls' write-in attribution use case — items have no equivalent), and
  `viewerDisplayName` + `now` through `DaySection → ItemCard`, same
  per-item map-lookup pattern already used for `itemFlagsMap` /
  `lodgingAssignmentsMap`.

`DaySection` and `ItemCard` prop interfaces both gain the new fields:
`itemComments: ItemComment[]`, `viewerTripMemberId`, `viewerDisplayName`,
and `now: Date`. `now` is a new prop on this chain — today `ItemCard` only
receives derived `isNow`/`isNext` booleans, not the raw clock value, so it
must be added and threaded through `DaySection` alongside the others.

## 5. Testing

- `lib/db/__tests__/itinerary-item-comments.test.ts` — enrich "Someone"
  fallback (null author, map-miss), ordering (oldest-first).
- `lib/actions/__tests__/itinerary-item-comments-actions.test.ts` —
  idempotent insert + 23505 replay, `rls_denied` on an invisible/nonexistent
  parent item, no-row delete converges to `{ ok: true }`, rate-limit
  exceeded → `rate_limit` error key.
- `components/trip/itinerary/__tests__/item-comment-section.test.tsx` —
  collapsed/expanded toggle, disclosure label at 0/1/N comments, delete
  affordance visible only for own-comment-or-organizer, composer absent for
  a viewer with no `trip_member_id`, optimistic merge/dedup by
  `idempotency_key`.
- `item-card.test.tsx` — `ItemCommentSection` mounts with the right props
  (mocked, same pattern as the existing `MapsLink`/`ItemRsvpChip` mocks in
  that file).
- SQL RLS harness (new file, mirrors the existing `poll_comments` harness) —
  member can read/write comments on a visible item; celebrant cannot
  read/write comments on a `hide_from_celebrant` item (RLS blocks at the
  parent-item level, same as the item itself); author or organizer can
  delete, a third member cannot; a comment's `trip_id` cannot be spoofed to
  a different trip.

## 6. Explicitly out of scope

- Editing a posted comment (immutable, matches poll comments).
- Replies/threading (flat, matches poll comments).
- Realtime-pushed new comments without a refresh (same posture as poll
  comments — `router.refresh()` on the viewer's own mutation is the only
  freshness guarantee; a peer's comment appears on next natural navigation/
  refresh, not live-pushed).
- Comments on the `add-item-form.tsx` create flow — comments only make sense
  once an item exists.
