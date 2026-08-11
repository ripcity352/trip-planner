# Shopping List PR2 — Social layer (detailed plan)

> Detailed from the PR2 outline in `2026-08-11-shopping-list.md` §"PR2" against
> spec §12 and PR1's now-real signatures + the shipped `announcement_reactions`
> engine. Execute subagent-driven (superpowers:subagent-driven-development).

**Goal:** Stack reactions (👍 like on the row; 👎 + full 6-emoji set in a tap-in
detail sheet) + a flat Notes comment thread onto the shipped core list.

**Branch:** `feat/shopping-list-social` (off merged main, already created).

**Spec:** `docs/superpowers/specs/2026-08-11-shopping-list-design.md` §12 (authoritative).

## Global Constraints (same as PR1 + PR2 specifics)

- pnpm only. DB access only via `/lib/db/`. Mutations = Server Actions returning
  `{ ok:true; … } | { ok:false; errorKey }`, called via `callAction` + caller-side
  `router.refresh()`. **NO `revalidatePath`, NO `redirect()`** (I12) — the
  `announcement_reactions` clone source uses `revalidatePath`; the shopping clone
  MUST drop it and rely on caller `router.refresh`.
- RLS in the same migration as any new table. Multi-tenant: scope by `trip_id`.
- **Child RLS EXISTS must pin `i.trip_id = <child>.trip_id`** (the announcement
  template has this; dropping it lets a dual-trip member insert a child row whose
  trip_id ≠ its parent's). Plus own-seat INSERT. **No UPDATE policy** on either
  child table (reactions toggle via insert/delete; comments immutable). The absent
  UPDATE policy is the load-bearing immutability guarantee — survives a #361 blanket
  grant-repair (RLS default-denies with no permissive UPDATE policy).
- **Grants (spec §12.3, NOT the announcement precedent which had none):**
  `revoke all on <table> from public, anon, authenticated;` then
  `grant select, insert, delete to authenticated` on BOTH child tables. Re-assert
  after `db reset` (#361), keep intentional revokes.
- **No new SECURITY DEFINER function or view** (I5 clean no-op — inline EXISTS,
  reuse `can_see_content`).
- **Reactions are natural-key (NO idempotency_key column)** → structurally out of I2
  scope (the checker only enrolls tables declaring `idempotency_key`). Do NOT add
  `shopping_item_reactions` to any I2 exemption list — that would break the gate.
  **Comments DO carry `idempotency_key`** + partial unique index.
- **Aggregate-only boundary (load-bearing):** `summarizeItemReactions` runs
  SERVER-SIDE in `shopping-list/page.tsx` and DROPS `trip_member_id`. The client
  receives only `{ counts, mine }` per item — raw reaction rows NEVER cross to a
  client component. Reactions keep a normal `grant select` (same exposure already
  accepted for `announcement_reactions`; friction-vs-security). Add a boundary test.
- **Reaction vocab:** `SHOPPING_REACTION_EMOJI = ['👍','👎','❤️','🔥','😂','🍻'] as const`
  (drops the announcement 🫡 to fit 👎 within the 6-cap). Row = 👍 only; detail sheet
  = full set incl 👎 with NEUTRAL aria labels ("thumbs down", never "dislike").
- **Comment author fallback = "Someone"** (`announcements_author_fallback` in
  M3_UI_STRINGS), NOT `resolveMemberName`'s "Guest". Never render `.email` (I6).
- **Comment idempotency key rotates per confirmed comment** (fresh UUID on every
  `ok:true`), NOT once per sheet-open — else a 2nd note in the same sheet reuses the
  key → 23505 → silently dropped.
- No inline copy literals; new keys in `SHOPPING_LIST_UI_STRINGS` / `ERRORS`
  (+ sync the copy-fixture guards in `lib/copy/__tests__/`). No reaction inflation
  (≤6). No per-name reaction lists. Reactions NEVER an ordering key (add a
  render-in-created_at-order test).
- Rate scopes already exist (PR1 Task 3): reactions → `TOGGLE_SHOPPING_ITEM`;
  comments add/delete → `MUTATE_SHOPPING_ITEM`. No new scopes.
- Local gate per task: `pnpm typecheck · lint · test · build`; then
  `pnpm dlx supabase db reset` (+ grant re-assert) + local e2e. Docker DB container:
  `supabase_db_trip-planner`. Prod migration applied automatically after PR2 merges.

## Real clone targets (from the shipped code — use these exact names)

- Reaction action: `lib/actions/announcement-reactions.ts` →
  `toggleReactionAction(input:{announcementId,emoji,active}):{ok:true;active}|{ok:false;errorKey}`;
  helper `resolveReactionContext(supabase,announcementId,userId)→{tripId,tripMemberId}|null`;
  `insertReaction`/`deleteReaction` (23505⇒success, 42501⇒rls_denied); error class
  `ReactionActionError`. **Uses `revalidatePath("/trips","layout")` — DROP that.**
- Reaction data: `lib/db/announcement-reactions.ts` → `REACTION_COLUMNS`,
  `getReactionsForTrip(supabase,tripId)`, `summarizeReactions(rows,myMemberId):
  Record<parentId,{counts:Partial<Record<emoji,number>>;mine:emoji[]}>` (drops
  trip_member_id). Types `AnnouncementReaction`, `AnnouncementReactionSummary` in
  `lib/db/types.ts`.
- Reaction constants: `lib/reactions/constants.ts` → `REACTION_EMOJI`, `ReactionEmoji`,
  `isReactionEmoji`. Client-importable (outside lib/actions).
- Server summarize call site: `app/(authed)/trips/[tripId]/announcements/page.tsx:77-79`
  (`myMemberId = members.find(m=>m.user_id===user.id)?.id ?? null;
  summarizeReactions(reactions, myMemberId)`), passed folded to the client feed.
- Reaction UI: `components/trip/announcements/reaction-row.tsx` →
  `ReactionRow({announcementId,initialCounts,initialMine})`, optimistic + `inflight`
  ref-guard, aria via M5_UI_STRINGS.
- Comment/thread: NONE exists. Clone the append-only+idempotency+23505-re-select
  logic from `lib/actions/announcements.ts` `postAnnouncement(input,idempotencyKey)`
  + `lib/db/announcements.ts` (`ANNOUNCEMENT_COLUMNS`, `getAnnouncements`,
  `enrichAnnouncements` "Someone" resolver, `deleteAnnouncement`,
  `AnnouncementDbError`, `ANNOUNCEMENT_NO_ROW`). Announcements idempotency partial
  index precedent: `m1_foundation.sql:462` `announcements_idempotency`.
- Reaction migration precedent: `supabase/migrations/20260710060000_announcement_reactions.sql`
  (natural-key unique, emoji CHECK, RLS EXISTS pins BOTH a.id AND a.trip_id, NO
  UPDATE policy, NO grants — add explicit grants per spec §12.3).
- PR1 reuse: `lib/actions/shopping-list.ts` has `resolveMemberId(supabase,tripId,userId)`,
  `ShoppingActionError`/`toErrorResult`/`mapDbError`, envelope `ToggleShoppingItemResult`;
  `lib/db/shopping-list.ts` `ShoppingListDbError`/`SHOPPING_ITEM_NO_ROW`; PR1
  `ShoppingItemCard`/`ShoppingList`/`AddItemSheet`; `SHOPPING_LIST_UI_STRINGS` bag.
- `rateLimitedAction(scope,key,fn)` from `@/lib/rate-limit`; `callAction(fn)` from
  `@/lib/ui/call-action`; `formatCents(cents,currency)` from `@/lib/utils/format-cents`;
  `resolveMemberName` from `@/lib/utils/member-display`.

Migration timestamp: next after `20260811010000` → `20260811020000_shopping_social.sql`.

---

## P2-T1 — Migration: two child tables + RLS + grants  (ultracode: security + code pairing)

**Files:** Create `supabase/migrations/20260811020000_shopping_social.sql`.
**Reference:** the announcement_reactions migration (above) + PR1 `20260811010000_shopping_list.sql`.

Steps:
1. Confirm tip is `20260811010000`; use `20260811020000`.
2. Write both tables per spec §12.3:
   - `shopping_item_reactions(id, item_id→shopping_list_items on delete cascade,
     trip_id→trips on delete cascade, trip_member_id→trip_members on delete cascade,
     emoji text not null check (emoji in ('👍','👎','❤️','🔥','😂','🍻')),
     created_at, unique(item_id, trip_member_id, emoji))`. Indexes on item_id, trip_id.
     NO idempotency_key.
   - `shopping_item_comments(id, item_id→… cascade, trip_id→… cascade,
     author_trip_member_id→trip_members on delete set null, body text not null,
     idempotency_key uuid, created_at, check length(btrim(body))>0, check length(body)<=500)`.
     Partial unique index `(item_id, author_trip_member_id, idempotency_key) where
     idempotency_key is not null`. Index on item_id, trip_id.
3. RLS both (`to authenticated`), inline EXISTS on `shopping_list_items i`, PINNING
   `i.trip_id = <child>.trip_id`:
   - SELECT: `exists(select 1 from shopping_list_items i where i.id=<child>.item_id
     and i.trip_id=<child>.trip_id and public.can_see_content(i.trip_id,i.visibility))`.
   - INSERT with-check: the same pinned EXISTS AND own seat
     (`trip_member_id` / `author_trip_member_id in (select tm.id from trip_members tm
     where tm.trip_id=<child>.trip_id and tm.user_id=auth.uid())`).
   - DELETE: reactions → own row (`trip_member_id in (…self…)`); comments → author
     (`author_trip_member_id in (…self…)`) OR `public.is_trip_organizer(trip_id)`.
   - **No UPDATE policy on either.** Add a migration comment noting the absent-UPDATE
     immutability guarantee (mirror the ride_group_members R2 note).
4. Grants: `revoke all on <table> from public, anon, authenticated;` then
   `grant select, insert, delete on <table> to authenticated;` for BOTH.
5. `pnpm dlx supabase db reset`; verify both tables + RLS on + no UPDATE policy +
   grants exact via docker psql. Re-assert grants if #361 strips them (keep revokes).
6. Commit `feat(db): shopping_item_reactions + shopping_item_comments — child RLS (trip_id pin), no-UPDATE immutability, grants`.

## P2-T2 — Reaction constants + data layer  (TDD)

**Files:** Create `lib/reactions/shopping-constants.ts`,
`lib/db/shopping-item-reactions.ts`, `lib/db/__tests__/shopping-item-reactions.test.ts`;
modify `lib/db/types.ts`.
Steps (TDD):
1. `lib/reactions/shopping-constants.ts`: `SHOPPING_REACTION_EMOJI =
   ['👍','👎','❤️','🔥','😂','🍻'] as const`; `ROW_LIKE_EMOJI = '👍'`;
   `type ShoppingReactionEmoji`; `isShoppingReactionEmoji` guard. Client-importable.
   DB CHECK mirrors the set (changed together).
2. types.ts: `ShoppingItemReaction { id; item_id; trip_id; trip_member_id; emoji:
   ShoppingReactionEmoji; created_at }`; `ShoppingItemReactionSummary { counts:
   Partial<Record<ShoppingReactionEmoji,number>>; mine: ShoppingReactionEmoji[] }`.
3. Failing test: `SHOPPING_REACTION_COLUMNS` completeness; `getShoppingReactionsForTrip`
   orders created_at asc + throws on error; **boundary: `summarizeItemReactions`
   output contains NO `trip_member_id` and is `{counts,mine}` keyed by item_id**;
   `mine` only my member's emojis.
4. Implement `lib/db/shopping-item-reactions.ts` (clone announcement-reactions.ts):
   `SHOPPING_REACTION_COLUMNS`, `getShoppingReactionsForTrip(supabase,tripId)`,
   `summarizeItemReactions(rows, myMemberId): Record<itemId, ShoppingItemReactionSummary>`.
5. GREEN; typecheck/lint/test; commit.

## P2-T3 — Comment data layer  (TDD)

**Files:** Create `lib/db/shopping-item-comments.ts`,
`lib/db/__tests__/shopping-item-comments.test.ts`; modify `lib/db/types.ts`.
Steps (TDD):
1. types.ts: `ShoppingItemComment { id; item_id; trip_id; author_trip_member_id:
   string|null; body; idempotency_key: string|null; created_at; authorDisplayName?: string }`.
2. Failing test: `SHOPPING_COMMENT_COLUMNS` scalar author (no embed) completeness;
   `getCommentsForTrip` orders created_at asc; author fallback resolves a missing
   member to "Someone" (`announcements_author_fallback`), a present member to their
   name via the member map; no-row sentinel.
3. Implement `lib/db/shopping-item-comments.ts` (clone announcements.ts DbError +
   enrich pattern): `SHOPPING_COMMENT_COLUMNS`, `getCommentsForTrip(supabase,tripId)`,
   an `enrichComments(comments, memberUserMap)`-style "Someone" resolver,
   `ShoppingCommentDbError`, `SHOPPING_COMMENT_NO_ROW`, `deleteComment(supabase,id)`
   (`{count:"exact"}`, no-row sentinel).
4. GREEN; gate; commit.

## P2-T4 — Actions: reactions + comments  (ultracode: security + code pairing; focus aggregate-only boundary)

**Files:** Create `lib/actions/shopping-item-reactions.ts`,
`lib/actions/shopping-item-comments.ts`, + `__tests__` for both; modify
`lib/copy/errors.ts` (add keys) + sync `lib/copy/__tests__/errors.test.ts`.
Error keys to add: `shopping_reaction_save_failed`,
`shopping_comment_save_failed`, `shopping_comment_save_rejected`,
`shopping_comment_delete_failed`, and `shopping_item_gone`
("That one's already gone from the list.") (+ reuse `rls_denied`, `rate_limit`,
`validation_failed`, `network`).
Steps (TDD):
1. Failing tests (clone ride-groups/announcements harness). Reactions: toggle on
   (insert) + off (delete) independent, NO opposite-clear; 23505⇒success (natural-key
   replay); hidden parent (unseeable item)⇒`rls_denied`; 42501⇒rls_denied; no redirect
   (I12). Comments: idempotent add {ok:true}; 23505 re-select on
   (item_id, author, idempotency_key)⇒replay; two sequential adds with DIFFERENT keys
   ⇒ two rows; blank body⇒validation_failed; delete envelope (author/organizer);
   42501⇒rls_denied; no redirect.
2. `lib/actions/shopping-item-reactions.ts`: `toggleShoppingReaction({itemId,emoji,
   active})` — clone `toggleReactionAction` BUT: resolve item trip_id under RLS
   (clone `resolveReactionContext` against `shopping_list_items`; hidden⇒rls_denied),
   own member (reuse PR1 `resolveMemberId` pattern), `rateLimitedAction(
   TOGGLE_SHOPPING_ITEM, userId, insert|delete)`, 23505⇒success, 42501⇒rls_denied,
   else `shopping_reaction_save_failed`. **NO opposite-clear. NO revalidatePath. NO
   redirect** (caller router.refresh). zod: `emoji z.enum(SHOPPING_REACTION_EMOJI)`,
   ids uuid.
3. `lib/actions/shopping-item-comments.ts`: `addShoppingComment({itemId,body},
   idempotencyKey)` (idempotent insert; 23505 re-select; 42501⇒rls_denied; else
   rejected/failed split) + `deleteShoppingComment(commentId)` (RLS no-op delete,
   author/organizer; no-row⇒treat as ok? follow PR1 delete-idempotent precedent —
   confirm in review). Rate scope `MUTATE_SHOPPING_ITEM`. zod: `body
   z.string().trim().min(1).max(500)`, ids uuid.
4. GREEN; full gate (I3 needs 23505/42501 split in each action file; I12 no redirect;
   I2 unaffected — reactions column-less, comments have the key). Commit.

## P2-T5 — Row like affordance (ShoppingItemCard)  (TDD-ish + component test)

**Files:** modify `components/trip/shopping-list/ShoppingItemCard.tsx`,
`ShoppingList.tsx` (thread the folded summary + comment counts + open-sheet handler);
add/extend a component test.
Steps:
1. Card gains an inline **👍 like** control (tap toggles via `toggleShoppingReaction`,
   optimistic + `inflight` ref-guard, clone `reaction-row.tsx` for the single-emoji
   case) + its count shown only when ≥1, plus a read-only `💬n` note-count shown only
   when ≥1. **No 👎/other emoji on the row.** Row shows nothing in the meta slot when
   like=notes=0.
2. Tapping anywhere else on the row (incl a struck/bought row) opens the detail sheet
   (a handler prop from ShoppingList; sheet itself is P2-T6). Got-it checkbox + like
   are the only non-open controls.
3. Card consumes a folded `ShoppingItemReactionSummary` + a `commentCount:number`
   prop (never raw rows). Row counts lag one router.refresh (consistent w/ MVP).
4. Component test: like control renders count only when ≥1; no 👎 on row; whole-row
   tap fires the open handler even on a bought row. Gate; commit.

## P2-T6 — Detail bottom sheet (ShoppingItemSheet)  (the net-new UI)

**Files:** Create `components/trip/shopping-list/ShoppingItemSheet.tsx` (+ maybe a
`ShoppingReactionStrip.tsx`, `ShoppingNotesThread.tsx`, `ShoppingNoteComposer.tsx` if
the sheet exceeds ~400 lines — split by responsibility); component test(s).
**Reference:** `add-expense-sheet.tsx` conditional-render + arrivals compact/full;
`reaction-row.tsx` (strip); `announcement-composer.tsx` (composer).
Steps (spec §12.6):
1. Hand-rolled bottom-sheet panel (NO shadcn Sheet): ~90% height over a dimmed list,
   swipe/✕ dismiss, composer pinned above keyboard. Verify at 375px.
2. Header: name; `Added by {Someone-fallback name} · {relTime}` (date-fns
   `formatDistanceToNow`, pass server `now` for loaded rows / `new Date()` for
   optimistic); claim CTA (reuse PR1 claim); optional cost tag (`formatCents`, never
   `formatCost`).
3. Reaction strip: all six pills, tappable ghost when count 0, tinted when yours,
   count only when ≥1; optimistic + per-emoji ref-guard; on rate_limit/failure roll
   back + surface copy. `role="group"`; **neutral per-pill aria-labels** ("thumbs up"
   /"thumbs down"/"heart"…, NEVER "dislike"/"downvote"); `aria-pressed`; 44px targets.
4. Notes thread: header plain word "Notes" (never "Notes (2)"). Flat, newest-at-bottom,
   `{name} · {relTime}` + body via `resolveMemberName`/"Someone" (never `.email`);
   author/organizer sees a delete affordance on their own line (absent for others).
   Empty: "Nothing here yet. Drop a note if there's something the buyer should know."
5. Composer: single-line, placeholder "Add a note…", no label/asterisk; submit
   disabled while pending. **Idempotency key per-logical-comment**: seed
   `keyRef = crypto.randomUUID()` (client-only), rotate to a fresh UUID on EVERY
   confirmed `ok:true` (NOT once per open). Optimistic append + router.refresh;
   optimistic rows dedupe by idempotency_key so a refresh doesn't double them.
6. Item-gone handling: if a comment/reaction returns `rls_denied` on an item that was
   present at sheet-open, treat as gone — close sheet, surface `shopping_item_gone`
   copy (not the generic access error). Item delete with ≥1 comment/reaction requires
   a confirm (cascade nukes the thread).
7. Add the needed UI strings to `SHOPPING_LIST_UI_STRINGS` (reaction aria labels,
   "Notes", "Add a note…", empty-thread, comment-delete confirm, item-delete confirm)
   + sync `lib/copy/__tests__/empty-states.test.ts`. Gate (I6 no .email). Commit.

## P2-T7 — Page wiring + gates + e2e + prod migration

**Files:** modify `app/(authed)/trips/[tripId]/shopping-list/page.tsx` (server-side
fold + pass folded props); create `e2e/shopping-list-social.spec.ts`.
Steps:
1. Wire page.tsx (clone announcements/page.tsx:77-79): in the `Promise.all` add
   `getShoppingReactionsForTrip(supabase, trip.id)` + `getCommentsForTrip(supabase,
   trip.id)`; compute `myMemberId`; `summarizeItemReactions(reactions, myMemberId)`;
   derive per-item comment counts; pass FOLDED `{counts,mine}` + comment counts (and,
   for the open sheet, the visible comments for that item) to `ShoppingList` → cards
   + sheet. **Raw reaction rows must not reach any client component** (boundary).
2. Unit: list renders in `created_at` order regardless of reaction counts
   (no-leaderboard guard); boundary test that the client props carry no
   `trip_member_id`.
3. e2e `e2e/shopping-list-social.spec.ts`: open item → react (👍 on row + 👎 in sheet)
   → add a note → delete the note. Assert transitions on text/aria, not timing. Use
   LOCAL supabase creds (not .env.local — prod).
4. Full local gate: `pnpm typecheck · lint · test · build`; `db reset` + grant
   re-assert + local e2e; RLS harness additions (spec §12.7): extend
   `supabase/tests/shopping_list_rls.test.sql` (or a new `shopping_social_rls.test.sql`)
   — celebrant cannot read reactions/comments on a hide_from_celebrant item; non-member
   blocked; comment author-or-organizer delete only; reaction own-row delete only;
   child trip_id cannot diverge from parent (pin holds); two members same comment
   idempotency UUID ⇒ two rows.
5. Commit; push `-u`; open PR2 (`gh pr create` — do not merge).
6. After merge: apply `20260811020000_shopping_social.sql` to prod via keychain-curl
   (spec §11) — verify both tables exist + RLS on + advisors + login healthy.

## Review gates
- Ultracode security+code pairing on P2-T1 (child migrations/RLS/trip_id pin/no-UPDATE)
  and P2-T4 (actions + the aggregate-only boundary: summarize server-side, no
  trip_member_id to client). Task-review each other task. Final whole-branch review
  before merge.
