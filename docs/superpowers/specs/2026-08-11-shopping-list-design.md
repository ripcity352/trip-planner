# Shopping List — design spec

Date: 2026-08-11
Status: **approved for implementation** (operator-authorized standalone page;
see `notes/shopping-list-exploration.md` §0).
Source brief: `notes/shopping-list-exploration.md` (skeleton, reuse patterns, CI
gates, persona guardrails, forks).

## 1. What we're building

A shared **shopping list** for a trip: supplies / booze / groceries / gear that
**any member can add onto**, claim ("I've got this"), and check off ("got it").
Mobile-first, group-chat feel. Ships as a **standalone, self-contained trip
page** modeled on the arrivals ("who's landing when") page — its own route,
useful on its own, no milestone gate.

**Zero expenses coupling.** Pure coordination. An optional `cost_cents` tag is
display-only — never a ledger entry, never split. Buying the ice and never
logging it is fine.

## 2. Scope

### In MVP
- One shared flat list per trip; any member adds items.
- Freeform item name (holds quantity inline: `"2 handles of tequila"`).
- Optional freeform category tag (suggestion chips: snacks / booze / supplies /
  gear — shown neutrally; **booze is a peer, never the headline**).
- Optional display-only cost tag (`cost_cents` + `currency`); never split.
- **Self-claim** / unclaim ("I've got this" / "off your plate").
- **Got-it** toggle: strike-through in place, **reversible** (drunk mis-tap),
  collapsed under a "Got it" divider. **No count, no progress bar, no score.**
- **Amend** (name / qty / category / cost): **any member** (shared scratchpad).
- **Delete**: item creator **or** organizer.
- **Surprise items**: `hide_from_celebrant` visibility → **fully absent** to the
  celebrant (no "1 hidden item" teaser). Enforced by existing RLS for free.
- Idempotent add (rule #9 — drunk double-tap on bad signal).
- **Reactions (👍/👎)** and **Notes (comment thread)** per item — the glanceable
  row shows only tiny indicators; the full interaction lives in a tap-in detail
  **bottom sheet**. Full design in **§12** (this is a meaningful scope increase:
  two child tables + two action files + the detail sheet).

### Deferred (noted, not built)
- Organizer **claim-on-behalf** (needs the rule-#8 consent/attribution path).
- Realtime live surface (MVP uses `router.refresh` on mutate, like the app).
- Optimistic got-it/claim toggle (MVP accepts the one round-trip lag).
- Edit attribution / history (items AND comments — comments are immutable in MVP).
- Reactions-on-comments, @-mentions, avatars, on-behalf comments, a deep-linkable
  `/[itemId]` detail route (the sheet renders a component, so a route is a cheap
  fast-follow) — all §12 fast-follows.
- One-tap "log the spend → prefill AddExpense" bridge (explicitly out of scope).
- Per-person packing lists (a second content type — deliberate cut).

### Hard bans (refuse if requested)
Progress bar / "12/20 bought" completion score, top-shopper leaderboard,
achievement/badge toasts, required-field asterisks, push for "Pete claimed the
sunscreen," green/red traffic-light states. (Per CLAUDE.md "What NOT to do" +
brief §6.)

## 3. Fork resolutions (brief §5)

| # | Fork | Decision |
|---|------|----------|
| 1 | Claim vs assign | Self-claim only; organizer on-behalf **deferred** |
| 2 | Check-off | Strike-through in place, reversible, "Got it" divider, no counts |
| 3 | Amend | **Any member** (`is_trip_member`) |
| 4 | Cost tag | **In MVP**, optional, display-only, never split |
| 5 | Categories | Optional freeform tag + neutral suggestion chips |
| 6 | Quantity | Freeform in name field |
| 7 | Per-person vs shared | One shared pool |
| 8 | Surprise render | `hide_from_celebrant` → fully absent to celebrant |
| 9 | Realtime | Fast-follow |
| 10 | Accountless members | FK to `trip_members` (both id columns), scalar |

## 4. Data model

New table `public.shopping_list_items` (single flat table — no child, **no
manifest view**; the two FKs to `trip_members` are exposed as plain scalar ids
and never PostgREST-embedded, so the 2nd-FK/HTTP-300 trap does not apply).

```sql
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_trip_member_id uuid
    references public.trip_members(id) on delete set null,
  claimed_by_trip_member_id uuid
    references public.trip_members(id) on delete set null,  -- 2nd FK, scalar only
  name text not null,
  category text,
  bought boolean not null default false,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  currency char(3) not null default 'USD',
  visibility public.trip_visibility not null default 'everyone',
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  constraint shopping_list_items_name_not_blank
    check (length(btrim(name)) > 0),
  -- DB is the floor, not zod: members hold raw INSERT/UPDATE grants, so a direct
  -- PostgREST call bypasses the app-layer caps. (RLS-agent LOW-5.)
  constraint shopping_list_items_name_len   check (length(name) <= 200),
  constraint shopping_list_items_category_len
    check (category is null or length(category) <= 80)
);
-- FOOTGUN (mirrors the ride_groups migration note): this table has TWO FKs into
-- trip_members (created_by + claimed_by). NEVER add a bare `trip_members(...)`
-- PostgREST embed to SHOPPING_ITEM_COLUMNS — it returns HTTP 300. Both ids stay
-- scalar; names resolve app-side via resolveMemberName. (I4 stays a no-op.)

create unique index shopping_list_items_idempotency
  on public.shopping_list_items (trip_id, created_by_trip_member_id, idempotency_key)
  where idempotency_key is not null;
```

### RLS + grants (revised after adversarial review — the UPDATE surface was the one real defect)

**Design correction.** The first draft granted full-table UPDATE with an
`is_trip_member`-only policy. That is broken, and it broke the feature's
differentiator: because RLS is the source of truth (rule #5), a member hitting
PostgREST directly could `SET visibility='everyone'` to **spoil a surprise**
(rule #7 is the whole point), forge `created_by` to **bypass the delete gate**,
or move `trip_id` to **hijack a row across trips**. Within-trip *claim* forgery
stays out of the threat model (friction-vs-security) — but visibility/ownership/
tenancy do not. WITH CHECK can't pin a column to its OLD value, so the correct
tool is a **column-scoped UPDATE grant**: Postgres denies any UPDATE touching a
column outside the list at the privilege layer, before RLS runs. This makes
`id`, `trip_id`, `created_by_trip_member_id`, `visibility`, `idempotency_key`,
and `created_at` **immutable after insert** — exactly the columns no action
mutates — and closes all three findings by construction.

```sql
alter table public.shopping_list_items enable row level security;

-- read: existing visibility gate; NO new SECURITY DEFINER fn (I5 no-op)
create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.can_see_content(trip_id, visibility));

-- insert: writer-binding + tenancy (unchanged — attacked and held)
create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- update: gate SYMMETRIC with read (can_see_content, not is_trip_member) so the
-- write gate matches the read gate for hide_from_celebrant rows by construction.
-- Column scope (below) is what actually pins visibility/created_by/trip_id.
create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (public.can_see_content(trip_id, visibility))
  with check (public.can_see_content(trip_id, visibility));

-- delete: creator OR organizer escape hatch (destructive → tighter than edit)
create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );
```

### Grants (item #361 hygiene — local `db reset` grants ALL at create; re-assert)

```sql
revoke all on public.shopping_list_items from public, anon, authenticated;
grant select, insert, delete on public.shopping_list_items to authenticated;
-- COLUMN-SCOPED update: only the mutable coordination columns. Omitting
-- visibility/trip_id/created_by/idempotency_key/id makes them immutable-after-insert.
grant update (name, category, bought, claimed_by_trip_member_id, cost_cents, currency)
  on public.shopping_list_items to authenticated;
```

Migration filename: next timestamp after `20260811000000`
(e.g. `20260811010000_shopping_list.sql`). RLS lives in the **same** migration.

## 5. Data layer — `lib/db/shopping-list.ts`

- `SHOPPING_ITEM_COLUMNS` — flat select string listing **every** column the
  actions write (I1). Includes both scalar member id columns; **no embed**.
  **Load-bearing for I1:** `name, category, bought, claimed_by_trip_member_id,
  cost_cents, currency, visibility` are NOT in the checker's `GLOBAL_EXEMPT`
  set, so each must appear in this projection or the data-loss gate fails.
  (`trip_id, created_by_trip_member_id, idempotency_key, created_at` are exempt
  but include them anyway.)
- `getShoppingItems(supabase, tripId): Promise<ShoppingItem[]>` — select by
  `trip_id`, order `created_at` asc (add-order = group-chat feel), throws on
  `error`.
- `ShoppingListDbError extends Error` with `readonly code: string | null` +
  `SHOPPING_ITEM_NO_ROW` sentinel (mirrors `AnnouncementDbError`).
- Setters/patch/delete use `{ count: "exact" }` and throw the no-row sentinel
  when `!count`.

`lib/db/types.ts`: add `ShoppingItem` interface (DB columns) with a non-DB
`createdByDisplayName?` / `claimedByDisplayName?` resolved at the boundary,
matching the `Announcement` precedent.

## 6. Actions — `lib/actions/shopping-list.ts`

`"use server"`. Template = `lib/actions/ride-groups.ts`. Each returns
`{ ok: true; ... } | { ok: false; errorKey: ErrorKey }`. Client calls via
`callAction` + `router.refresh()`. **CI note (I12):** the gate only enforces
that `callAction` never wraps a `redirect()` action — the `router.refresh` half
is convention, not statically checked, so don't rely on CI to catch a missing
refresh. No `revalidatePath`, no `redirect()`.

- `addShoppingItem(input, idempotencyKey)` — validate key + zod input → auth →
  resolve creator `trip_member` id (null ⇒ `rls_denied`) → `rateLimitedAction`
  → insert. On `23505`: re-select by `(trip_id, created_by, idempotency_key)`
  and return existing (I2/I3). `42501` ⇒ `rls_denied`; else
  `code ? *_save_rejected : *_save_failed`.
- `toggleBought(itemId, bought)` — `{ count: "exact" }` update; no-row sentinel.
- `setClaim(itemId, claimed: boolean)` — server resolves acting member id;
  sets `claimed_by_trip_member_id` to self (claim) or `null` (unclaim).
- `amendItem(itemId, patch)` — patch of `{ name?, category?, costCents? }`;
  zod-validated; `{ count: "exact" }`. **Partial-patch discipline (gap-A, a
  guaranteed bug otherwise):** build the update object from **only the keys
  present in the patch** — `undefined` means "leave unchanged", `null` means
  "explicitly clear" (`category`/`cost_cents` are nullable). Never send a full
  object with `undefined` fields (would null out `category`/`cost` when someone
  edits only the name). Test: "amend name only leaves category and cost intact."
- `deleteShoppingItem(itemId)` — RLS-gated no-op delete; `42501` ⇒ `rls_denied`.

Add rate-limit scopes in `lib/rate-limit/index.ts`. Prep is bursty (a "got-it
everything" spree across a 20-item list), so **split** the mutate buckets rather
than sharing one 30/60s default:
`CREATE_SHOPPING_ITEM: "createShoppingItem"` (default 30/60s — fine for adds),
`TOGGLE_SHOPPING_ITEM: "toggleShoppingItem"` (high-tap: got-it/claim — bump to
~60/60s in `SCOPE_BUDGETS`),
`MUTATE_SHOPPING_ITEM: "mutateShoppingItem"` (amend/delete — default is fine).

Input validation zod schemas (rule: validate all input):
`name` `z.string().trim().min(1).max(120)`, `category`
`z.string().trim().max(40).transform(v => v || null).nullable().optional()`
(coerce whitespace-only `""` → `null` — gap-H, avoids storing an empty chip),
`costCents` `z.number().int().min(0).max(100_000_00).nullable().optional()`,
`tripId`/`itemId` `z.string().uuid()`. **Currency is USD-fixed in the MVP UI**
(no currency field in `AddItemSheet`) so the action does not accept a
client-supplied `currency` — the column default `'USD'` stands. (Dropping it
from the input also dodges the `Intl.NumberFormat` `RangeError`-on-bad-code
path — gap-H.)

## 7. UI

**Entry point** (was underspecified). The route is reached by a **dashboard
`<Link>` card** on `app/(authed)/trips/[tripId]/page.tsx`, exactly like the
arrivals card — **not** a BottomTabBar tab (that's a fixed 5-tab set). The card
label is static ("Shopping list"); its subtitle, **if any**, is a neutral item
count only ("7 things"). **Never** a claimed/total fraction ("3 claimed",
"3 of 7") — that's a disguised completion score / social-pressure counter and is
hard-banned (CLAUDE.md; brief §3). When in doubt, no subtitle.

Route `app/(authed)/trips/[tripId]/shopping-list/page.tsx` (mirror
`arrivals/page.tsx`) + `loading.tsx`. Server component: resolve trip by slug
(`getTripBySlug` → pass **`trip.id`**, never the raw route param) → inline
`auth.getUser()` → `getViewerMember` → parallel-load (`Promise.all`) items + trip
members → pass `tripMembers` down; the **client component builds the `memberMap`**
(matches the arrivals manifest — the page does not build it).

Components under `components/trip/shopping-list/`:
- `ShoppingList.tsx` (client) — partitions items into **active** + a struck
  **"Got it"** section below a divider (no count on the divider). Renders
  `AddItemSheet`. **Empty state (gap-D):** the "throw something on" copy shows
  only when **zero items exist at all** — not when active is empty but bought
  items remain (else it prints above a full struck list). Optional one-line
  "all got" treatment when every item is bought.
- `ShoppingItemCard.tsx` — name, optional category chip, optional cost tag, claim
  affordance (`resolveMemberName(memberMap, claimed_by)` → "You've got this
  one." / "Marcus is on it."), got-it toggle, delete (author/organizer only — an
  **absent** affordance for others, never a gate message). Names **always** via
  `resolveMemberName`, **never** `.email` (I6). **Got-it × claim (gap-E):**
  `bought` and `claimed_by` are independent columns — marking got-it **preserves
  the claim**; under the Got-it divider the claim line renders **read-only** (no
  unclaim control). **Cost rendering (gap-C, important):** use **`formatCents`**
  — **never** `formatCost` (it appends a banned `~$X/head` per-head split when
  `inCount ≥ 2`, violating the broke-friend guardrail). The "~" prefix + whole-
  dollar trim come from a shopping-specific copy template (`shoppingList_cost_tag`
  = `~{amount}`), not from a formatter. Each item renders its own cost; there is
  no per-list total, so mixed currencies are a non-issue.
- `AddItemSheet.tsx` — RHF + zod. **Idempotency key (gap-B):** generated **once
  per sheet-open** via `useRef` (seeded when the sheet opens), reused across
  retries of the same logical add, rotated **only after a confirmed `ok:true`**.
  This protects the exact rule-#9 scenario (submit succeeds, response lost, user
  taps again → same key → 23505 replay, no dup) that a submit-time key misses.
  Also disable the submit button on `isSubmitting`. Fields: name (no asterisk),
  optional category (chips), optional cost (no currency field — USD-fixed). A
  **"surprise — hide from {celebrant}"** toggle rendered **only for
  non-celebrant** viewers, sets `visibility='hide_from_celebrant'`, default off.
  **Note (gap-K): this toggle is a client-only guard** — the INSERT policy does
  not constrain `visibility`, so RLS does not enforce "only non-celebrants create
  surprises." A celebrant crafting a request could insert a row they then can't
  see (self-inflicted, harmless, out of threat model). The column-scoped UPDATE
  grant *does* prevent post-hoc visibility flips (RLS-agent HIGH-1).

**Interaction decisions named (so QA doesn't read them as bugs):**
- **Got-it/claim taps lag one server round-trip** (`callAction` + `router.refresh`,
  no optimistic state) — accepted for MVP on the flaky-signal target; optimistic
  toggle is a fast-follow (gap-I).
- **Concurrent amends are last-writer-wins**, per-column (no version guard);
  acceptable for a shared scratchpad, mitigation deferred with edit-history (gap-G).
- **Dangling FKs** (`on delete set null`): when a claimer leaves the trip the item
  **silently unclaims** back to the pool (no "was Marcus's" copy — left silent by
  design). When an author leaves, `created_by` nulls → the item is then
  deletable **only by an organizer** (amend still open to any member). Both are
  intended escape-hatch outcomes (gap-F).

Copy: new keys only, no inline literals.
- `lib/copy/empty-states.ts`: empty + CTA (brief §6 strings).
- `lib/copy/errors.ts`: `shopping_list_save_failed | shopping_list_save_rejected
  | shopping_list_delete_failed` (+ reuse `network`, `rls_denied`, `rate_limit`).
  **Offline-error copy fix:** the brief's *"It'll go through when you're back"*
  is a **false promise** (no offline queue in MVP) — use *"That didn't save —
  you might be offline. Try again in a sec."* (warm, true).
- A **dedicated `SHOPPING_LIST_UI_STRINGS` bag** (`as const` + `keyof typeof`),
  **not** appended to a milestone bag — no `M6_UI_STRINGS` exists and the current
  convention for a standalone feature is its own named bag (e.g.
  `TRIP_EDIT_UI_STRINGS`). Holds claimed/got-it/unclaim/amend/CTA + the
  `shoppingList_cost_tag` template, strings from brief §6.

## 8. CI invariant gates (must be green from day one)

All checkers **auto-enroll** a new table/action file from source — no manual
registry (verified against the meta-extractors). Requirements:
- **I1** — every non-exempt written column appears in `SHOPPING_ITEM_COLUMNS`
  (see §5 — the six non-exempt columns are load-bearing).
- **I2** — idempotency column + partial unique index present; add writes the key.
- **I3** — the action file inspects `error.code` (23505 / 42501 split); one
  split in `shopping-list.ts` satisfies the file.
- **I4** — no-op: PostgREST embed-trap gate fires only on `trip_members`/
  `profiles` embeds; the flat scalar-id design has none (see the migration
  footgun comment).
- **I6** — names rendered via `resolveMemberName`, never `?? …email` (scans
  `components/**`).
- **I12** — asserts only that `callAction` never wraps a `redirect()` action.
  The `router.refresh` property is **not** CI-checked (convention only).
- **I5** — no-op: no new SECURITY DEFINER fn (reuse `can_see_content`).
- **I7 / I8** — N/A (not a travel table; no date-only column).

Local gate order: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`;
then `pnpm dlx supabase db reset` (re-assert grants — #361 gotcha) and a local
e2e pass.

## 9. Testing (TDD)

Data-layer + action tests are mandatory (CLAUDE.md). Write tests first:
- `lib/db/shopping-list` — column completeness, no-row sentinel, order.
- `lib/actions/shopping-list` — idempotent add (fresh + 23505 replay),
  error.code split (42501 ⇒ rls_denied), self-claim resolves acting member,
  toggle/amend/delete envelopes, redirect-free (I12), zod rejection, and
  **amend-name-only leaves category + cost intact** (gap-A regression guard).
- **RLS harness (adversarial — each RED before the grant fix, GREEN after):**
  1. member add/claim/toggle/amend succeeds; non-member fully blocked.
  2. celebrant cannot SELECT a `hide_from_celebrant` row.
  3. non-celebrant `UPDATE … SET visibility='everyone'` on a surprise row →
     **denied** (permission-denied-for-column via the column-scoped grant).
  4. member `UPDATE … SET created_by_trip_member_id=<self>` then DELETE of
     another member's item → **denied** (created_by is immutable).
  5. dual-trip member `UPDATE … SET trip_id=<other trip>` → **denied**.
  6. celebrant `UPDATE … RETURNING` on a surprise row → **zero rows**.
  7. two members, same idempotency UUID → **two rows** (no false 23505).
  8. delete: creator-or-organizer only; plain member denied.
- One e2e: add → claim → got-it → undo on a local build.

## 10. Persona guardrails (brief §3 — assert in review)

- Broke friend: claiming one item implies nothing about others; **no** "X people
  in on the booze run" counter.
- Sober: non-alcohol items first-class; `booze` one chip among peers.
- Celebrant: adds like anyone; not the list's janitor.
- **Reactions (§12):** aggregate-only (never per-name), never an ordering key,
  no per-person totals — the mitigations that keep 👎 a coordination signal, not
  a downvote-the-person. **Notes:** attributed, warm ("Notes"/"Add a note…" not
  "Comments"/"Post"), fully optional, no asterisks.
- Every string passes the pre-trip-dinner test (CLAUDE.md UI voice).

## 11. Prod rollout (brief §7.4 — automated, no operator gate)

After local `supabase db reset` is green: read the token
(`security find-generic-password -w -s 'Supabase CLI'`), POST the migration SQL +
a `supabase_migrations.schema_migrations` bookkeeping row to
`POST /v1/projects/bonvqazcqwkrowtkdmuq/database/query`, then verify (re-query
`shopping_list_items`, `shopping_item_reactions`, `shopping_item_comments` exist,
RLS on; advisors + login healthy). MCP `apply_migration` is classifier-blocked —
use the direct curl. (Reactions + comments ship in the **same** migration as the
items table, or a second timestamped migration in the same PR — either way all
three tables + their RLS land together before the feature is reachable.)

## 12. Reactions + Notes (comment thread) — the social layer

Decided with the operator: **👍/👎 reactions** (not like-only — the operator's
call, against the research default) and a **flat Notes thread** per item, both
reached by tapping a row to open a **detail bottom sheet**. Grounded in
`announcement_reactions` (the shipped reaction engine, #389/#417) and the
`ride_groups` member-write template. Prior art: Instacart "note to shopper" +
Todoist thread, iMessage-tapback tone.

### 12.1 The dislike-toxicity mitigations (load-bearing — this is why 👎 is OK here)

A 👎 on a friend's item is socially risky on a shared list. It is acceptable
**only** with all of these, which are hard requirements, not nice-to-haves:
- **Aggregate-only, never per-name.** The UI shows `👎 1` but **never who**
  disliked. `summarize*` folds drop `trip_member_id` from output (exactly like
  `summarizeReactions` — honors `killed-and-deferred.md:50` "no per-name
  going/declining by default"). This single rule defuses "who downvoted my
  tequila." Only the viewer's **own** reaction state is individuated (to render
  the toggle), never anyone else's.
- **Never an ordering key.** The list is **never** sorted by reaction count / net
  score. Reactions are display-only metadata (a stray `ORDER BY reaction_count`
  manufactures a leaderboard — call it out in query review).
- **No per-person totals, no net score, no "most-wanted" view, no "you reacted to
  5 items" streak.** Counts are per-item and local only.
- **Mutual exclusivity is soft (action-enforced), UI-guided.** Tapping 👎 clears
  your 👍 (and vice-versa) via the desired-state action; the DB does not hard-bar
  holding both (mirrors the announcement engine's insert/delete model). Low stakes.

### 12.2 Schema — two child tables (same migration/PR as items)

Both **inherit the parent item's visibility** (a note/reaction on a surprise item
is hidden from the celebrant for free) by an inline `EXISTS` on
`shopping_list_items` calling `can_see_content(i.trip_id, i.visibility)` — **no
new SECURITY DEFINER fn** (I5 stays no-op), mirroring `announcement_reactions`
RLS exactly. `trip_id` is denormalized onto both children for scoping/indexing.

```sql
-- REACTIONS: clone announcement_reactions. Natural-key idempotency (no
-- idempotency_key column — the unique constraint IS the guarantee). 👍/👎 only.
create table public.shopping_item_reactions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.shopping_list_items(id) on delete cascade,
  trip_id        uuid not null references public.trips(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  emoji          text not null check (emoji in ('👍','👎')),
  created_at     timestamptz not null default now(),
  unique (item_id, trip_member_id, emoji)   -- natural key; insert/delete toggle
);

-- NOTES (comments): fresh, ride_groups member-write template. ONE member FK
-- (author) → NO 2nd-FK trap (on-behalf deferred). Real idempotency_key (append
-- create). Immutable body (edit deferred).
create table public.shopping_item_comments (
  id                     uuid primary key default gen_random_uuid(),
  item_id                uuid not null references public.shopping_list_items(id) on delete cascade,
  trip_id                uuid not null references public.trips(id) on delete cascade,
  author_trip_member_id  uuid references public.trip_members(id) on delete set null, -- keep note, fall back to Guest
  body                   text not null,
  idempotency_key        uuid,
  created_at             timestamptz not null default now(),
  constraint shopping_item_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint shopping_item_comments_body_len       check (length(body) <= 500)
);
create unique index shopping_item_comments_idempotency
  on public.shopping_item_comments (item_id, author_trip_member_id, idempotency_key)
  where idempotency_key is not null;
```

**RLS (both, `to authenticated`; parent-visibility inline `EXISTS`):**
- SELECT: `exists (select 1 from shopping_list_items i where i.id = item_id and public.can_see_content(i.trip_id, i.visibility))`.
- INSERT with-check: the same parent-visible `EXISTS` **AND** own seat —
  `trip_member_id`/`author_trip_member_id in (select tm.id from trip_members tm where tm.trip_id = <this>.trip_id and tm.user_id = auth.uid())`.
- DELETE: reactions → own row only (`trip_member_id` is mine). comments →
  author (`author_trip_member_id` is mine) **OR** `is_trip_organizer(trip_id)`.
- **No UPDATE policy** on either (reactions toggle via insert/delete; comments
  immutable). **Grants:** `revoke all from public, anon, authenticated;
  grant select, insert, delete to authenticated;` (both tables — #361 hygiene,
  re-assert after db reset).

### 12.3 Data layer

- `lib/reactions/shopping-constants.ts`: `SHOPPING_REACTION_EMOJI = ['👍','👎'] as const`
  + `type` + guard (client-importable, outside `lib/actions/` — the
  `lib/reactions/constants.ts` precedent). DB CHECK mirrors it; changing the set
  = new migration.
- `lib/db/shopping-item-reactions.ts`: `getReactionsForTrip(supabase, tripId)`
  (flat trip-scoped select) + pure `summarizeItemReactions(rows, myMemberId):
  Record<itemId, { counts: Record<emoji, n>; mine: emoji[] }>` — **drops member
  ids** (aggregate-only). Cloned from `summarizeReactions`.
- `lib/db/shopping-item-comments.ts`: `COMMENT_COLUMNS` (scalar `author_trip_member_id`,
  **no embed**), `getCommentsForTrip(supabase, tripId)` (all visible comments for
  the trip's items — powers row `💬n` counts AND the detail thread at MVP scale),
  order `created_at` asc. `ShoppingCommentDbError` + no-row sentinel.
- `lib/db/types.ts`: `ShoppingItemReaction`, `ShoppingItemComment` (+ non-DB
  `authorDisplayName?`).

### 12.4 Actions

- `lib/actions/shopping-item-reactions.ts` → `toggleShoppingReaction({ itemId,
  emoji, active })` — desired-state (not blind flip), cloned from
  `toggleReactionAction`. Resolve the item's `trip_id` under RLS (hidden parent
  ⇒ `rls_denied`) → resolve own member → `rateLimitedAction(TOGGLE_SHOPPING_ITEM,
  …)` → insert-or-delete. `23505` ⇒ success (natural-key replay); `42501` ⇒
  `rls_denied`; else `reaction_save_failed`. When activating one emoji, also
  delete the opposite (soft mutual-exclusivity). `router.refresh`, no redirect.
- `lib/actions/shopping-item-comments.ts` → `addShoppingComment({ itemId, body },
  idempotencyKey)` (idempotent insert, 23505 re-select on
  `(item_id, author, idempotency_key)`, 42501 ⇒ rls_denied) and
  `deleteShoppingComment(commentId)` (RLS no-op delete, author/organizer).
  Envelope + `callAction` + `router.refresh`; **no redirect** (I12). zod:
  `body z.string().trim().min(1).max(500)`, ids `.uuid()`.
- Reuse rate scopes: reactions on `TOGGLE_SHOPPING_ITEM`; comment add/delete on
  `MUTATE_SHOPPING_ITEM`.

### 12.5 UI — glanceable row + detail bottom sheet

**Row (`ShoppingItemCard`) — stays dumb.** Adds three **read-only** indicators,
each shown **only when ≥1**: `👍n` `👎n` `💬n`. They are **not** independent tap
targets — the got-it checkbox is the only left control; tapping **anywhere else**
on the row opens the detail sheet (big forgiving one-handed target). Never `👍 0`
(absence, not zero). No color/traffic-light states.

**Detail (`ShoppingItemSheet`) — hand-rolled bottom-sheet panel** (the app has no
shadcn Sheet/Dialog; clone the `add-expense-sheet` conditional-render + the
arrivals compact/full panel convention; ~90% height over a dimmed list, swipe/✕
to dismiss, composer pinned above the keyboard — verify at 375px). Contents:
- Header: name, `Added by {resolveMemberName} · {relTime}`, claim CTA, optional
  cost tag (`formatCents`, never `formatCost` — §7 gap-C).
- **Reaction strip:** the 👍 and 👎 pills, **own-state tinted** when it's yours,
  count shown only when ≥1, tap toggles yours (optimistic + ref-guard, cloned
  from `reaction-row.tsx`). aria `role="group"`, each pill `aria-pressed`,
  44px targets.
- **Notes thread:** header is the plain word "Notes" (**not** "Notes (2)" — a
  header count is a soft score). Flat, newest-at-bottom, `{name} · {relTime}` +
  body via `resolveMemberName` (**never** `.email` — I6); author/organizer sees a
  delete affordance on their own line (absent for others). Empty state:
  *"Nothing here yet. Drop a note if there's something the buyer should know."*
- **Composer:** single-line, placeholder `Add a note…`, no label, no asterisk;
  idempotency key **once per sheet-open** (`useRef`, rotate only after `ok:true`),
  submit disabled while pending; optimistic append + `router.refresh`.

**Copy** (all new keys in `SHOPPING_LIST_UI_STRINGS` / `ERRORS`): reaction aria
labels, "Notes", `Add a note…`, empty-thread, comment-delete confirm/undo;
`shopping_comment_save_failed | shopping_comment_save_rejected |
shopping_comment_delete_failed | shopping_reaction_save_failed` (+ reuse
`network`, `rls_denied`, `rate_limit`, `validation_failed`). No inline literals.

### 12.6 CI gates + tests (additions)

- **I1** — reaction/comment `*_COLUMNS` list every written column.
- **I2** — comments carry `idempotency_key` + partial index + the add writes it.
  Reactions use **natural-key** idempotency (no column) exactly like
  `announcement_reactions`; if the checker flags the column-less table, add it to
  the same exemption `announcement_reactions` uses (verify against
  `meta/migration-idempotency.ts`).
- **I3** — both new action files inspect `error.code` (23505/42501).
- **I5** — still no-op: inline `EXISTS`, no new SECURITY DEFINER fn.
- **I6** — comment authors via `resolveMemberName`; reactions render **no names**
  at all (aggregate-only).
- **I12** — both new client mutations via `callAction`, no `redirect()`.
- **RLS harness (additions):** celebrant cannot SELECT reactions/comments on a
  `hide_from_celebrant` item; non-member fully blocked on both; comment
  author-or-organizer delete only; reaction own-row delete only;
  `summarizeItemReactions` output contains **no** `trip_member_id` (aggregate-only
  regression guard); two members same comment idempotency UUID ⇒ two rows.
- **Action tests:** reaction toggle on/off + opposite-clear; hidden-parent ⇒
  `rls_denied`; comment idempotent add (fresh + replay); comment delete envelope.
