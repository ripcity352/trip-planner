# Itinerary Item Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat, immutable comment thread to each itinerary item ("plan"), scoped by the parent item's own visibility, mirroring the existing `poll_comments` feature (#620).

**Architecture:** New `itinerary_item_comments` table (near-verbatim clone of `poll_comments`'s schema/RLS/grants), a DB query layer + two server actions cloned from the poll-comments equivalents, and a single new client component (`ItemCommentSection`) that bundles a collapsed disclosure + thread + composer into one unit and mounts on `ItemCard`.

**Tech Stack:** Next.js 16 App Router Server Components, Supabase Postgres + RLS, react-hook-form-free plain controlled inputs, Vitest + Testing Library, zod, `date-fns`.

## Global Constraints

- Comments are immutable once posted (no UPDATE policy at all — the absence is the load-bearing guarantee) — spec §1.
- Flat thread, no replies/nesting — spec §1, §6.
- 500-char cap, non-blank constraint on `body` — spec §1.
- Visibility inherited from the parent `itinerary_items` row via `can_see_content(trip_id, visibility)` — spec §1.
- Delete: comment author or a trip organizer only — spec §1.
- Disclosure row is collapsed by default, always — no auto-expand-on-existing-comments — spec §3.
- No new UI primitives — reuse `resolveContentAuthorName`, `callAction`, `ERROR_LINE_CLASS`, `Button` — spec §3.
- `pnpm` only, never `npm`/`yarn`. TypeScript strict, no `any`. Tailwind utility classes only.
- Every new/modified server action file must pass `pnpm typecheck && pnpm lint && pnpm test` before a task is considered done.
- New migration file only — never edit an applied migration (per `notes/database-workflow.md` discipline referenced in CLAUDE.md).

---

### Task 1: Migration — `itinerary_item_comments` table, RLS, grants

**Files:**
- Create: `supabase/migrations/20260815010000_itinerary_item_comments.sql`

**Interfaces:**
- Produces: table `public.itinerary_item_comments` with columns `id, item_id, trip_id, author_trip_member_id, body, idempotency_key, created_at`. Every later DB/action task reads/writes exactly these column names.

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================
-- 20260815010000_itinerary_item_comments.sql
-- Flat comment thread on itinerary items ("plans").
--
-- Near-verbatim clone of 20260813010000_poll_comments.sql — same table
-- shape, same RLS pattern, same grants. Parent is `itinerary_items`
-- (not `polls`); visibility routes through the item's OWN
-- can_see_content(trip_id, visibility), the same helper itinerary_items'
-- own SELECT policy already uses (20260520052357_m3_itinerary_
-- announcements.sql: "itinerary: members read via visibility").
--
-- Scope: ONE flat thread per item, no nesting/replies. Comments are
-- immutable once posted — no UPDATE policy (absence is the load-bearing
-- guarantee — see the note below).
--
-- NO UPDATE POLICY — comments are immutable once posted. The ABSENCE of
--   a permissive UPDATE policy is itself the load-bearing immutability
--   guarantee: RLS default-denies, so even if a future #361-style
--   blanket grant-repair re-grants UPDATE at the table-privilege level,
--   there is still no policy that would authorize a row to be touched
--   (mirrors poll_comments / shopping_item_comments).
--
-- Grants (REQUIRED, #361 hygiene): revoke all from public/anon/
--   authenticated, then grant only select/insert/delete to
--   authenticated. No UPDATE grant — there is no UPDATE path.
-- =============================================================

create table public.itinerary_item_comments (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references public.itinerary_items(id) on delete cascade,
  -- Denormalized for RLS/scoping (poll_comments precedent). The INSERT
  -- policy pins it to the parent item's trip_id so it cannot lie.
  trip_id               uuid not null references public.trips(id) on delete cascade,
  -- ON DELETE SET NULL (not cascade): a departed member's comment stays
  -- in the thread as an orphaned/organizer-delete-only row (author
  -- fallback resolves to "Someone" app-side) rather than vanishing.
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

comment on table public.itinerary_item_comments is
  'Flat comment thread on itinerary items ("plans"). Visibility inherited from the parent item via can_see_content(item.trip_id, item.visibility). Immutable once posted — no UPDATE policy (absence is the load-bearing guarantee, survives a #361 blanket grant-repair). Delete: author or organizer. Author fallback is "Someone" (announcements_author_fallback), resolved app-side — never .email.';

comment on column public.itinerary_item_comments.trip_id is
  'Denormalized from the parent item for scoping; INSERT policy enforces it matches itinerary_items.trip_id (child-RLS trip_id pin).';

comment on column public.itinerary_item_comments.author_trip_member_id is
  'ON DELETE SET NULL — a departed author leaves the comment in place, orphaned (organizer-delete-only after that; app resolves display name to "Someone").';

-- =============================================================
-- RLS — same migration as the table, per house rule.
-- =============================================================

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
      select tm.id
      from public.trip_members tm
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
      select tm.id
      from public.trip_members tm
      where tm.trip_id = itinerary_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

-- NOTE: no UPDATE policy — comments are immutable once posted.

-- =============================================================
-- Grants (#361 hygiene — REQUIRED).
-- =============================================================

revoke all on public.itinerary_item_comments from public, anon, authenticated;
grant select, insert, delete on public.itinerary_item_comments to authenticated;

-- =============================================================
-- Realtime publication add — guarded, no-op when the
-- supabase_realtime publication doesn't exist (bare CI Postgres).
-- NOTE: the UI must NOT hard-depend on this — see the #349 pattern
-- (router.refresh() on the viewer's own mutation) in item-comment-section.tsx.
-- =============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.itinerary_item_comments';
  end if;
end
$$;

-- =============================================================
-- End of 20260815010000_itinerary_item_comments.sql
-- =============================================================
```

- [ ] **Step 2: Reset local Supabase and confirm the migration applies cleanly**

Run: `pnpm dlx supabase db reset`
Expected: exits 0, no errors; last lines show all migrations applied including `20260815010000_itinerary_item_comments`.

- [ ] **Step 3: Repair local grants (standing #361 gotcha — see `feedback_grant_repair_vs_revokes` memory)**

A clean `db reset` can leave `anon`/`authenticated` without DML on public tables depending on grant-repair ordering. Verify the new table's grants survived:

Run:
```bash
docker exec -i supabase_db_trip-planner psql -U postgres -c \
  "select grantee, privilege_type from information_schema.role_table_grants where table_name = 'itinerary_item_comments' order by grantee, privilege_type;"
```
Expected: rows for `authenticated` → `DELETE`, `INSERT`, `SELECT` only. No `UPDATE` row. No `anon` rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815010000_itinerary_item_comments.sql
git commit -m "feat(db): itinerary_item_comments table, RLS, grants"
```

---

### Task 2: `ItemComment` type

**Files:**
- Modify: `lib/db/types.ts` (add near `PollComment`, ~line 762)

**Interfaces:**
- Produces: `ItemComment` interface — `{ id, item_id, trip_id, author_trip_member_id, body, idempotency_key, created_at, authorDisplayName? }`. Every later task imports this type from `@/lib/db/types`.

- [ ] **Step 1: Add the type**

Insert after the closing `}` of `PollComment` (around line 762):

```typescript
/**
 * A flat comment on an itinerary item ("plan"). Mirrors `PollComment`
 * exactly — `author_trip_member_id` FKs `trip_members(id) ON DELETE SET
 * NULL` directly, so enrichment (`enrichItemComments`,
 * lib/db/itinerary-item-comments.ts) resolves it against a
 * trip_member_id-keyed map. null/missing resolves to
 * M3_UI_STRINGS.announcements_author_fallback ("Someone") at the UI
 * boundary, not "Guest" (resolveMemberName's roster fallback).
 */
export interface ItemComment {
  id: string;
  item_id: string;
  trip_id: string;
  author_trip_member_id: string | null;
  body: string;
  idempotency_key: string | null;
  created_at: string;
  authorDisplayName?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/types.ts
git commit -m "feat(types): add ItemComment"
```

---

### Task 3: `lib/db/itinerary-item-comments.ts` — query layer + tests

**Files:**
- Create: `lib/db/itinerary-item-comments.ts`
- Create: `lib/db/__tests__/itinerary-item-comments.test.ts`

**Interfaces:**
- Consumes: `ItemComment` from `@/lib/db/types` (Task 2); `M3_UI_STRINGS.announcements_author_fallback` from `@/lib/copy/empty-states` (already exists).
- Produces: `ITEM_COMMENT_COLUMNS: string`, `enrichItemComments(comments: readonly ItemComment[], memberMap: ReadonlyMap<string, string | null>): ItemComment[]`, `getItemComments(supabase, itemId: string): Promise<ItemComment[]>`, `getCommentsForTrip(supabase, tripId: string): Promise<ItemComment[]>`, `deleteComment(supabase, commentId: string): Promise<void>`, `ItemCommentDbError` class (`.code: string | null`), `ITEM_COMMENT_NO_ROW: string` sentinel. Task 6 (actions) and the page (Task 9) import all of these.

- [ ] **Step 1: Write the failing test file**

```typescript
/**
 * Tests for `lib/db/itinerary-item-comments.ts`.
 *
 * Tests:
 *   1. `ITEM_COMMENT_COLUMNS` — scalar author_trip_member_id (no embed),
 *      every ItemComment read column present.
 *   2. `getItemComments` — orders created_at ASC, scoped to one item,
 *      empty/null data, throws on Supabase error.
 *   3. `getCommentsForTrip` — same shape, scoped to a trip.
 *   4. `enrichItemComments` — the "Someone" author-fallback resolver.
 *   5. `deleteComment` — exact-count delete, ITEM_COMMENT_NO_ROW on a
 *      zero-row match, error.code preserved on failure.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import {
  ITEM_COMMENT_COLUMNS,
  ITEM_COMMENT_NO_ROW,
  ItemCommentDbError,
  deleteComment,
  enrichItemComments,
  getCommentsForTrip,
  getItemComments,
} from "../itinerary-item-comments";
import type { ItemComment } from "../types";

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? {
          data: [],
          error: null,
        };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "__calls") return calls;
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  const proxies: Record<string, Record<string, unknown>> = {};
  const from = vi.fn((table: string) => {
    proxies[table] = proxies[table] ?? buildProxy(table);
    return proxies[table];
  });

  return { from } as unknown as SupabaseClient;
}

function makeSequencedBuilder(
  responses: Array<{ data: unknown; error: unknown; count?: number | null }>
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = [...responses];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") {
        const next = queue.shift() ?? { data: null, error: null };
        const p = Promise.resolve(next);
        return p.then.bind(p);
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "99999999-9999-4999-8999-999999999999";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

const mockComment: ItemComment = {
  id: "comment-1",
  item_id: ITEM_ID,
  trip_id: TRIP_ID,
  author_trip_member_id: MEMBER_ID,
  body: "What time are we actually leaving?",
  idempotency_key: null,
  created_at: "2026-08-15T10:00:00.000Z",
};

describe("ITEM_COMMENT_COLUMNS", () => {
  it("includes every ItemComment DB column, scalar (no embed)", () => {
    const columns = ITEM_COMMENT_COLUMNS.split(",").map((c) => c.trim());
    const expectedColumns = [
      "id",
      "item_id",
      "trip_id",
      "author_trip_member_id",
      "body",
      "idempotency_key",
      "created_at",
    ];
    for (const col of expectedColumns) {
      expect(columns).toContain(col);
    }
    expect(ITEM_COMMENT_COLUMNS).not.toContain("(");
  });
});

describe("getItemComments", () => {
  it("returns comments on success", async () => {
    const client = makeClient({
      itinerary_item_comments: () => ({ data: [mockComment], error: null }),
    });
    const result = await getItemComments(client, ITEM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("What time are we actually leaving?");
  });

  it("orders by created_at ascending (flat thread, oldest first) and scopes by item_id", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: [mockComment], error: null },
    ]);

    await getItemComments(client as unknown as SupabaseClient, ITEM_ID);

    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "item_id",
      ITEM_ID,
    ]);
    expect(calls.find((c) => c.method === "order")?.args).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("returns empty array when no comments", async () => {
    const client = makeClient({
      itinerary_item_comments: () => ({ data: [], error: null }),
    });
    const result = await getItemComments(client, ITEM_ID);
    expect(result).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      itinerary_item_comments: () => ({ data: null, error: null }),
    });
    const result = await getItemComments(client, ITEM_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      itinerary_item_comments: () => ({
        data: null,
        error: { message: "rls denied" },
      }),
    });
    await expect(getItemComments(client, ITEM_ID)).rejects.toThrow(
      "getItemComments failed: rls denied"
    );
  });
});

describe("getCommentsForTrip", () => {
  it("returns comments on success, scoped by trip_id", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: [mockComment], error: null },
    ]);

    const result = await getCommentsForTrip(
      client as unknown as SupabaseClient,
      TRIP_ID
    );
    expect(result).toHaveLength(1);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "trip_id",
      TRIP_ID,
    ]);
    expect(calls.find((c) => c.method === "order")?.args).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      itinerary_item_comments: () => ({ data: null, error: null }),
    });
    const result = await getCommentsForTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      itinerary_item_comments: () => ({
        data: null,
        error: { message: "boom" },
      }),
    });
    await expect(getCommentsForTrip(client, TRIP_ID)).rejects.toThrow(
      "getCommentsForTrip failed: boom"
    );
  });
});

describe("enrichItemComments", () => {
  const memberMap = new Map<string, string | null>([
    [MEMBER_ID, "Dave"],
    ["member-no-name", null],
  ]);

  it("resolves authorDisplayName from the map by author_trip_member_id", () => {
    const [result] = enrichItemComments([mockComment], memberMap);
    expect(result.authorDisplayName).toBe("Dave");
  });

  it('resolves to "Someone" (announcements_author_fallback) when author_trip_member_id is null', () => {
    const orphan: ItemComment = { ...mockComment, author_trip_member_id: null };
    const [result] = enrichItemComments([orphan], memberMap);
    expect(result.authorDisplayName).toBe(
      M3_UI_STRINGS.announcements_author_fallback
    );
    expect(result.authorDisplayName).toBe("Someone");
  });

  it('resolves to "Someone" when author_trip_member_id is missing from the map (departed member)', () => {
    const gone: ItemComment = {
      ...mockComment,
      author_trip_member_id: "member-departed",
    };
    const [result] = enrichItemComments([gone], memberMap);
    expect(result.authorDisplayName).toBe(
      M3_UI_STRINGS.announcements_author_fallback
    );
  });

  it('resolves to "Someone" (not "Guest") when the member has no display_name', () => {
    const anon: ItemComment = {
      ...mockComment,
      author_trip_member_id: "member-no-name",
    };
    const [result] = enrichItemComments([anon], memberMap);
    expect(result.authorDisplayName).toBe("Someone");
    expect(result.authorDisplayName).not.toBe("Guest");
  });

  it("does not mutate the input rows", () => {
    const input = { ...mockComment };
    enrichItemComments([input], memberMap);
    expect(input).toEqual(mockComment);
  });
});

describe("deleteComment", () => {
  it("deletes by id with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);

    await deleteComment(client as unknown as SupabaseClient, "comment-1");

    expect(calls.find((c) => c.method === "delete")?.args[0]).toEqual({
      count: "exact",
    });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "comment-1",
    ]);
  });

  it("throws ITEM_COMMENT_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);

    const err = await deleteComment(
      client as unknown as SupabaseClient,
      "comment-1"
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(ItemCommentDbError);
    expect((err as ItemCommentDbError).code).toBe(ITEM_COMMENT_NO_ROW);
  });

  it("preserves error.code on failure", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: { code: "42501", message: "rls" }, count: null },
    ]);

    const err = await deleteComment(
      client as unknown as SupabaseClient,
      "comment-1"
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(ItemCommentDbError);
    expect((err as ItemCommentDbError).code).toBe("42501");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/db/__tests__/itinerary-item-comments.test.ts`
Expected: FAIL — `Cannot find module '../itinerary-item-comments'`.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Itinerary-item-comments data layer — query functions for the
 * `itinerary_item_comments` table (migration 20260815010000).
 *
 * A FLAT thread (no replies/nesting) attached to an itinerary item.
 * Near-direct clone of `lib/db/poll-comments.ts`, re-keyed by
 * `item_id` against `itinerary_items` / `itinerary_item_comments`.
 * `author_trip_member_id` FKs `trip_members(id) ON DELETE SET NULL`
 * directly, so the enrichment map here is keyed by
 * `trip_member_id → display_name`.
 *
 * Author enrichment: `authorDisplayName` is resolved **post-fetch** via
 * `enrichItemComments` and a `memberMap`. A null `author_trip_member_id`
 * or a miss against the map (member left the trip) resolves to
 * `M3_UI_STRINGS.announcements_author_fallback` ("Someone") — NOT
 * `resolveMemberName`'s "Guest", which is the wrong context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ItemComment } from "./types";

/** Flat column list — scalar author, no join. */
export const ITEM_COMMENT_COLUMNS =
  "id, item_id, trip_id, author_trip_member_id, body, idempotency_key, created_at";

/**
 * Resolves `authorDisplayName` for each comment by looking up
 * `author_trip_member_id` in `memberMap` (keyed by
 * `trip_member_id → display_name`). A null author or a map miss/null
 * display_name resolves to M3_UI_STRINGS.announcements_author_fallback
 * ("Someone") — applied here, not deferred to the render layer, so
 * every caller gets a consistent value.
 */
export function enrichItemComments(
  comments: readonly ItemComment[],
  memberMap: ReadonlyMap<string, string | null>
): ItemComment[] {
  return comments.map((row) => ({
    ...row,
    authorDisplayName:
      (row.author_trip_member_id
        ? memberMap.get(row.author_trip_member_id)
        : null) ?? M3_UI_STRINGS.announcements_author_fallback,
  }));
}

/**
 * Return all comments on one itinerary item, ordered oldest-first
 * (flat thread, chronological). RLS filters via the parent item's
 * visibility (can_see_content()).
 */
export async function getItemComments(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItemComment[]> {
  const { data, error } = await supabase
    .from("itinerary_item_comments")
    .select(ITEM_COMMENT_COLUMNS)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getItemComments failed: ${error.message}`);
  }

  return (data ?? []) as ItemComment[];
}

/**
 * Return all comments across every itinerary item the caller can see
 * for a trip, ordered oldest-first — the bulk read the itinerary page
 * uses to fold comments onto each item server-side (mirrors
 * `getCommentsForTrip` in the poll-comments precedent). RLS filters
 * rows invisible to the caller via the parent item's visibility.
 */
export async function getCommentsForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<ItemComment[]> {
  const { data, error } = await supabase
    .from("itinerary_item_comments")
    .select(ITEM_COMMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getCommentsForTrip failed: ${error.message}`);
  }

  return (data ?? []) as ItemComment[];
}

/** Sentinel code for a write that matched no row. */
export const ITEM_COMMENT_NO_ROW = "item_comment_no_row";

/** Carries the Postgres error code so actions can map without text-matching. */
export class ItemCommentDbError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ItemCommentDbError";
    this.code = code;
  }
}

/**
 * Delete a comment. RLS (DELETE policy) restricts this to the comment's
 * author or an organizer — this function trusts the caller's action
 * layer to have authenticated; the actual gate is the RLS policy itself
 * (rule 5). No UPDATE policy exists on this table — comments are
 * immutable.
 */
export async function deleteComment(
  supabase: SupabaseClient,
  commentId: string
): Promise<void> {
  const { error, count } = await supabase
    .from("itinerary_item_comments")
    .delete({ count: "exact" })
    .eq("id", commentId);

  if (error) {
    throw new ItemCommentDbError(
      `deleteComment failed: ${error.message}`,
      error.code ?? null
    );
  }
  if (!count) {
    throw new ItemCommentDbError(
      "deleteComment matched no row",
      ITEM_COMMENT_NO_ROW
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/db/__tests__/itinerary-item-comments.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm exec eslint lib/db/itinerary-item-comments.ts lib/db/__tests__/itinerary-item-comments.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/db/itinerary-item-comments.ts lib/db/__tests__/itinerary-item-comments.test.ts
git commit -m "feat(db): itinerary-item-comments query layer"
```

---

### Task 4: Rate-limit scope

**Files:**
- Modify: `lib/rate-limit/index.ts` (add to `RATE_LIMIT_SCOPES`, ~line 229)

**Interfaces:**
- Produces: `RATE_LIMIT_SCOPES.MUTATE_ITEM_COMMENT === "mutateItemComment"`. Task 6's actions import this.

- [ ] **Step 1: Add the scope**

Insert immediately after the `ADD_POLL_OPTION: "addPollOption",` line (the last entry before the closing `} as const;`):

```typescript
  // Itinerary item comments — flat thread per plan. One shared bucket
  // for post + delete, mirroring MUTATE_POLL_COMMENT — a comment thread
  // is not a high-tap surface, so a single 30/60s budget is plenty.
  // Fail-OPEN on shim (a comment is content, not credential minting) —
  // same posture as the other authed trip-content mutations.
  MUTATE_ITEM_COMMENT: "mutateItemComment",
```

- [ ] **Step 2: Confirm no override entry is needed**

Grep for `MUTATE_POLL_COMMENT` in the per-scope override block below the `RATE_LIMIT_SCOPES` object (same file) — it has none, meaning it inherits the module `DEFAULT_LIMIT`/`DEFAULT_WINDOW` (30/60s). Confirm `MUTATE_ITEM_COMMENT` is not added there either, so it inherits the same default.

Run: `grep -n "MUTATE_POLL_COMMENT\|MUTATE_ITEM_COMMENT" lib/rate-limit/index.ts`
Expected: `MUTATE_POLL_COMMENT` appears only in the `RATE_LIMIT_SCOPES` object (not in any override map below it); `MUTATE_ITEM_COMMENT` likewise appears exactly once.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/rate-limit/index.ts
git commit -m "feat(rate-limit): add MUTATE_ITEM_COMMENT scope"
```

---

### Task 5: Copy keys — `M3_UI_STRINGS` + `errors.ts`

**Files:**
- Modify: `lib/copy/empty-states.ts` (add to `M3_UI_STRINGS`, near the existing `itinerary_maps_*` keys ~line 304)
- Modify: `lib/copy/errors.ts` (add to `ErrorKey` union ~line 259 and `ERRORS` map ~line 474)

**Interfaces:**
- Produces: `M3_UI_STRINGS.itinerary_item_comments_heading`, `.itinerary_item_comments_disclosure_zero`, `.itinerary_item_comments_disclosure_one`, `.itinerary_item_comments_disclosure_other_template`, `.itinerary_item_comments_empty`, `.itinerary_item_comment_author_line_template`, `.itinerary_item_comment_placeholder`, `.itinerary_item_comment_delete_confirm`, `.itinerary_item_comment_delete_aria`, `.itinerary_item_comment_delete_cta`, `.itinerary_item_comment_composer_submit_aria`. `ErrorKey` gains `"item_comment_save_failed" | "item_comment_save_rejected" | "item_comment_delete_failed"`, each with an `ERRORS[...]` string. Task 6 (actions) and Task 7 (component) consume all of these.

- [ ] **Step 1: Add `M3_UI_STRINGS` keys**

In `lib/copy/empty-states.ts`, insert immediately after the `itinerary_maps_google: "Google Maps",` line:

```typescript
  // Itinerary item comments — flat thread per plan, same shape as
  // polls_comment_* but item-scoped. Disclosure row is collapsed by
  // default (item cards are already dense) — the label itself carries
  // the count, no separate badge.
  itinerary_item_comments_disclosure_zero: "Add a comment",
  itinerary_item_comments_disclosure_one: "1 comment",
  itinerary_item_comments_disclosure_other_template: "{count} comments",
  itinerary_item_comments_heading: "Comments",
  itinerary_item_comments_empty: "Nothing here yet. Say something.",
  itinerary_item_comment_placeholder: "Add a comment…",
  itinerary_item_comment_author_line_template: "{name} · {when}",
  itinerary_item_comment_delete_cta: "Remove",
  itinerary_item_comment_delete_aria: "Delete comment",
  itinerary_item_comment_delete_confirm: "Remove this comment? Can't undo.",
  itinerary_item_comment_composer_submit_aria: "Send comment",
```

- [ ] **Step 2: Add `errors.ts` keys**

In `lib/copy/errors.ts`, in the `ErrorKey` union, insert immediately after the `| "poll_option_full";` line — change that line's trailing `;` to `` and add:

```typescript
  | "poll_option_full"
  // Itinerary item comments. Same transient/deterministic split as the
  // poll-comment keys above.
  | "item_comment_save_failed"
  | "item_comment_save_rejected"
  | "item_comment_delete_failed";
```

In the `ERRORS` map, insert immediately after the `poll_option_full: ...` entry (find it near the end of the poll write-in block):

```typescript
  // Itinerary item comments. Same transient/deterministic split as the
  // poll-comment strings above.
  item_comment_save_failed:
    "That comment didn't save — you might be offline. Try again in a sec.",
  item_comment_save_rejected:
    "That comment didn't go through. Give it another shot.",
  item_comment_delete_failed: "Couldn't remove that comment. Try again in a sec.",
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean (a missing `ERRORS` entry for any `ErrorKey` union member is a type error via the `Record<ErrorKey, string>` annotation — this is the test).

- [ ] **Step 4: Commit**

```bash
git add lib/copy/empty-states.ts lib/copy/errors.ts
git commit -m "feat(copy): itinerary item comment strings"
```

---

### Task 6: Server actions — `postItemCommentAction` / `deleteItemCommentAction` + tests

**Files:**
- Modify: `lib/actions/itinerary.ts` (add two actions + supporting schemas/types)
- Create: `lib/actions/__tests__/itinerary-item-comments-actions.test.ts`

**Interfaces:**
- Consumes: `ITEM_COMMENT_COLUMNS`, `ItemCommentDbError`, `ITEM_COMMENT_NO_ROW`, `deleteComment as deleteItemCommentRow` from `@/lib/db/itinerary-item-comments` (Task 3); `RATE_LIMIT_SCOPES.MUTATE_ITEM_COMMENT` (Task 4); `ErrorKey` variants from Task 5; `ItemComment` from `@/lib/db/types` (Task 2).
- Produces: `PostItemCommentInput { itemId: string; body: string }`, `PostItemCommentResult = { ok: true; comment: ItemComment } | { ok: false; errorKey: ErrorKey }`, `DeleteItemCommentInput { commentId: string }`, `DeleteItemCommentResult = { ok: true } | { ok: false; errorKey: ErrorKey }`, `postItemCommentAction(input, idempotencyKey): Promise<PostItemCommentResult>`, `deleteItemCommentAction(input, idempotencyKey): Promise<DeleteItemCommentResult>`. Task 7's `ItemCommentSection` and Task 9's page import both actions and both input/result types.

- [ ] **Step 1: Write the failing test file**

```typescript
/**
 * Tests for the item-comment actions in `lib/actions/itinerary.ts`:
 * `postItemCommentAction` / `deleteItemCommentAction`.
 *
 * Cloned from `lib/actions/__tests__/poll-comments-actions.test.ts` —
 * same queue-aware mock (successive calls to the same table pop the
 * next queued result), re-keyed to `itinerary_items` /
 * `itinerary_item_comments`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

const tableQueues = new Map<
  string,
  Array<{ data: unknown; error: unknown; count?: number | null }>
>();
const capturedWrites: Array<{ table: string; op: string; arg: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const rateLimitedActionMock = vi.fn(
  async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn()
);
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return {
    ...actual,
    rateLimitedAction: (...args: unknown[]) =>
      rateLimitedActionMock(
        args[0] as string,
        args[1] as string,
        args[2] as () => Promise<unknown>
      ),
  };
});

function nextResult(
  table: string
): { data: unknown; error: unknown; count?: number | null } {
  const q = tableQueues.get(table);
  if (!q || q.length === 0) return { data: null, error: null };
  return q.length === 1
    ? q[0]
    : (q.shift() as { data: unknown; error: unknown; count?: number | null });
}

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<{
      data: unknown;
      error: unknown;
      count?: number | null;
    }> = {
      then(onfulfilled) {
        return Promise.resolve(nextResult(table)).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "maybeSingle" || prop === "single") {
          return () => Promise.resolve(nextResult(table));
        }
        return (...args: unknown[]) => {
          if (prop === "insert" || prop === "delete") {
            capturedWrites.push({ table, op: prop, arg: args[0] });
          }
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };
  return {
    auth: { getUser: getUserMock },
    from: vi.fn((t: string) => tableProxy(t)),
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

const TRIP = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const KEY2 = "66666666-6666-4666-8666-666666666666";
const USER = "55555555-5555-4555-8555-555555555555";
const COMMENT_ID = "77777777-7777-4777-8777-777777777777";

const mockComment = {
  id: COMMENT_ID,
  item_id: ITEM,
  trip_id: TRIP,
  author_trip_member_id: MEMBER,
  body: "What time are we actually leaving?",
  idempotency_key: KEY,
  created_at: "2026-08-15T10:00:00.000Z",
};

/** Primes the item-lookup + member-lookup pair every action resolves first. */
function primeItemAndMember() {
  tableQueues.set("itinerary_items", [{ data: { trip_id: TRIP }, error: null }]);
  tableQueues.set("trip_members", [{ data: { id: MEMBER }, error: null }]);
}

let postItemCommentAction: typeof import("../itinerary").postItemCommentAction;
let deleteItemCommentAction: typeof import("../itinerary").deleteItemCommentAction;

beforeEach(async () => {
  getUserMock.mockReset();
  tableQueues.clear();
  capturedWrites.length = 0;
  rateLimitedActionMock.mockClear();
  revalidatePathMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const mod = await import("../itinerary");
  postItemCommentAction = mod.postItemCommentAction;
  deleteItemCommentAction = mod.deleteItemCommentAction;
});
afterEach(() => vi.resetModules());

describe("postItemCommentAction", () => {
  it("rejects a bad idempotency key", async () => {
    primeAuth(USER);
    const res = await postItemCommentAction(
      { itemId: ITEM, body: "hi" },
      "not-a-uuid"
    );
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a blank/whitespace-only body", async () => {
    primeAuth(USER);
    const res = await postItemCommentAction({ itemId: ITEM, body: "   " }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a body over 500 chars", async () => {
    primeAuth(USER);
    const res = await postItemCommentAction(
      { itemId: ITEM, body: "x".repeat(501) },
      KEY
    );
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a non-uuid itemId", async () => {
    primeAuth(USER);
    const res = await postItemCommentAction({ itemId: "nope", body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when unauthenticated", async () => {
    primeAuth(null);
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the item is invisible (hidden/non-member)", async () => {
    primeAuth(USER);
    tableQueues.set("itinerary_items", [{ data: null, error: null }]);
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the caller has no member row", async () => {
    primeAuth(USER);
    tableQueues.set("itinerary_items", [{ data: { trip_id: TRIP }, error: null }]);
    tableQueues.set("trip_members", [{ data: null, error: null }]);
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("inserts and returns ok:true on a fresh post, revalidating on success", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("itinerary_item_comments", [{ data: mockComment, error: null }]);

    const res = await postItemCommentAction(
      { itemId: ITEM, body: "What time are we actually leaving?" },
      KEY
    );
    expect(res).toEqual({ ok: true, comment: mockComment });

    const insert = capturedWrites.find(
      (w) => w.table === "itinerary_item_comments" && w.op === "insert"
    );
    expect(insert?.arg).toMatchObject({
      item_id: ITEM,
      trip_id: TRIP,
      author_trip_member_id: MEMBER,
      body: "What time are we actually leaving?",
      idempotency_key: KEY,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("re-selects on idempotency replay (23505) and returns the existing row", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: { code: "23505", message: "dup" } },
      { data: mockComment, error: null },
    ]);

    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: true, comment: mockComment });
  });

  it("two sequential posts with DIFFERENT idempotency keys insert two separate rows", async () => {
    primeAuth(USER);
    primeItemAndMember();
    const secondComment = {
      ...mockComment,
      id: "88888888-8888-4888-8888-888888888888",
      idempotency_key: KEY2,
    };
    tableQueues.set("itinerary_item_comments", [
      { data: mockComment, error: null },
      { data: secondComment, error: null },
    ]);

    const first = await postItemCommentAction(
      { itemId: ITEM, body: "First comment" },
      KEY
    );
    primeItemAndMember();
    const second = await postItemCommentAction(
      { itemId: ITEM, body: "Second comment" },
      KEY2
    );

    expect(first).toEqual({ ok: true, comment: mockComment });
    expect(second).toEqual({ ok: true, comment: secondComment });

    const inserts = capturedWrites.filter(
      (w) => w.table === "itinerary_item_comments" && w.op === "insert"
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.arg).toMatchObject({ idempotency_key: KEY });
    expect(inserts[1]?.arg).toMatchObject({ idempotency_key: KEY2 });
  });

  it("returns rls_denied on 42501, without revalidating", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns item_comment_save_rejected on a coded error", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: { code: "23514", message: "check constraint" } },
    ]);
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({
      ok: false,
      errorKey: "item_comment_save_rejected",
    });
  });

  it("returns item_comment_save_failed on a codeless error", async () => {
    primeAuth(USER);
    primeItemAndMember();
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: { code: "", message: "network hiccup" } },
    ]);
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "item_comment_save_failed" });
  });

  it("surfaces a rate-limit rejection", async () => {
    primeAuth(USER);
    primeItemAndMember();
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("mutateItemComment", { reset: 0, remaining: 0 })
    );
    const res = await postItemCommentAction({ itemId: ITEM, body: "hi" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});

describe("deleteItemCommentAction", () => {
  it("rejects a bad idempotency key", async () => {
    primeAuth(USER);
    const res = await deleteItemCommentAction(
      { commentId: COMMENT_ID },
      "not-a-uuid"
    );
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a non-uuid comment id", async () => {
    primeAuth(USER);
    const res = await deleteItemCommentAction({ commentId: "nope" }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when unauthenticated", async () => {
    primeAuth(null);
    const res = await deleteItemCommentAction({ commentId: COMMENT_ID }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns ok:true on a successful delete, revalidating on success", async () => {
    primeAuth(USER);
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: null, count: 1 },
    ]);
    const res = await deleteItemCommentAction({ commentId: COMMENT_ID }, KEY);
    expect(res).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(USER);
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: { code: "42501", message: "denied" } },
    ]);
    const res = await deleteItemCommentAction({ commentId: COMMENT_ID }, KEY);
    expect(res).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("is idempotent on double-tap: a no-row match converges to ok:true", async () => {
    primeAuth(USER);
    tableQueues.set("itinerary_item_comments", [
      { data: null, error: null, count: 0 },
    ]);
    const res = await deleteItemCommentAction({ commentId: COMMENT_ID }, KEY);
    expect(res).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/actions/__tests__/itinerary-item-comments-actions.test.ts`
Expected: FAIL — `postItemCommentAction`/`deleteItemCommentAction` are `undefined` (not yet exported from `../itinerary`).

- [ ] **Step 3: Add imports to `lib/actions/itinerary.ts`**

Near the top of the file, extend the existing import block (find `import { getItineraryItem } from "@/lib/db/itinerary";`) — add a new import line immediately after it:

```typescript
import {
  ITEM_COMMENT_COLUMNS,
  ITEM_COMMENT_NO_ROW,
  ItemCommentDbError,
  deleteComment as deleteItemCommentRow,
} from "@/lib/db/itinerary-item-comments";
```

Also extend the existing `import type { ItineraryItem } from "@/lib/db/types";` line to:

```typescript
import type { ItemComment, ItineraryItem } from "@/lib/db/types";
```

- [ ] **Step 4: Add schemas, types, and the two actions**

Append to the end of `lib/actions/itinerary.ts`:

```typescript
// ---------------------------------------------------------------------------
// Itinerary item comments — flat thread per plan (mirrors poll_comments).
// ---------------------------------------------------------------------------

const POST_ITEM_COMMENT_SCHEMA = z.object({
  itemId: z.string().uuid(),
  body: z.string().trim().min(1).max(500),
});

const DELETE_ITEM_COMMENT_SCHEMA = z.object({
  commentId: z.string().uuid(),
});

export interface PostItemCommentInput {
  itemId: string;
  body: string;
}

export type PostItemCommentResult =
  | { ok: true; comment: ItemComment }
  | { ok: false; errorKey: ErrorKey };

export interface DeleteItemCommentInput {
  commentId: string;
}

export type DeleteItemCommentResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

type ItemCommentErrorReason = "rls_denied" | "save_rejected" | "save_failed";

class ItemCommentActionError extends Error {
  readonly reason: ItemCommentErrorReason;
  constructor(reason: ItemCommentErrorReason) {
    super(`item_comment_action_error:${reason}`);
    this.name = "ItemCommentActionError";
    this.reason = reason;
  }
}

function itemCommentErrorKey(reason: ItemCommentErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "item_comment_save_rejected";
    case "save_failed":
      return "item_comment_save_failed";
  }
}

/**
 * Resolve the parent item's trip and the caller's own member row. The
 * item select runs under RLS — an item the caller can't see (wrong
 * trip, non-member, or hidden by visibility) resolves to null. Mirrors
 * `resolvePollCommentContext` in lib/actions/polls.ts.
 */
async function resolveItemCommentContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  userId: string
): Promise<{ tripId: string; tripMemberId: string } | null> {
  const { data: item } = await supabase
    .from("itinerary_items")
    .select("trip_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return null;
  const tripId = (item as { trip_id: string }).trip_id;

  const { data: member } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) return null;

  return { tripId, tripMemberId: (member as { id: string }).id };
}

/**
 * Post a comment to an itinerary item's thread. Idempotent on
 * (item_id, author_trip_member_id, idempotency_key) — a drunk
 * double-tap replays the existing row instead of inserting a
 * duplicate.
 */
export async function postItemCommentAction(
  input: PostItemCommentInput,
  idempotencyKey: string
): Promise<PostItemCommentResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = POST_ITEM_COMMENT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { itemId, body } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  const context = await resolveItemCommentContext(supabase, itemId, userId);
  if (!context) return { ok: false, errorKey: "rls_denied" };
  const { tripId, tripMemberId } = context;

  try {
    const comment = await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_ITEM_COMMENT,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("itinerary_item_comments")
          .insert({
            item_id: itemId,
            trip_id: tripId,
            author_trip_member_id: tripMemberId,
            body,
            idempotency_key: idempotencyKey,
          })
          .select(ITEM_COMMENT_COLUMNS)
          .single();

        if (error) {
          if (error.code === "23505") {
            const { data: existing, error: fetchErr } = await supabase
              .from("itinerary_item_comments")
              .select(ITEM_COMMENT_COLUMNS)
              .eq("item_id", itemId)
              .eq("author_trip_member_id", tripMemberId)
              .eq("idempotency_key", idempotencyKey)
              .single();
            if (fetchErr || !existing) {
              throw new ItemCommentActionError("save_failed");
            }
            return existing as ItemComment;
          }
          if (error.code === "42501") {
            throw new ItemCommentActionError("rls_denied");
          }
          throw new ItemCommentActionError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as ItemComment;
      }
    );
    revalidatePath("/trips", "layout");
    return { ok: true, comment };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ItemCommentActionError) {
      return { ok: false, errorKey: itemCommentErrorKey(err.reason) };
    }
    console.error("[itinerary] postItemComment unexpected:", err);
    return { ok: false, errorKey: "item_comment_save_failed" };
  }
}

/**
 * Delete a comment. RLS (DELETE policy) restricts this to the comment's
 * author or an organizer. A no-row match (already gone) converges to
 * `{ ok: true }` — the desired end state (gone) already holds.
 */
export async function deleteItemCommentAction(
  input: DeleteItemCommentInput,
  idempotencyKey: string
): Promise<DeleteItemCommentResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = DELETE_ITEM_COMMENT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { commentId } = parsed.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, errorKey: "rls_denied" };
  const userId = authData.user.id;

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.MUTATE_ITEM_COMMENT,
      userId,
      () => deleteItemCommentRow(supabase, commentId)
    );
    revalidatePath("/trips", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (
      err instanceof ItemCommentDbError &&
      err.code === ITEM_COMMENT_NO_ROW
    ) {
      return { ok: true };
    }
    if (err instanceof ItemCommentDbError && err.code === "42501") {
      return { ok: false, errorKey: "rls_denied" };
    }
    console.error("[itinerary] deleteItemComment unexpected:", err);
    return { ok: false, errorKey: "item_comment_delete_failed" };
  }
}
```

Also confirm `revalidatePath` and `RateLimitError` are already imported at the top of `lib/actions/itinerary.ts` — if not (this file may only import `rateLimitedAction`/`RATE_LIMIT_SCOPES` today), extend the existing rate-limit import block to include `RateLimitError`, and add `import { revalidatePath } from "next/cache";` near the other imports if it's missing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/actions/__tests__/itinerary-item-comments-actions.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Run the full existing itinerary actions suite (regression check)**

Run: `pnpm exec vitest run lib/actions/__tests__/`
Expected: all pass, no regressions in the pre-existing `itinerary.test.ts`/`itinerary-rsvp.test.ts` etc.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm exec eslint lib/actions/itinerary.ts lib/actions/__tests__/itinerary-item-comments-actions.test.ts`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/actions/itinerary.ts lib/actions/__tests__/itinerary-item-comments-actions.test.ts
git commit -m "feat(actions): postItemCommentAction, deleteItemCommentAction"
```

---

### Task 7: `ItemCommentSection` component + tests

**Files:**
- Create: `components/trip/itinerary/item-comment-section.tsx`
- Create: `components/trip/itinerary/__tests__/item-comment-section.test.tsx`

**Interfaces:**
- Consumes: `postItemCommentAction`, `deleteItemCommentAction` from `@/lib/actions/itinerary` (Task 6); `resolveContentAuthorName` from `@/lib/utils/member-display` (already exists); `callAction` from `@/lib/ui/call-action` (already exists); `ERROR_LINE_CLASS` from `@/lib/ui/error-surface` (already exists); `M3_UI_STRINGS` (Task 5); `ItemComment` from `@/lib/db/types` (Task 2).
- Produces: `ItemCommentSection` React component, props `{ itemId: string; comments: readonly ItemComment[]; viewerTripMemberId: string | undefined; isViewerOrganizer: boolean; viewerDisplayName: string | null; now: Date }`. Task 8 mounts this on `ItemCard`.

- [ ] **Step 1: Write the failing test file**

```typescript
/**
 * Tests for ItemCommentSection — collapsed disclosure + flat comment
 * thread + composer, bundled into one unit (unlike polls, which split
 * this into PollsDisclosure/PollCommentThread/PollCommentComposer —
 * item cards are denser, so this stays one component).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemCommentSection } from "../item-comment-section";
import type { ItemComment } from "@/lib/db/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/actions/itinerary", () => ({
  postItemCommentAction: vi.fn(),
  deleteItemCommentAction: vi.fn(),
}));

import {
  postItemCommentAction,
  deleteItemCommentAction,
} from "@/lib/actions/itinerary";

const mockPost = vi.mocked(postItemCommentAction);
const mockDelete = vi.mocked(deleteItemCommentAction);

const ITEM_ID = "item-1";
const NOW = new Date("2026-08-15T12:00:00.000Z");

const makeComment = (overrides: Partial<ItemComment> = {}): ItemComment => ({
  id: "comment-1",
  item_id: ITEM_ID,
  trip_id: "trip-1",
  author_trip_member_id: "member-1",
  body: "What time are we leaving?",
  idempotency_key: null,
  created_at: "2026-08-15T11:00:00.000Z",
  authorDisplayName: "Dave",
  ...overrides,
});

const baseProps = {
  itemId: ITEM_ID,
  comments: [] as readonly ItemComment[],
  viewerTripMemberId: "member-1",
  isViewerOrganizer: false,
  viewerDisplayName: "Dave",
  now: NOW,
};

beforeEach(() => {
  vi.restoreAllMocks();
  refreshMock.mockReset();
});

describe("ItemCommentSection — disclosure", () => {
  it("shows 'Add a comment' when there are zero comments", () => {
    render(<ItemCommentSection {...baseProps} />);
    expect(screen.getByText("Add a comment")).toBeInTheDocument();
  });

  it("shows '1 comment' for exactly one comment", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    expect(screen.getByText("1 comment")).toBeInTheDocument();
  });

  it("shows 'N comments' for more than one", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment(), makeComment({ id: "comment-2" })]}
      />
    );
    expect(screen.getByText("2 comments")).toBeInTheDocument();
  });

  it("starts collapsed — thread body is not rendered until toggled", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    expect(screen.queryByText("What time are we leaving?")).not.toBeInTheDocument();
  });

  it("expands on click and reveals the thread", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByText("What time are we leaving?")).toBeInTheDocument();
  });
});

describe("ItemCommentSection — thread", () => {
  it("renders author and relative time for each comment", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByText(/Dave/)).toBeInTheDocument();
  });

  it("shows the delete control on the viewer's own comment", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "member-1" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByRole("button", { name: /delete comment/i })).toBeInTheDocument();
  });

  it("shows the delete control for an organizer on someone else's comment", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        isViewerOrganizer
        comments={[makeComment({ author_trip_member_id: "someone-else" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByRole("button", { name: /delete comment/i })).toBeInTheDocument();
  });

  it("hides the delete control for a non-organizer viewing someone else's comment", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "someone-else" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.queryByRole("button", { name: /delete comment/i })).not.toBeInTheDocument();
  });
});

describe("ItemCommentSection — composer", () => {
  it("renders the composer when the viewer has a trip_member_id", () => {
    render(<ItemCommentSection {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
  });

  it("does not render the composer for a viewer with no trip_member_id", () => {
    render(
      <ItemCommentSection {...baseProps} viewerTripMemberId={undefined} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    expect(screen.queryByPlaceholderText("Add a comment…")).not.toBeInTheDocument();
  });

  it("posts a comment and shows it optimistically", async () => {
    mockPost.mockResolvedValue({
      ok: true,
      comment: makeComment({ id: "new-comment", body: "Bring cash" }),
    });
    render(<ItemCommentSection {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));

    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
      target: { value: "Bring cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send comment/i }));

    await waitFor(() => {
      expect(screen.getByText("Bring cash")).toBeInTheDocument();
    });
    expect(mockPost).toHaveBeenCalledWith(
      { itemId: ITEM_ID, body: "Bring cash" },
      expect.any(String)
    );
  });
});

describe("ItemCommentSection — delete", () => {
  it("calls deleteItemCommentAction and refreshes on confirmed delete", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDelete.mockResolvedValue({ ok: true });
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "member-1" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    fireEvent.click(screen.getByRole("button", { name: /delete comment/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        { commentId: "comment-1" },
        expect.any(String)
      );
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("does not call the action when the confirm dialog is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "member-1" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    fireEvent.click(screen.getByRole("button", { name: /delete comment/i }));
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run components/trip/itinerary/__tests__/item-comment-section.test.tsx`
Expected: FAIL — `Cannot find module '../item-comment-section'`.

- [ ] **Step 3: Write the implementation**

```typescript
"use client";

/**
 * ItemCommentSection — collapsed disclosure + flat comment thread +
 * composer for one itinerary item ("plan"), bundled into a single unit.
 *
 * Unlike polls (PollsDisclosure + PollCommentThread + PollCommentComposer
 * as three separate pieces on a less-crowded card), item cards are
 * already dense (time, cost, address, dress code, tags, RSVP chip,
 * member flags) — so this collapses behind one disclosure row, closed
 * by default always (no auto-expand-on-existing-comments), and expands
 * to the thread + composer together.
 *
 * Optimistic overlay + freshness mirror PollCard/PollCommentThread: a
 * successful post appends to local `optimisticComments` (deduped
 * against the `comments` prop by idempotency_key on the next server
 * refresh); a successful delete calls `router.refresh()` so the surface
 * does not hard-depend on the Realtime channel landing the DELETE
 * (#349 posture).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistance } from "date-fns";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import {
  postItemCommentAction,
  deleteItemCommentAction,
} from "@/lib/actions/itinerary";
import { resolveContentAuthorName } from "@/lib/utils/member-display";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { ItemComment } from "@/lib/db/types";

export interface ItemCommentSectionProps {
  itemId: string;
  comments: readonly ItemComment[];
  /** The viewer's trip_members.id — undefined hides the composer (no
   * seat to author a comment as). */
  viewerTripMemberId: string | undefined;
  isViewerOrganizer: boolean;
  /** The viewer's own display name — used ONLY so a just-posted
   * optimistic comment shows the real name instead of flashing
   * "Someone" (#405-C pattern). */
  viewerDisplayName: string | null;
  now: Date;
}

function disclosureLabel(count: number): string {
  if (count === 0) return M3_UI_STRINGS.itinerary_item_comments_disclosure_zero;
  if (count === 1) return M3_UI_STRINGS.itinerary_item_comments_disclosure_one;
  return M3_UI_STRINGS.itinerary_item_comments_disclosure_other_template.replace(
    "{count}",
    String(count)
  );
}

export function ItemCommentSection({
  itemId,
  comments,
  viewerTripMemberId,
  isViewerOrganizer,
  viewerDisplayName,
  now,
}: ItemCommentSectionProps) {
  const router = useRouter();
  const panelId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [deletedIds, setDeletedIds] = React.useState<ReadonlySet<string>>(
    new Set()
  );
  const [optimisticComments, setOptimisticComments] = React.useState<
    readonly ItemComment[]
  >([]);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null
  );
  const [deleteErrorKey, setDeleteErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [body, setBody] = React.useState("");
  const [isPosting, setIsPosting] = React.useState(false);
  const [postErrorKey, setPostErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const mergedComments = React.useMemo(() => {
    const known = new Set(
      comments.map((c) => c.idempotency_key).filter((k): k is string => k != null)
    );
    const stillPending = optimisticComments.filter(
      (c) => c.idempotency_key == null || !known.has(c.idempotency_key)
    );
    return [...comments, ...stillPending].filter((c) => !deletedIds.has(c.id));
  }, [comments, optimisticComments, deletedIds]);

  const selfMap = React.useMemo(
    () =>
      viewerTripMemberId
        ? new Map([[viewerTripMemberId, { display_name: viewerDisplayName }]])
        : new Map<string, { display_name: string | null }>(),
    [viewerTripMemberId, viewerDisplayName]
  );

  const handleDelete = (commentId: string) => {
    if (pendingDeleteId) return;
    if (!window.confirm(M3_UI_STRINGS.itinerary_item_comment_delete_confirm))
      return;

    setDeleteErrorKey(null);
    setPendingDeleteId(commentId);
    void (async () => {
      try {
        const key = crypto.randomUUID();
        const result = await callAction(() =>
          deleteItemCommentAction({ commentId }, key)
        );
        if (!result.ok) {
          setDeleteErrorKey(result.errorKey);
          return;
        }
        setDeletedIds((prev) => new Set(prev).add(commentId));
        router.refresh();
      } finally {
        setPendingDeleteId(null);
      }
    })();
  };

  const trimmedBody = body.trim();
  const canSubmit = trimmedBody.length > 0 && !isPosting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setPostErrorKey(null);
    setIsPosting(true);
    try {
      const result = await callAction(() =>
        postItemCommentAction({ itemId, body: trimmedBody }, idempotencyKey)
      );
      if (!result.ok) {
        setPostErrorKey(result.errorKey);
        return;
      }
      setOptimisticComments((prev) => [...prev, result.comment]);
      setBody("");
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-fit items-center gap-1.5 text-left text-xs font-medium text-muted-foreground",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <span>{disclosureLabel(mergedComments.length)}</span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-3">
          {mergedComments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {M3_UI_STRINGS.itinerary_item_comments_empty}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {mergedComments.map((comment) => {
                const name = resolveContentAuthorName(
                  selfMap,
                  comment.author_trip_member_id,
                  comment.authorDisplayName
                );
                const when = formatDistance(new Date(comment.created_at), now, {
                  addSuffix: true,
                });
                const canDeleteThis =
                  isViewerOrganizer ||
                  (viewerTripMemberId !== undefined &&
                    comment.author_trip_member_id === viewerTripMemberId);

                return (
                  <li key={comment.id} className="flex flex-col gap-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-muted-foreground text-xs">
                        {M3_UI_STRINGS.itinerary_item_comment_author_line_template
                          .replace("{name}", name)
                          .replace("{when}", when)}
                      </p>
                      {canDeleteThis ? (
                        <button
                          type="button"
                          aria-label={M3_UI_STRINGS.itinerary_item_comment_delete_aria}
                          disabled={pendingDeleteId === comment.id}
                          onClick={() => handleDelete(comment.id)}
                          className="text-muted-foreground shrink-0 text-xs underline underline-offset-2 disabled:opacity-60"
                        >
                          {M3_UI_STRINGS.itinerary_item_comment_delete_cta}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm">{comment.body}</p>
                  </li>
                );
              })}
            </ul>
          )}

          {deleteErrorKey ? (
            <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
              {ERRORS[deleteErrorKey]}
            </p>
          ) : null}

          {viewerTripMemberId !== undefined ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`item-comment-body-${itemId}`}
                  className="sr-only"
                >
                  {M3_UI_STRINGS.itinerary_item_comment_placeholder}
                </label>
                <input
                  id={`item-comment-body-${itemId}`}
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={M3_UI_STRINGS.itinerary_item_comment_placeholder}
                  disabled={isPosting}
                  className={cn(
                    "w-full flex-1 rounded-xs border border-border bg-background px-3 py-2 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-busy={isPosting}
                  aria-label={M3_UI_STRINGS.itinerary_item_comment_composer_submit_aria}
                  className={cn(
                    "focus-visible:ring-ring shrink-0 rounded-xs bg-primary px-3 py-2 text-xs font-medium text-primary-foreground",
                    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                >
                  {M3_UI_STRINGS.itinerary_item_comment_composer_submit_aria}
                </button>
              </div>
              {postErrorKey ? (
                <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
                  {ERRORS[postErrorKey]}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run components/trip/itinerary/__tests__/item-comment-section.test.tsx`
Expected: all tests PASS. If the disclosure button's accessible name doesn't match `"1 comment"`/`"Add a comment"` exactly (e.g. the chevron's `aria-hidden` SVG leaks into the accessible name), adjust the test's `getByRole("button", { name: ... })` matcher to a substring/regex — do not change the component's visible label text.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm exec eslint components/trip/itinerary/item-comment-section.tsx components/trip/itinerary/__tests__/item-comment-section.test.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/itinerary/item-comment-section.tsx components/trip/itinerary/__tests__/item-comment-section.test.tsx
git commit -m "feat(itinerary): ItemCommentSection component"
```

---

### Task 8: Mount on `ItemCard`

**Files:**
- Modify: `components/trip/itinerary/item-card.tsx`
- Modify: `components/trip/itinerary/__tests__/item-card.test.tsx`

**Interfaces:**
- Consumes: `ItemCommentSection` from `./item-comment-section` (Task 7).
- Produces: `ItemCard` gains four new required props: `itemComments: ItemComment[]`, `viewerTripMemberId: string | undefined`, `viewerDisplayName: string | null`, `now: Date`. Task 9's `DaySection` must supply all four.

- [ ] **Step 1: Add the import and type import**

In `components/trip/itinerary/item-card.tsx`, add near the other component imports (after `import { LodgingRoster } from "./lodging-roster";`):

```typescript
import { ItemCommentSection } from "./item-comment-section";
```

Extend the existing type-only import to include `ItemComment`:

```typescript
import type {
  ItemComment,
  ItineraryItemMemberFlag,
  ItineraryItem,
  ItineraryItemRsvpStatus,
  LodgingAssignment,
  TripMember,
} from "@/lib/db/types";
```

- [ ] **Step 2: Extend `ItemCardProps`**

Add four fields to the `ItemCardProps` interface, after the existing `isNext?: boolean;` field:

```typescript
  /** This item's comments, pre-enriched (authorDisplayName always set). */
  itemComments: ItemComment[];
  /** The viewer's trip_members.id — undefined hides the comment composer. */
  viewerTripMemberId: string | undefined;
  /** The viewer's own display name — threaded to ItemCommentSection for
   * the #405-C optimistic-post-name pattern. */
  viewerDisplayName: string | null;
  /** Server-provided reference clock — threaded to ItemCommentSection
   * for relative-time rendering (formatDistance pinned to server now,
   * not each render's wall clock). */
  now: Date;
```

- [ ] **Step 3: Destructure the new props**

In the `ItemCard` function signature, add the four new props to the destructured parameter list (after `isNext = false,`):

```typescript
  itemComments,
  viewerTripMemberId,
  viewerDisplayName,
  now,
```

- [ ] **Step 4: Mount `ItemCommentSection` at the end of the card**

Insert immediately before the closing `</article>` tag (after the existing `ItemFlagForm` block):

```typescript
      {/* Comment thread — collapsed disclosure, last section on the card. */}
      <ItemCommentSection
        itemId={item.id}
        comments={itemComments}
        viewerTripMemberId={viewerTripMemberId}
        isViewerOrganizer={isOrganizer}
        viewerDisplayName={viewerDisplayName}
        now={now}
      />
```

- [ ] **Step 5: Update `item-card.test.tsx` — mock + baseProps + new tests**

Add a mock for the new component near the other `vi.mock` calls at the top of the file:

```typescript
vi.mock("../item-comment-section", () => ({
  ItemCommentSection: ({
    itemId,
    comments,
  }: {
    itemId: string;
    comments: ReadonlyArray<{ id: string }>;
  }) => (
    <div
      data-testid="comment-section"
      data-item-id={itemId}
      data-comment-count={comments.length}
    >
      comments
    </div>
  ),
}));
```

Add the four new fields to `baseProps`:

```typescript
  itemComments: [] as ItemComment[],
  viewerTripMemberId: "viewer-member-1" as string | undefined,
  viewerDisplayName: "Dave" as string | null,
  now: new Date("2026-08-15T12:00:00.000Z"),
```

(Add `ItemComment` to the existing `import type { ... } from "@/lib/db/types";` line at the top of the test file.)

Add a new test block after the existing `LodgingRoster` describe block:

```typescript
describe("ItemCard — comment section", () => {
  it("renders ItemCommentSection with this item's id and comment count", () => {
    render(
      <ItemCard
        item={makeItem()}
        {...baseProps}
        itemComments={[
          {
            id: "c1",
            item_id: "item-1",
            trip_id: "trip-1",
            author_trip_member_id: "member-1",
            body: "hi",
            idempotency_key: null,
            created_at: "2026-08-15T10:00:00.000Z",
          },
        ]}
      />
    );
    const section = screen.getByTestId("comment-section");
    expect(section).toHaveAttribute("data-item-id", "item-1");
    expect(section).toHaveAttribute("data-comment-count", "1");
  });
});
```

- [ ] **Step 6: Run the full item-card test file**

Run: `pnpm exec vitest run components/trip/itinerary/__tests__/item-card.test.tsx`
Expected: all tests PASS (existing tests included — they now pass through the new required props via `baseProps`, unchanged in shape for them).

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm exec eslint components/trip/itinerary/item-card.tsx components/trip/itinerary/__tests__/item-card.test.tsx`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/trip/itinerary/item-card.tsx components/trip/itinerary/__tests__/item-card.test.tsx
git commit -m "feat(itinerary): mount ItemCommentSection on ItemCard"
```

---

### Task 9: Wire `DaySection` → `page.tsx`

**Files:**
- Modify: `components/trip/itinerary/day-section.tsx`
- Modify: `app/(authed)/trips/[tripId]/itinerary/page.tsx`

**Interfaces:**
- Consumes: `getCommentsForTrip`, `enrichItemComments` from `@/lib/db/itinerary-item-comments` (Task 3); `ItemComment` from `@/lib/db/types` (Task 2).
- Produces: `DaySection` gains `commentsByItemMap: Map<string, ItemComment[]>`, `viewerTripMemberId: string | undefined`, `viewerDisplayName: string | null`, `now: Date` props, threaded down to every `ItemCard` it renders.

- [ ] **Step 1: Extend `DaySectionProps` and destructuring**

In `components/trip/itinerary/day-section.tsx`, add to the type-only import:

```typescript
import type { ItemComment, ItineraryItem, ItineraryItemMemberFlag, ItineraryItemRsvpStatus, LodgingAssignment, TripMember } from "@/lib/db/types";
```

Add to `DaySectionProps` (after the existing `nextItemId: string | null;` field):

```typescript
  /** itemId → this item's comments, pre-enriched. */
  commentsByItemMap: Map<string, ItemComment[]>;
  /** The viewer's trip_members.id — undefined hides every card's
   * comment composer. */
  viewerTripMemberId: string | undefined;
  /** The viewer's own display name — forwarded to every ItemCard's
   * ItemCommentSection (#405-C optimistic-post-name pattern). */
  viewerDisplayName: string | null;
  /** Server-provided reference clock — forwarded to every ItemCard's
   * ItemCommentSection for relative-time rendering. */
  now: Date;
```

Add to the destructured function parameters (after `nextItemId,`):

```typescript
  commentsByItemMap,
  viewerTripMemberId,
  viewerDisplayName,
  now,
```

- [ ] **Step 2: Thread the new props into `<ItemCard>`**

In the `items.map((item) => ...)` block, add four props to the existing `<ItemCard>` call (after `isNext={item.id === nextItemId}`):

```typescript
              itemComments={commentsByItemMap.get(item.id) ?? []}
              viewerTripMemberId={viewerTripMemberId}
              viewerDisplayName={viewerDisplayName}
              now={now}
```

- [ ] **Step 3: Wire the page-level fetch + fold**

In `app/(authed)/trips/[tripId]/itinerary/page.tsx`, add to the imports:

```typescript
import {
  getItineraryByTrip,
  getMyItemRsvps,
  getLodgingAssignmentsByTrip,
  getItemFlagsForOrganizer,
} from "@/lib/db/itinerary";
import {
  getCommentsForTrip,
  enrichItemComments,
} from "@/lib/db/itinerary-item-comments";
import type { ItemComment, ItineraryItemRsvpStatus } from "@/lib/db/types";
```

(This replaces the existing single-line `getItineraryByTrip, getMyItemRsvps, getLodgingAssignmentsByTrip, getItemFlagsForOrganizer` import — expand it to the multi-line form above, and extend the existing `import type { ItineraryItemRsvpStatus }` line to include `ItemComment`.)

Add `getCommentsForTrip(supabase, trip.id)` to the existing `Promise.all` fan-out (find the `const [items, myRsvps, lodgingAssignmentsMap, tripMembers, allFlags, rsvpCounts] = await Promise.all([...])` block):

```typescript
  const [items, myRsvps, lodgingAssignmentsMap, tripMembers, allFlags, rsvpCounts, itemComments] =
    await Promise.all([
      getItineraryByTrip(supabase, trip.id),
      getMyItemRsvps(supabase, trip.id, viewer.id),
      getLodgingAssignmentsByTrip(supabase, trip.id),
      getTripMembers(supabase, trip.id),
      getItemFlagsForOrganizer(supabase, trip.id),
      getRsvpCountsForTrip(supabase, trip.id),
      getCommentsForTrip(supabase, trip.id),
    ]);
```

After the existing `itemFlagsMap` build block, add the comment enrichment + grouping (single-pass, mirrors the announcements page's `commentsByPollMap`):

```typescript
  // Comment enrichment + itemId → comments[] group-by (mirrors the
  // announcements page's commentsByPollMap — single-pass O(n), not the
  // naive reduce+spread O(n²) version).
  const memberMapById = new Map<string, string | null>(
    tripMembers.map((m) => [m.id, m.display_name])
  );
  const enrichedItemComments = enrichItemComments(itemComments, memberMapById);
  const commentsByItemMap = new Map<string, ItemComment[]>();
  for (const comment of enrichedItemComments) {
    const bucket = commentsByItemMap.get(comment.item_id) ?? [];
    bucket.push(comment);
    commentsByItemMap.set(comment.item_id, bucket);
  }

  // #405-C: the viewer's own display name, so a freshly-posted comment
  // renders their name immediately instead of flashing "Someone".
  const viewerDisplayName =
    tripMembers.find((m) => m.user_id === user.id)?.display_name ?? null;

  const now = new Date();
```

- [ ] **Step 4: Thread the new props into `<DaySection>`**

Add four props to the existing `<DaySection>` call inside the `days.map((day) => ...)` block (after `nextItemId={nextItemId}`):

```typescript
              commentsByItemMap={commentsByItemMap}
              viewerTripMemberId={viewer.id}
              viewerDisplayName={viewerDisplayName}
              now={now}
```

Note: `viewer.id` here is `viewer`'s row from `getViewerMember` — confirm it exposes `.id` as the `trip_members.id` (not `user.id`/`auth.users.id`); this file already passes `viewerMemberId={viewer.id}` to `DaySection` for the flags/on-behalf picker, so the same field is reused for the comment composer's author id.

- [ ] **Step 5: Update `DaySection`'s own test file if one exists**

Run: `find components/trip/itinerary/__tests__ -iname "day-section*"`
If a test file exists, add the four new required props (`commentsByItemMap: new Map()`, `viewerTripMemberId: "viewer-1"`, `viewerDisplayName: "Dave"`, `now: new Date("2026-08-15T12:00:00.000Z")`) to its `baseProps`/default props object so existing tests keep passing. If no test file exists for `DaySection`, skip this step (nothing to update).

- [ ] **Step 6: Manual verification against local Supabase**

Run: `pnpm dev` (with local Supabase already running — `pnpm dlx supabase start` if not), then in a browser at `/trips/<slug>/itinerary`:
1. Open an item card, expand the new "Add a comment" disclosure, post a comment, confirm it appears immediately with your name and "just now".
2. Reload the page — confirm the comment persists.
3. As a second member (or the same account, since delete affordance only needs author-or-organizer), delete the comment — confirm it disappears.
Expected: no console errors, no hydration mismatch warnings.

- [ ] **Step 7: Full verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add components/trip/itinerary/day-section.tsx "app/(authed)/trips/[tripId]/itinerary/page.tsx"
git commit -m "feat(itinerary): wire comment fetch/enrich/thread through DaySection to the page"
```

---

### Task 10: RLS harness

**Files:**
- Create: `supabase/tests/itinerary_item_comments_rls.test.sql`

**Interfaces:**
- None (standalone SQL script, not imported by application code).

- [ ] **Step 1: Write the harness**

```sql
-- =============================================================
-- supabase/tests/itinerary_item_comments_rls.test.sql
--
-- Adversarial RLS harness for public.itinerary_item_comments. Mirrors
-- supabase/tests/poll_comments_rls.test.sql, adapted: parent is
-- `itinerary_items`, visibility routes through the item's OWN
-- can_see_content(trip_id, visibility). Proves 8 cases against a LIVE
-- local Postgres — this is a local gate, not a CI gate.
--
-- RUN (after `pnpm dlx supabase db reset`):
--   docker exec -i supabase_db_trip-planner psql -U postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/itinerary_item_comments_rls.test.sql
--
-- Expect: prints "ALL 8 ITEM COMMENT RLS CASES PASSED" and exits 0.
-- =============================================================

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111112', 'ic-organizer@test.local'),
  ('22222222-2222-2222-2222-222222222223', 'ic-member-m@test.local'),
  ('33333333-3333-3333-3333-333333333334', 'ic-celebrant-c@test.local'),
  ('44444444-4444-4444-4444-444444444445', 'ic-nonmember-n@test.local'),
  ('66666666-6666-6666-6666-666666666667', 'ic-other-o@test.local');

insert into public.trips (id, slug, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'item-comments-rls-trip-a', 'Item Comments RLS Trip A', '11111111-1111-1111-1111-111111111112'),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'item-comments-rls-trip-b', 'Item Comments RLS Trip B', '11111111-1111-1111-1111-111111111112');

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111112', 'organizer', false),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', '22222222-2222-2222-2222-222222222223', 'attendee', false),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a3', '33333333-3333-3333-3333-333333333334', 'attendee', true),
  ('a4000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a3', '66666666-6666-6666-6666-666666666667', 'attendee', false);

-- Two items in trip A: one everyone-visible, one hide_from_celebrant.
insert into public.itinerary_items (id, trip_id, day, title, visibility, created_by) values
  ('c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', '2026-08-16', 'Rafting', 'everyone', '11111111-1111-1111-1111-111111111112'),
  ('c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', '2026-08-17', 'Surprise activity', 'hide_from_celebrant', '11111111-1111-1111-1111-111111111112');

-- Baseline comment on the everyone-visible item, authored by member O.
insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body) values
  ('e4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000004', 'Bring water shoes');

-- A comment on the HIDDEN item (by M).
insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body) values
  ('e4000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000002', 'Keep this one quiet');

-- =============================================================
-- CASE 1: celebrant C cannot read comments on the hide_from_celebrant item.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333334', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.itinerary_item_comments where item_id = 'c4000000-0000-0000-0000-000000000002';
  if n_comments <> 0 then
    raise exception 'CASE 1 FAILED: celebrant C could SELECT comments on the hide_from_celebrant item (got % rows)', n_comments;
  end if;
  raise notice 'CASE 1 PASSED: celebrant cannot read comments on the surprise item';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 2: non-member N fully blocked — SELECT 0 rows, INSERT denied.
-- =============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444445', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.itinerary_item_comments where item_id = 'c4000000-0000-0000-0000-000000000001';
  if n_comments <> 0 then
    raise exception 'CASE 2 FAILED: non-member N could SELECT comments on a trip A item (got % rows)', n_comments;
  end if;
  raise notice 'CASE 2a PASSED: non-member N sees 0 rows';
end $$;

do $$
begin
  begin
    insert into public.itinerary_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000004', 'Sneaky comment');
    raise exception 'CASE 2 FAILED: non-member N''s comment INSERT was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 2b PASSED: non-member N comment INSERT correctly denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 3: delete is author-or-organizer only.
-- =============================================================

-- 3a: celebrant C (not author, not organizer) -> 0 rows affected.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333334', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_item_comments where id = 'e4000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 0 then
    raise exception 'CASE 3a FAILED: a plain other member deleted a comment they did not author (affected=%)', affected;
  end if;
  raise notice 'CASE 3a PASSED: plain other member cannot delete another member''s comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3b: author O deletes own comment -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666667', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_item_comments where id = 'e4000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 3b FAILED: comment author could not delete own comment (affected=%)', affected;
  end if;
  raise notice 'CASE 3b PASSED: comment author deleted their own comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3c: organizer deletes M's remaining comment (on the hidden item) -> 1 row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111112', 'role', 'authenticated')::text, true);

do $$
declare
  affected int;
begin
  with deleted as (
    delete from public.itinerary_item_comments where id = 'e4000000-0000-0000-0000-000000000002' returning 1
  )
  select count(*) into affected from deleted;
  if affected <> 1 then
    raise exception 'CASE 3c FAILED: organizer could not delete another member''s comment (affected=%)', affected;
  end if;
  raise notice 'CASE 3c PASSED: organizer deleted another member''s comment';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 4: child trip_id cannot diverge from the parent item.
-- =============================================================

insert into public.trip_members (id, trip_id, user_id, role, is_celebrant) values
  ('b4000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b3', '22222222-2222-2222-2222-222222222223', 'attendee', false);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222223', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.itinerary_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c4000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b3', 'b4000000-0000-0000-0000-000000000001', 'Cross-trip injection attempt');
    raise exception 'CASE 4 FAILED: comment INSERT with a trip_id diverging from the parent item was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 4 PASSED: comment trip_id-divergence INSERT denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 5: two members, same idempotency key -> TWO rows (unique index
-- is (item_id, author_trip_member_id, idempotency_key)).
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222223', 'role', 'authenticated')::text, true);

insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000002', 'M''s comment', 'f2000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111112', 'role', 'authenticated')::text, true);

insert into public.itinerary_item_comments (id, item_id, trip_id, author_trip_member_id, body, idempotency_key)
values ('e4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000001', 'Organizer''s comment', 'f2000000-0000-0000-0000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.itinerary_item_comments
    where idempotency_key = 'f2000000-0000-0000-0000-000000000001';
  if n <> 2 then
    raise exception 'CASE 5 FAILED: expected 2 rows for shared idempotency key across 2 members, got %', n;
  end if;
  raise notice 'CASE 5 PASSED: two members with the same comment idempotency key produced 2 rows (no false 23505)';
end $$;

-- =============================================================
-- CASE 6: NO one can UPDATE a comment, including the organizer.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111112', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    update public.itinerary_item_comments set body = 'edited after the fact' where id = 'e4000000-0000-0000-0000-000000000003';
    raise exception 'CASE 6 FAILED: organizer was able to UPDATE an item comment';
  exception
    when insufficient_privilege then
      raise notice 'CASE 6 PASSED: UPDATE denied for everyone, incl. the organizer (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 7: celebrant is denied INSERT on the hide_from_celebrant item too.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333334', 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.itinerary_item_comments (item_id, trip_id, author_trip_member_id, body)
    values ('c4000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-000000000003', 'Wait, what surprise?');
    raise exception 'CASE 7 FAILED: celebrant''s comment INSERT on the hide_from_celebrant item was NOT denied';
  exception
    when insufficient_privilege then
      raise notice 'CASE 7 PASSED: celebrant comment INSERT on the surprise item denied (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
-- CASE 8: happy-path positive — member M CAN read O's comment on an
-- everyone-visible item.
-- =============================================================

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222223', 'role', 'authenticated')::text, true);

do $$
declare
  n_comments int;
begin
  select count(*) into n_comments from public.itinerary_item_comments where item_id = 'c4000000-0000-0000-0000-000000000001';
  if n_comments = 0 then
    raise exception 'CASE 8 FAILED: member M could not SELECT any comments on an everyone-visible item (got 0 rows)';
  end if;
  raise notice 'CASE 8 PASSED: member M reads % comment(s) on the everyone-visible item', n_comments;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================
select 'ALL 8 ITEM COMMENT RLS CASES PASSED' as result;

rollback;
```

- [ ] **Step 2: Run the harness against local Postgres**

Run:
```bash
pnpm dlx supabase db reset
docker exec -i supabase_db_trip-planner psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/itinerary_item_comments_rls.test.sql
```
Expected: 8 `raise notice ... PASSED` lines, then `ALL 8 ITEM COMMENT RLS CASES PASSED`, exit code 0.

- [ ] **Step 3: Repair local grants again post-reset (standing gotcha)**

Run: `pnpm exec vitest run` (full suite) to confirm nothing else regressed from the reset.
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/itinerary_item_comments_rls.test.sql
git commit -m "test(rls): itinerary_item_comments adversarial harness"
```

---

### Task 11: Final verification + PR

**Files:** none (verification + PR only)

- [ ] **Step 1: Full verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green, zero new warnings beyond the pre-existing `watch()`/React-Compiler warning already present on `edit-item-form.tsx`.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/itinerary-item-comments
gh pr create --title "feat(itinerary): comment threads on plans" --body "$(cat <<'EOF'
## Summary
- Adds a flat, immutable comment thread to each itinerary item ("plan"), collapsed behind a disclosure by default — closes the feature request "let's allow for comments on plans as well"
- Clones the poll_comments pattern (#620): same RLS shape via can_see_content(), same idempotent-insert/no-row-delete action shape, same "Someone" author fallback
- Design doc: docs/superpowers/specs/2026-08-14-itinerary-item-comments-design.md

## Test plan
- [x] pnpm typecheck / lint / test / build all green
- [x] New RLS harness (supabase/tests/itinerary_item_comments_rls.test.sql) — 8/8 cases pass against local Postgres
- [ ] Manual click-through on a preview deploy: post a comment, delete it, confirm visibility on a hide_from_celebrant item as the celebrant vs. organizer
EOF
)"
```

- [ ] **Step 3: Report the PR URL back to the user**
