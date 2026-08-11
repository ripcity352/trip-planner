# Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared, per-trip shopping list as a standalone page (add / claim / got-it / amend / delete), then stack a social layer (👍 like on the row, 👎 + fuller emoji set + Notes thread in a tap-in detail sheet).

**Architecture:** One flat `shopping_list_items` table cloned from `ride_groups` (column/RLS/idempotency hygiene) + `announcements` (boolean setter/delete patterns). Standalone route reached from a dashboard link-card, mirroring the arrivals page. Server Components by default; mutations via Server Actions returning `{ ok; errorKey }` envelopes, called from client components through `callAction` + `router.refresh`. RLS is the access-control source of truth. **PR1 = core list; PR2 = social layer, stacked.**

**Tech Stack:** Next.js 16 (App Router) + TypeScript strict, Supabase (Postgres + RLS), Tailwind + shadcn/ui, react-hook-form + zod, date-fns, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-11-shopping-list-design.md` (read it — every task references a section).

## Global Constraints

- **Package manager:** pnpm only (never npm/yarn).
- **DB access only through `/lib/db/`** — never `supabase.from(...)` in a route/component.
- **Mutations via Server Actions**, accept a client `idempotency_key`, return `{ ok: true; … } | { ok: false; errorKey: ErrorKey }`. No `redirect()` in a mutation reached via `callAction` (I12). Use `router.refresh()` client-side, not `revalidatePath`.
- **RLS in the same migration as any new table.** Every user-scoped query scopes by `trip_id`. Multi-tenant: no global data.
- **Visibility-first:** every content table ships `visibility trip_visibility not null default 'everyone'`. `hide_from_celebrant` rows are fully absent to the celebrant (existing `can_see_content` does this).
- **Idempotency:** mutation tables ship `idempotency_key uuid` + partial unique index; the insert writes the key.
- **Currency:** every money column ships a `currency char(3) not null default 'USD'` sibling.
- **Grant hygiene (#361):** `revoke all from public, anon, authenticated;` then grant explicitly to `authenticated`; re-assert after `db reset`.
- **No inline copy literals** — pull from `lib/copy/errors.ts` / `lib/copy/empty-states.ts`. New standalone-feature strings go in a **dedicated `SHOPPING_LIST_UI_STRINGS` bag** (`as const` + `keyof typeof`), not a milestone bag (no `M6_UI_STRINGS` exists).
- **Names via `resolveMemberName`** (`@/lib/utils/member-display`), never `.email` (I6). Content-author fallback is **"Someone"** (`announcements_author_fallback`), not "Guest".
- **Strict types** — no `any` without an eslint-disable + reason. Immutability — never mutate, spread new objects. Files 200–400 lines typical, 800 max.
- **Hard-banned UI:** no progress bar / "X/Y bought" completion score, no leaderboard, no streaks/badges, no required-field asterisks, no red/green traffic-light states, no per-name reaction lists, no reaction set > ~6 fixed emoji.
- **UI voice:** warm, irreverent, occasion-specific — passes "would you say this at a pre-trip dinner?" Copy strings from spec §6 / §12.
- **Local gate order per PR:** `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`; then `pnpm dlx supabase db reset` (re-assert grants) + local e2e. Then apply the migration to prod via the Management API (spec §11).

---

# PR1 — Core shopping list

Branch: `feat/shopping-list` (already created). Ships add / claim / got-it / amend / delete on a standalone page. No reactions/comments.

## File structure (PR1)

- Create: `supabase/migrations/<timestamp>_shopping_list.sql` — table + RLS + grants.
- Modify: `lib/db/types.ts` — add `ShoppingItem` + `ShoppingItemPatch`.
- Create: `lib/db/shopping-list.ts` — `SHOPPING_ITEM_COLUMNS`, `getShoppingItems`, `ShoppingListDbError`, `SHOPPING_ITEM_NO_ROW`, `setItemBought`, `setItemClaim`, `amendItem`, `deleteItem`.
- Create: `lib/db/__tests__/shopping-list.test.ts`.
- Create: `lib/actions/shopping-list.ts` — `addShoppingItem`, `toggleBought`, `setClaim`, `amendShoppingItem`, `deleteShoppingItem`.
- Create: `lib/actions/__tests__/shopping-list.test.ts`.
- Modify: `lib/rate-limit/index.ts` — add 3 scopes (+ 1 `SCOPE_BUDGETS` override).
- Modify: `lib/copy/errors.ts` — add 3 error keys.
- Modify: `lib/copy/empty-states.ts` — add `SHOPPING_LIST_UI_STRINGS` bag + empty-state key(s).
- Create: `app/(authed)/trips/[tripId]/shopping-list/page.tsx` + `loading.tsx`.
- Create: `components/trip/shopping-list/ShoppingList.tsx`, `ShoppingItemCard.tsx`, `AddItemSheet.tsx`.
- Modify: `app/(authed)/trips/[tripId]/page.tsx` — dashboard link-card.
- Create: `supabase/tests/shopping_list_rls.test.sql` (or the repo's RLS-harness location — confirm in Task 7).
- Create: `e2e/shopping-list.spec.ts` (confirm e2e dir in Task 8).

---

### Task 1: Migration — table + RLS + grants

**Files:**
- Create: `supabase/migrations/<timestamp>_shopping_list.sql` (timestamp = next after `20260811000000`, e.g. `20260811010000`)
- Reference (read, clone shape): `supabase/migrations/20260810040000_ride_groups.sql`, `supabase/migrations/20260519123255_m1_foundation.sql:140-188` (enum + `can_see_content`).

**Interfaces:**
- Produces: table `public.shopping_list_items` with columns `id, trip_id, created_by_trip_member_id, claimed_by_trip_member_id, name, category, bought, cost_cents, currency, visibility, idempotency_key, created_at`; RLS policies `_select/_insert/_update/_delete`; column-scoped UPDATE grant.

- [ ] **Step 1: Confirm the current migration tip** so the timestamp is monotonic.

Run: `ls supabase/migrations | sort | tail -5`
Expected: newest is `20260811000000_*`. Pick a later timestamp (e.g. `20260811010000`).

- [ ] **Step 2: Write the migration file** (spec §4, exact SQL):

```sql
-- Shopping list: one flat member-write table per trip. Clones ride_groups
-- column/RLS/idempotency hygiene + announcements setter patterns.
-- FOOTGUN: TWO FKs into trip_members (created_by + claimed_by). NEVER add a bare
-- trip_members(...) PostgREST embed to the columns select — returns HTTP 300.
-- Both ids stay scalar; names resolve app-side via resolveMemberName.

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_trip_member_id uuid references public.trip_members(id) on delete set null,
  claimed_by_trip_member_id uuid references public.trip_members(id) on delete set null,
  name text not null,
  category text,
  bought boolean not null default false,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  currency char(3) not null default 'USD',
  visibility public.trip_visibility not null default 'everyone',
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  constraint shopping_list_items_name_not_blank check (length(btrim(name)) > 0),
  constraint shopping_list_items_name_len      check (length(name) <= 200),
  constraint shopping_list_items_category_len  check (category is null or length(category) <= 80)
);

create unique index shopping_list_items_idempotency
  on public.shopping_list_items (trip_id, created_by_trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index shopping_list_items_trip on public.shopping_list_items (trip_id);

alter table public.shopping_list_items enable row level security;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.can_see_content(trip_id, visibility));

create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id and tm.user_id = auth.uid()
    )
  );

-- UPDATE gate symmetric with read; column scope (grant below) pins the immutable cols.
create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (public.can_see_content(trip_id, visibility))
  with check (public.can_see_content(trip_id, visibility));

create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

revoke all on public.shopping_list_items from public, anon, authenticated;
grant select, insert, delete on public.shopping_list_items to authenticated;
-- COLUMN-SCOPED update: only mutable coordination columns. Omitting
-- visibility/trip_id/created_by/idempotency_key/id makes them immutable-after-insert.
grant update (name, category, bought, claimed_by_trip_member_id, cost_cents, currency)
  on public.shopping_list_items to authenticated;
```

- [ ] **Step 3: Reset local DB to apply + verify it loads clean.**

Run: `pnpm dlx supabase db reset`
Expected: completes without error; the new migration is listed as applied.

- [ ] **Step 4: Verify the table + column-scoped grant exist.**

Run (psql via docker — confirm the container name with `docker ps | grep supabase_db`):
```bash
docker exec supabase_db_Party-Trip psql -U postgres -c "\d+ public.shopping_list_items"
docker exec supabase_db_Party-Trip psql -U postgres -c "select privilege_type, column_name from information_schema.column_privileges where table_name='shopping_list_items' and grantee='authenticated' and privilege_type='UPDATE';"
```
Expected: table with all columns + RLS enabled; UPDATE column-privileges list exactly `name, category, bought, claimed_by_trip_member_id, cost_cents, currency`.

- [ ] **Step 5: Re-assert grants (the #361 gotcha) if the reset stripped DML**, then commit.

If `db reset` left `authenticated` without the grants (see `project_local_db_grants_broken`), re-run the `grant` statements via `docker exec … psql`. Then:
```bash
git add supabase/migrations/<timestamp>_shopping_list.sql
git commit -m "feat(db): shopping_list_items table + member-write RLS + column-scoped update grant"
```

---

### Task 2: Data layer — types, columns, query, setters

**Files:**
- Modify: `lib/db/types.ts` (add types near the `Announcement` / ride-group types)
- Create: `lib/db/shopping-list.ts`
- Create: `lib/db/__tests__/shopping-list.test.ts`
- Reference: `lib/db/announcements.ts` (DbError, `{ count: "exact" }` setter/delete), `lib/db/ride-groups.ts` (query shape).

**Interfaces:**
- Consumes: Supabase client type used elsewhere in `lib/db` (match `announcements.ts` import).
- Produces:
  - `interface ShoppingItem { id: string; trip_id: string; created_by_trip_member_id: string | null; claimed_by_trip_member_id: string | null; name: string; category: string | null; bought: boolean; cost_cents: number | null; currency: string; visibility: TripVisibility; idempotency_key: string | null; created_at: string }`
  - `interface ShoppingItemPatch { name?: string; category?: string | null; cost_cents?: number | null }`
  - `const SHOPPING_ITEM_COLUMNS: string`
  - `const SHOPPING_ITEM_NO_ROW = "shopping_item_no_row"`
  - `class ShoppingListDbError extends Error { readonly code: string | null }`
  - `getShoppingItems(supabase, tripId: string): Promise<ShoppingItem[]>`
  - `setItemBought(supabase, itemId: string, bought: boolean): Promise<void>`
  - `setItemClaim(supabase, itemId: string, claimedByTripMemberId: string | null): Promise<void>`
  - `amendItem(supabase, itemId: string, patch: ShoppingItemPatch): Promise<void>`
  - `deleteItem(supabase, itemId: string): Promise<void>`

- [ ] **Step 1: Add the types to `lib/db/types.ts`.**

```ts
export interface ShoppingItem {
  id: string;
  trip_id: string;
  created_by_trip_member_id: string | null;
  claimed_by_trip_member_id: string | null;
  name: string;
  category: string | null;
  bought: boolean;
  cost_cents: number | null;
  currency: string;
  visibility: TripVisibility;
  idempotency_key: string | null;
  created_at: string;
}

// Partial-patch for amend: undefined = leave unchanged; null = explicitly clear.
export interface ShoppingItemPatch {
  name?: string;
  category?: string | null;
  cost_cents?: number | null;
}
```

- [ ] **Step 2: Write the failing test** `lib/db/__tests__/shopping-list.test.ts`.

Clone the mocking style from `lib/db/__tests__/announcements.test.ts` (read it first for the Supabase-client mock helper). Cover: (a) `SHOPPING_ITEM_COLUMNS` contains every non-exempt written column; (b) `getShoppingItems` orders by `created_at` asc and throws on error; (c) `amendItem` sends **only** the keys present in the patch (undefined keys absent from the update payload); (d) setters/delete throw `ShoppingListDbError` with `SHOPPING_ITEM_NO_ROW` when `count` is 0.

```ts
import { describe, it, expect, vi } from "vitest";
import {
  SHOPPING_ITEM_COLUMNS, getShoppingItems, amendItem, setItemBought,
  ShoppingListDbError, SHOPPING_ITEM_NO_ROW,
} from "../shopping-list";

const REQUIRED_COLUMNS = [
  "name", "category", "bought", "claimed_by_trip_member_id",
  "cost_cents", "currency", "visibility",
]; // the non-exempt written columns (I1)

describe("SHOPPING_ITEM_COLUMNS", () => {
  it("includes every non-exempt written column", () => {
    for (const col of REQUIRED_COLUMNS) expect(SHOPPING_ITEM_COLUMNS).toContain(col);
  });
});

describe("amendItem partial patch", () => {
  it("sends only the keys present in the patch", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as never;
    await amendItem(supabase, "item-1", { name: "3 handles" });
    const [payload] = update.mock.calls[0];
    expect(payload).toEqual({ name: "3 handles" }); // no category/cost keys
  });
});

describe("setItemBought no-row", () => {
  it("throws SHOPPING_ITEM_NO_ROW when nothing matched", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
        }),
      }),
    } as never;
    await expect(setItemBought(supabase, "missing", true)).rejects.toMatchObject({
      code: SHOPPING_ITEM_NO_ROW,
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

Run: `pnpm test lib/db/__tests__/shopping-list.test.ts`
Expected: FAIL — module `../shopping-list` not found.

- [ ] **Step 4: Implement `lib/db/shopping-list.ts`** (mirror `announcements.ts`).

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShoppingItem, ShoppingItemPatch } from "./types";

export const SHOPPING_ITEM_COLUMNS =
  "id, trip_id, created_by_trip_member_id, claimed_by_trip_member_id, name, category, bought, cost_cents, currency, visibility, idempotency_key, created_at";

export const SHOPPING_ITEM_NO_ROW = "shopping_item_no_row";

export class ShoppingListDbError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ShoppingListDbError";
    this.code = code;
  }
}

export async function getShoppingItems(
  supabase: SupabaseClient,
  tripId: string,
): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(SHOPPING_ITEM_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getShoppingItems failed: ${error.message}`);
  return (data ?? []) as ShoppingItem[];
}

async function runCounted(
  query: PromiseLike<{ error: { code?: string | null } | null; count: number | null }>,
): Promise<void> {
  const { error, count } = await query;
  if (error) throw new ShoppingListDbError(error.message ?? "update failed", error.code ?? null);
  if (!count) throw new ShoppingListDbError("matched no row", SHOPPING_ITEM_NO_ROW);
}

export function setItemBought(supabase: SupabaseClient, itemId: string, bought: boolean) {
  return runCounted(
    supabase.from("shopping_list_items").update({ bought }, { count: "exact" }).eq("id", itemId),
  );
}

export function setItemClaim(
  supabase: SupabaseClient, itemId: string, claimedByTripMemberId: string | null,
) {
  return runCounted(
    supabase.from("shopping_list_items")
      .update({ claimed_by_trip_member_id: claimedByTripMemberId }, { count: "exact" })
      .eq("id", itemId),
  );
}

export function amendItem(supabase: SupabaseClient, itemId: string, patch: ShoppingItemPatch) {
  // Build payload from ONLY the keys present — undefined = leave, null = clear.
  const payload: Record<string, unknown> = {};
  if ("name" in patch && patch.name !== undefined) payload.name = patch.name;
  if ("category" in patch) payload.category = patch.category ?? null;
  if ("cost_cents" in patch) payload.cost_cents = patch.cost_cents ?? null;
  return runCounted(
    supabase.from("shopping_list_items").update(payload, { count: "exact" }).eq("id", itemId),
  );
}

export function deleteItem(supabase: SupabaseClient, itemId: string) {
  return runCounted(
    supabase.from("shopping_list_items").delete({ count: "exact" }).eq("id", itemId),
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `pnpm test lib/db/__tests__/shopping-list.test.ts`
Expected: PASS (all three suites).

- [ ] **Step 6: Commit.**

```bash
git add lib/db/types.ts lib/db/shopping-list.ts lib/db/__tests__/shopping-list.test.ts
git commit -m "feat(db): shopping-list data layer — columns, query, setters, amend-patch discipline"
```

---

### Task 3: Rate-limit scopes + copy keys + UI-strings bag

**Files:**
- Modify: `lib/rate-limit/index.ts` (`RATE_LIMIT_SCOPES`, `SCOPE_BUDGETS`)
- Modify: `lib/copy/errors.ts` (`ErrorKey` union + `ERRORS`)
- Modify: `lib/copy/empty-states.ts` (new `SHOPPING_LIST_UI_STRINGS` bag + `EMPTY_STATES`/`EMPTY_STATE_CTAS`)
- Reference: existing `TOGGLE_REACTION` scope, `ride_group_*` error keys, `TRIP_EDIT_UI_STRINGS` bag.

**Interfaces:**
- Produces: `RATE_LIMIT_SCOPES.CREATE_SHOPPING_ITEM`, `.TOGGLE_SHOPPING_ITEM`, `.MUTATE_SHOPPING_ITEM`; `ErrorKey` members `shopping_list_save_failed | shopping_list_save_rejected | shopping_list_delete_failed`; `SHOPPING_LIST_UI_STRINGS` + `SHOPPING_LIST_UI_STRINGS` key type; empty-state key `shopping_list_empty` (+ CTA).

- [ ] **Step 1: Add the three rate-limit scopes** to `RATE_LIMIT_SCOPES` in `lib/rate-limit/index.ts`, following the `TOGGLE_REACTION` pattern:

```ts
  CREATE_SHOPPING_ITEM: "createShoppingItem",
  TOGGLE_SHOPPING_ITEM: "toggleShoppingItem", // high-tap: got-it/claim (and PR2 reactions)
  MUTATE_SHOPPING_ITEM: "mutateShoppingItem", // amend/delete (and PR2 comments)
```

Add a `SCOPE_BUDGETS` override bumping the high-tap bucket (bursty prep):
```ts
  [RATE_LIMIT_SCOPES.TOGGLE_SHOPPING_ITEM]: { limit: 60, windowSeconds: 60 },
```

- [ ] **Step 2: Add the error keys** to `lib/copy/errors.ts` — extend the `ErrorKey` union and `ERRORS` record (warm, blame-free, mirroring `ride_group_*`):

```ts
  shopping_list_save_failed: "That didn't save — you might be offline. Try again in a sec.",
  shopping_list_save_rejected: "That didn't go through. Give it another shot.",
  shopping_list_delete_failed: "Couldn't remove that one. Try again in a sec.",
```

- [ ] **Step 3: Add the UI-strings bag + empty state** to `lib/copy/empty-states.ts`:

```ts
export const SHOPPING_LIST_UI_STRINGS = {
  heading: "Shopping list",
  addCta: "What are we bringing?",
  namePlaceholder: "e.g. 2 handles of tequila",
  costLabel: "Rough cost (optional)",
  surpriseToggle_template: "Surprise — hide from {name}",
  claimCta: "I've got this",
  claimedByYou: "You've got this one.",
  claimedBy_template: "{name} is on it.",
  gotIt: "Got it. One less thing.",
  unclaim: "Off your plate.",
  gotItDivider: "Got it",
  categorySnacks: "snacks",
  categoryBooze: "booze",
  categorySupplies: "supplies",
  categoryGear: "gear",
} as const;
export type ShoppingListUiStringKey = keyof typeof SHOPPING_LIST_UI_STRINGS;
```

Add to `EMPTY_STATES` + `EMPTY_STATE_CTAS`:
```ts
  shopping_list_empty: "List's empty. Snacks, booze, sunscreen, the aux cable — throw it on before you forget.",
```

- [ ] **Step 4: Typecheck** (these are compile-checked records).

Run: `pnpm typecheck`
Expected: PASS (the `ErrorKey` / `EmptyStateKey` records stay exhaustive).

- [ ] **Step 5: Commit.**

```bash
git add lib/rate-limit/index.ts lib/copy/errors.ts lib/copy/empty-states.ts
git commit -m "feat(copy): shopping-list rate scopes, error keys, SHOPPING_LIST_UI_STRINGS bag"
```

---

### Task 4: Server actions

**Files:**
- Create: `lib/actions/shopping-list.ts`
- Create: `lib/actions/__tests__/shopping-list.test.ts`
- Reference: `lib/actions/ride-groups.ts` (envelope, `resolveMemberId`, `rateLimitedAction`, 23505/42501 split), `lib/actions/announcements.ts` (idempotent insert + re-select).

**Interfaces:**
- Consumes: Task 2 db fns; Task 3 scopes + error keys; `createClient` from `@/lib/supabase/server`; `callAction` envelope contract.
- Produces (all `Promise<{ ok: true; … } | { ok: false; errorKey: ErrorKey }>`):
  - `addShoppingItem(input: { tripId: string; name: string; category?: string | null; costCents?: number | null; visibility?: TripVisibility }, idempotencyKey: string)`
  - `toggleBought(itemId: string, bought: boolean)`
  - `setClaim(itemId: string, claimed: boolean)`
  - `amendShoppingItem(itemId: string, patch: { name?: string; category?: string | null; costCents?: number | null })`
  - `deleteShoppingItem(itemId: string)`

- [ ] **Step 1: Write failing action tests** `lib/actions/__tests__/shopping-list.test.ts` (clone the mock harness from `lib/actions/__tests__/ride-groups.test.ts`). Cover: (a) `addShoppingItem` returns `{ ok:true }` on insert; (b) on `23505` it re-selects by `(trip_id, created_by, idempotency_key)` and returns ok (replay); (c) `42501` ⇒ `{ ok:false, errorKey:"rls_denied" }`; (d) `setClaim(itemId, true)` resolves the acting member and writes their id; `setClaim(itemId, false)` writes null; (e) invalid input (blank name) ⇒ `validation_failed`; (f) no action calls `redirect`.

(Write concrete cases using the cloned harness — do not leave as prose.)

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm test lib/actions/__tests__/shopping-list.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/shopping-list.ts`.** Structure (mirror `ride-groups.ts` — one `ShoppingActionError`, one `toErrorResult`, a `resolveMemberId` helper):
  - `"use server"` at top; zod: `IDEMPOTENCY_KEY_SCHEMA = z.string().uuid()`; `addSchema = z.object({ tripId: z.string().uuid(), name: z.string().trim().min(1).max(120), category: z.string().trim().max(40).transform(v => v || null).nullable().optional(), costCents: z.number().int().min(0).max(100_000_00).nullable().optional(), visibility: z.enum(["everyone","organizers_only","hide_from_celebrant","custom"]).optional() })`; `amendSchema` similar without tripId.
  - `addShoppingItem`: validate key + input → `createClient()` → `getUser()` (null ⇒ `rls_denied`) → `resolveMemberId` (null ⇒ `rls_denied`) → `rateLimitedAction(CREATE_SHOPPING_ITEM, userId, …)` inserting `{ trip_id, created_by_trip_member_id, name, category, cost_cents, currency: 'USD', visibility, idempotency_key }`. On `23505` re-select `SHOPPING_ITEM_COLUMNS` by `(trip_id, created_by_trip_member_id, idempotency_key)` `.single()`; `42501` ⇒ `rls_denied`; else `code ? save_rejected : save_failed`. Success ⇒ `router.refresh` is caller-side, so just return `{ ok:true }` (no `revalidatePath`, no `redirect`).
  - `toggleBought` → `setItemBought`; `setClaim` → resolve acting member, `setItemClaim(itemId, claimed ? memberId : null)`; `amendShoppingItem` → map `costCents`→`cost_cents`, call `amendItem`; `deleteShoppingItem` → `deleteItem`. Each wraps db calls in `rateLimitedAction` (TOGGLE_ for toggle/claim, MUTATE_ for amend/delete), maps `ShoppingListDbError` (`42501`/`SHOPPING_ITEM_NO_ROW` ⇒ the right key) to the envelope.

- [ ] **Step 4: Run tests to verify pass.**

Run: `pnpm test lib/actions/__tests__/shopping-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Full unit run + typecheck + lint.**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS (invariant checkers I1/I2/I3/I12 green for the new files).

- [ ] **Step 6: Commit.**

```bash
git add lib/actions/shopping-list.ts lib/actions/__tests__/shopping-list.test.ts
git commit -m "feat(actions): shopping-list add/toggle/claim/amend/delete — idempotent, envelope, error-split"
```

---

### Task 5: Page, loading, dashboard card

**Files:**
- Create: `app/(authed)/trips/[tripId]/shopping-list/page.tsx`, `loading.tsx`
- Modify: `app/(authed)/trips/[tripId]/page.tsx` (link-card)
- Reference: `app/(authed)/trips/[tripId]/arrivals/page.tsx` (exact server-page shape), the arrivals dashboard `<Link>` at `page.tsx:376`.

**Interfaces:**
- Consumes: `getShoppingItems` (Task 2), trip-member loader + `getTripBySlug`/`getViewerMember` (from the arrivals page — reuse the same imports), `ShoppingList` (Task 6).
- Produces: route `/trips/[tripId]/shopping-list`.

- [ ] **Step 1: Write `page.tsx`** mirroring arrivals: resolve trip by slug (pass **`trip.id`**), `auth.getUser()`, `getViewerMember`, `notFound()` guards, `Promise.all([getShoppingItems(supabase, trip.id), <tripMembers loader>])`, render `<ShoppingList items=… tripMembers=… tripId={trip.id} viewer=… />` inside `<section className="mx-auto w-full max-w-3xl px-4 py-6">` with an `<h1>` from `SHOPPING_LIST_UI_STRINGS.heading`. (Read arrivals for the exact member-loader fn name.)

- [ ] **Step 2: Write `loading.tsx`** — clone `arrivals/loading.tsx` (skeleton).

- [ ] **Step 3: Add the dashboard link-card** in `app/(authed)/trips/[tripId]/page.tsx` next to the arrivals card: `<Link href={`/trips/${trip.slug}/shopping-list`}>` with label `Shopping list`. **No claimed/total subtitle** (item count at most). Match the arrivals card's classes.

- [ ] **Step 4: Build + smoke the route renders.**

Run: `pnpm build`
Expected: builds; `/trips/[tripId]/shopping-list` compiles. (Full click-through is Task 8.)

- [ ] **Step 5: Commit.**

```bash
git add "app/(authed)/trips/[tripId]/shopping-list/page.tsx" "app/(authed)/trips/[tripId]/shopping-list/loading.tsx" "app/(authed)/trips/[tripId]/page.tsx"
git commit -m "feat(ui): shopping-list route + loading + dashboard link-card"
```

---

### Task 6: Components — list, card, add sheet

**Files:**
- Create: `components/trip/shopping-list/ShoppingList.tsx`, `ShoppingItemCard.tsx`, `AddItemSheet.tsx`
- Create: `components/trip/shopping-list/__tests__/ShoppingList.test.tsx` (if the repo tests components; otherwise rely on e2e — confirm by checking for existing component tests)
- Reference: `components/trip/expenses/add-expense-sheet.tsx` (RHF+zod+callAction+idempotency-at-submit), `components/trip/arrivals/*` (card + memberMap build), `formatCents` in `lib/utils/format-cents.ts`.

**Interfaces:**
- Consumes: Task 4 actions, `callAction` (`@/lib/ui/call-action`), `resolveMemberName`, `SHOPPING_LIST_UI_STRINGS`, `ERRORS`, `formatCents`.
- Produces: `<ShoppingList items tripMembers tripId viewer />` (client).

- [ ] **Step 1: `ShoppingList.tsx`** (client) — build the `memberMap` from `tripMembers`; partition `items` into active vs `bought`; render active list, then a `SHOPPING_LIST_UI_STRINGS.gotItDivider` divider (no count) + struck bought items; empty state (`shopping_list_empty`) **only when `items.length === 0`**; render `<AddItemSheet tripId viewer />`.

- [ ] **Step 2: `ShoppingItemCard.tsx`** — name, optional category chip, optional cost via `formatCents(cost_cents, currency)` rendered as `~{amount}` (no `formatCost`), claim affordance (`resolveMemberName(memberMap, claimed_by)` → `claimedByYou` / `claimedBy_template`), got-it toggle (strike + reversible), delete affordance **only** for author/organizer (absent otherwise). Each mutating control wraps the action in `callAction`, then `router.refresh()`; on `!ok` set a local `errorKey` and render `ERRORS[errorKey]` in a `role="alert"`.

- [ ] **Step 3: `AddItemSheet.tsx`** — clone `add-expense-sheet.tsx`: RHF + zod, **idempotency key at submit** (`crypto.randomUUID()` in `onSubmit`), fields name (no asterisk) / category chips / optional cost; a `surpriseToggle_template` toggle rendered **only for non-celebrant** `viewer`, setting `visibility='hide_from_celebrant'`. On `ok`: `reset()`, close, `router.refresh()`.

- [ ] **Step 4: Typecheck + lint + build + design-system check.**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS; I6 (no `.email` render) green.

- [ ] **Step 5: Commit.**

```bash
git add components/trip/shopping-list/
git commit -m "feat(ui): ShoppingList + ShoppingItemCard + AddItemSheet"
```

---

### Task 7: RLS harness

**Files:**
- Create: the RLS test at the repo's harness location (confirm — search `supabase/tests` or the pattern used by `ride_groups`; e.g. `supabase/tests/shopping_list_rls.test.sql` or a TS harness).
- Reference: the existing ride-groups RLS harness (find it: `grep -rl "ride_group" supabase/tests lib` and match the convention).

**Interfaces:** none (test-only). Asserts the spec §9 adversarial cases.

- [ ] **Step 1: Write the harness** covering, each RED before Task 1's grants and GREEN after: (1) member add/claim/toggle/amend ok, non-member blocked; (2) celebrant cannot SELECT a `hide_from_celebrant` row; (3) non-celebrant `UPDATE … SET visibility='everyone'` on a surprise row → denied (column grant); (4) member `UPDATE … SET created_by=self` → denied (immutable); (5) dual-trip member `UPDATE … SET trip_id=other` → denied; (6) celebrant `UPDATE … RETURNING` on surprise → 0 rows; (7) two members same idempotency UUID → two rows; (8) delete creator-or-organizer only.

- [ ] **Step 2: Run the harness against local DB.**

Run: the repo's RLS-harness command (match how ride-groups' harness runs).
Expected: all cases PASS.

- [ ] **Step 3: Commit.**

```bash
git add <harness path>
git commit -m "test(rls): shopping-list adversarial RLS harness (8 cases)"
```

---

### Task 8: E2E + full local gate + prod migration

**Files:**
- Create: `e2e/shopping-list.spec.ts` (confirm e2e dir/convention; reuse the fixture user + local-Supabase setup per `verify-against-local-supabase` memory).

- [ ] **Step 1: Write one e2e** — sign in as the fixture user, open `/trips/<slug>/shopping-list`, add an item, claim it, mark got-it, undo. Assert each transition (wait on `aria-pressed`/text, not timing — per `scripted-walk-hydration` memory).

- [ ] **Step 2: Run the full local gate.**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all PASS (all invariant checkers green).

- [ ] **Step 3: `db reset` + re-assert grants + run e2e locally.**

Run: `pnpm dlx supabase db reset` then the grant re-assert (if needed) then the e2e command.
Expected: e2e passes against local Supabase.

- [ ] **Step 4: Commit + open PR1.**

```bash
git add e2e/shopping-list.spec.ts
git commit -m "test(e2e): shopping-list add→claim→got-it→undo"
git push -u origin feat/shopping-list
gh pr create --title "feat: shared shopping list (core)" --body "<summary + test plan; link the spec>"
```

- [ ] **Step 5: After green CI + review + merge — apply the migration to prod** (spec §11, `migration-apply-automated` memory): local `db reset` green first → read `security find-generic-password -w -s 'Supabase CLI'` → POST the migration SQL + a `supabase_migrations.schema_migrations` row to `POST /v1/projects/bonvqazcqwkrowtkdmuq/database/query` → verify (`shopping_list_items` exists, RLS on, advisors + login healthy). Direct curl (MCP `apply_migration` is classifier-blocked).

---

## PR1 review gate

Before opening PR1: pair `security-reviewer` + `code-reviewer` on the migration + `lib/actions/shopping-list.ts` (CLAUDE.md rule). Address CRITICAL/HIGH before merge. Confirm the design-system PR checklist (microcopy voice, focus ring, reduced-motion, no vibecoded bans).

---

# PR2 — Social layer (task outline; detailed into bite-sized steps after PR1 merges)

> **Why outlined, not bite-sized yet:** PR2 clones PR1's just-created files + the shipped `announcement_reactions` engine. Per the `wave-worktree-timing` lesson, its exact clone targets (and PR1's final signatures) should be real before writing its TDD steps. Branch `feat/shopping-list-social` off merged `main`. Detail this into full steps at that point.

Spec §12 is the source. Tasks:

- **P2-T1 — Migration:** `shopping_item_reactions` (natural-key `unique(item_id, trip_member_id, emoji)`, emoji CHECK `('👍','👎','❤️','🔥','😂','🍻')`) + `shopping_item_comments` (idempotency_key + partial index, body len checks). RLS: parent-visibility inline `EXISTS` **with the `i.trip_id = child.trip_id` pin**; own-seat INSERT; reaction own-row DELETE; comment author-or-organizer DELETE; **no UPDATE policy** on either. Grants `select, insert, delete` on both (normal SELECT — no facts view). RLS harness (spec §12.7). db-reset-green.
- **P2-T2 — Reaction data layer + constants:** `lib/reactions/shopping-constants.ts` (`SHOPPING_REACTION_EMOJI`, `ROW_LIKE_EMOJI='👍'`); `lib/db/shopping-item-reactions.ts` (`getReactionsForTrip` + server-side `summarizeItemReactions` dropping `trip_member_id`); `ShoppingItemReactionSummary` type. **Boundary test:** client prop carries no `trip_member_id`.
- **P2-T3 — Comment data layer:** `lib/db/shopping-item-comments.ts` (`COMMENT_COLUMNS` scalar author, `getCommentsForTrip`, "Someone" author-fallback resolution, `ShoppingCommentDbError`).
- **P2-T4 — Actions:** `toggleShoppingReaction` (clone `toggleReactionAction`, no opposite-clear); `addShoppingComment` (idempotent, key rotates per confirmed comment) + `deleteShoppingComment`.
- **P2-T5 — Row like affordance:** `ShoppingItemCard` gains an inline 👍 like (+ count ≥1) + `💬n` (≥1); no 👎/other emoji on the row; whole-row taps open the sheet (struck rows too).
- **P2-T6 — Detail bottom sheet:** `ShoppingItemSheet` (hand-rolled panel; header + claim + cost + full reaction strip incl 👎 with neutral aria labels + flat Notes thread + composer with per-comment key rotation + `shopping_item_gone` handling + freshness/no-realtime). Verify at 375px.
- **P2-T7 — Copy + gates + e2e + prod migration:** reaction/comment error keys, "Notes"/`Add a note…`/empty-thread/item-delete-confirm/`shopping_item_gone`; no-leaderboard order test; e2e (react → note → delete); full gate; apply PR2 migration to prod.

PR2 review gate: same `security-reviewer` + `code-reviewer` pairing, with specific attention to the aggregate-only boundary (server-side summarize) and the visibility-inheritance RLS.

---

## Self-review (against the spec)

- **Spec coverage:** §4 schema→T1; §5 data→T2; §6 actions→T4; §7 UI→T5/T6; §8 gates→every task's gate step; §9 tests→T2/T4/T7/T8; §11 prod→T8-S5; §12 social→PR2 outline. ✅
- **Type consistency:** `ShoppingItem`/`ShoppingItemPatch` (T2) consumed by T4/T5/T6; `SHOPPING_ITEM_COLUMNS`, `SHOPPING_ITEM_NO_ROW`, `ShoppingListDbError` names consistent T2↔T4; action names (`addShoppingItem`, `toggleBought`, `setClaim`, `amendShoppingItem`, `deleteShoppingItem`) consistent T4↔T6. ✅
- **Placeholders:** T1/T2/T3 fully coded; T4/T6/T7/T8 reference exact clone sources + deltas + real commands (clone-heavy boilerplate is cited to a specific shipped file rather than re-transcribed — legitimate DRY, not a placeholder). T4-S1 and T7 test bodies to be written from the cited harness during execution.
- **Open confirmations for the executor** (cheap, resolved in-task): exact docker DB container name (T1-S4), the RLS-harness location/command (T7), the e2e dir/convention (T8), the trip-member loader fn name on the arrivals page (T5).
