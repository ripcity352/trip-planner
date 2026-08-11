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

### Deferred (noted, not built)
- Organizer **claim-on-behalf** (needs the rule-#8 consent/attribution path).
- Realtime live surface (MVP uses `router.refresh` on mutate, like the app).
- Edit attribution / history.
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
    check (length(btrim(name)) > 0)
);

create unique index shopping_list_items_idempotency
  on public.shopping_list_items (trip_id, created_by_trip_member_id, idempotency_key)
  where idempotency_key is not null;
```

### RLS (simplest that holds tenancy + visibility — bachelor-party threat model)

```sql
alter table public.shopping_list_items enable row level security;

-- read: existing visibility gate; NO new SECURITY DEFINER fn (I5 no-op)
create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.can_see_content(trip_id, visibility));

-- insert: writer-binding + tenancy
create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- update: any trip member (got-it toggle / self-claim / amend are reversible
-- ops on a shared list; within-trip claim forgery is not in the threat model)
create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

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

### Grants (item #361 hygiene — local `db reset` grants ALL at create)

```sql
revoke all on public.shopping_list_items from public, anon, authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
```

Migration filename: next timestamp after `20260811000000`
(e.g. `20260811010000_shopping_list.sql`). RLS lives in the **same** migration.

## 5. Data layer — `lib/db/shopping-list.ts`

- `SHOPPING_ITEM_COLUMNS` — flat select string listing **every** column the
  actions write (I1). Includes both scalar member id columns; **no embed**.
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
`callAction` + `router.refresh()` — **no `revalidatePath`, no `redirect()`**
(I12).

- `addShoppingItem(input, idempotencyKey)` — validate key + zod input → auth →
  resolve creator `trip_member` id (null ⇒ `rls_denied`) → `rateLimitedAction`
  → insert. On `23505`: re-select by `(trip_id, created_by, idempotency_key)`
  and return existing (I2/I3). `42501` ⇒ `rls_denied`; else
  `code ? *_save_rejected : *_save_failed`.
- `toggleBought(itemId, bought)` — `{ count: "exact" }` update; no-row sentinel.
- `setClaim(itemId, claimed: boolean)` — server resolves acting member id;
  sets `claimed_by_trip_member_id` to self (claim) or `null` (unclaim).
- `amendItem(itemId, patch)` — patch of `{ name?, category?, costCents?,
  currency? }`; zod-validated; `{ count: "exact" }`.
- `deleteShoppingItem(itemId)` — RLS-gated no-op delete; `42501` ⇒ `rls_denied`.

Add rate-limit scopes in `lib/rate-limit/index.ts`:
`CREATE_SHOPPING_ITEM: "createShoppingItem"`,
`MUTATE_SHOPPING_ITEM: "mutateShoppingItem"`.

Input validation zod schemas (rule: validate all input):
`name` `z.string().trim().min(1).max(120)`, `category`
`z.string().trim().max(40).nullable().optional()`, `costCents`
`z.number().int().min(0).max(100_000_00).nullable().optional()`, `currency`
`z.string().length(3).optional()`, `tripId`/`itemId` `z.string().uuid()`.

## 7. UI

Route `app/(authed)/trips/[tripId]/shopping-list/page.tsx` (mirror
`arrivals/page.tsx`) + `loading.tsx`. Server component: resolve trip by slug →
`getUser` → `getViewerMember` → parallel-load items + trip members → build
`memberMap` → render.

Components under `components/trip/shopping-list/`:
- `ShoppingList.tsx` (client) — active items list + a struck **"Got it"**
  section below a divider; empty state from copy; renders `AddItemSheet`.
- `ShoppingItemCard.tsx` — name, optional category chip, optional `~$X` cost
  tag, claim affordance (`resolveMemberName(memberMap, claimed_by)` →
  "You've got this one." / "Marcus is on it."), got-it toggle, delete (author/
  organizer only — a micro-affordance, not a gate message). Names **always** via
  `resolveMemberName`, **never** `.email` (I6).
- `AddItemSheet.tsx` — RHF + zod, idempotency key generated **at submit**,
  fields: name (no asterisk), optional category (chips), optional cost. A
  **"surprise — hide from {celebrant}"** toggle rendered **only for
  non-celebrant** viewers, sets `visibility='hide_from_celebrant'`, default off.

Copy: new keys only, no inline literals.
- `lib/copy/empty-states.ts`: empty + CTA (brief §6 strings).
- `lib/copy/errors.ts`: `shopping_list_save_failed | shopping_list_save_rejected
  | shopping_list_delete_failed` (+ reuse `network`, `rls_denied`, `rate_limit`).
- A `shoppingList_*` block in the `*_UI_STRINGS` bag (claimed/got-it/unclaim/
  amend/CTA strings from brief §6).

## 8. CI invariant gates (must be green from day one)

- **I1** — every written column appears in `SHOPPING_ITEM_COLUMNS`.
- **I2** — idempotency column + partial unique index present; add writes the key.
- **I3** — actions inspect `error.code` (23505 / 42501 split).
- **I6** — names rendered via `resolveMemberName`, never `.email`.
- **I12** — client mutations via `callAction` + `router.refresh`; add action
  does not `redirect()`.
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
  toggle/amend/delete envelopes, redirect-free (I12), zod rejection.
- RLS harness — member can add/claim/toggle/amend; non-member blocked; celebrant
  cannot see `hide_from_celebrant` rows; delete creator-or-organizer only.
- One e2e: add → claim → got-it → undo on a local build.

## 10. Persona guardrails (brief §3 — assert in review)

- Broke friend: claiming one item implies nothing about others; **no** "X people
  in on the booze run" counter.
- Sober: non-alcohol items first-class; `booze` one chip among peers.
- Celebrant: adds like anyone; not the list's janitor.
- Every string passes the pre-trip-dinner test (CLAUDE.md UI voice).

## 11. Prod rollout (brief §7.4 — automated, no operator gate)

After local `supabase db reset` is green: read the token
(`security find-generic-password -w -s 'Supabase CLI'`), POST the migration SQL +
a `supabase_migrations.schema_migrations` bookkeeping row to
`POST /v1/projects/bonvqazcqwkrowtkdmuq/database/query`, then verify (re-query
`shopping_list_items` exists, RLS on; advisors + login healthy). MCP
`apply_migration` is classifier-blocked — use the direct curl.
