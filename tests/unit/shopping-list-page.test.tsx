/**
 * Tests for `app/(authed)/trips/[tripId]/shopping-list/page.tsx` (P2-T7).
 *
 * ShoppingListPage is an async Server Component — it can't be rendered in
 * jsdom, but calling it directly (`await ShoppingListPage({ params })`)
 * returns the React element tree without a DOM, which is enough to
 * inspect the props handed to `<ShoppingList>`. Override C: page tests
 * live in tests/unit/, mirroring `trips-list-page.test.tsx`.
 *
 * Covers the §12.2 load-bearing boundary: `summarizeItemReactions` runs
 * server-side, and only its `{ counts, mine }` output — never a raw
 * `trip_member_id` — reaches the `<ShoppingList>` props the client tree
 * receives. `getShoppingReactionsForTrip`/`getCommentsForTrip` are
 * mocked (no live DB in unit tests); `summarizeItemReactions` and
 * `enrichComments` run for real via `importOriginal` so the fold under
 * test is the actual production code, not a stub.
 */

import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import type { ShoppingItemComment, ShoppingItemReaction } from "@/lib/db/types";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_1 = "aaaaaaaa-1111-4111-8111-111111111111";
const ITEM_2 = "aaaaaaaa-2222-4222-8222-222222222222";

const VIEWER_USER_ID = "user-viewer";
const VIEWER_MEMBER_ID = "mmmmmmmm-1111-4111-8111-111111111111";
const OTHER_MEMBER_ID = "mmmmmmmm-2222-4222-8222-222222222222";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: VIEWER_USER_ID } },
      })),
    },
  })),
}));

vi.mock("@/lib/db/trips", () => ({
  getTripBySlug: vi.fn(async () => ({
    id: TRIP_ID,
    slug: "test-trip",
    name: "Test Trip",
  })),
  getViewerMember: vi.fn(async () => ({
    id: VIEWER_MEMBER_ID,
    role: "attendee",
    is_celebrant: false,
    rsvp_status: "going",
    display_name: "Viewer",
    phone_e164: null,
    idempotency_key: null,
  })),
  getTripMembers: vi.fn(async () => [
    {
      id: VIEWER_MEMBER_ID,
      trip_id: TRIP_ID,
      user_id: VIEWER_USER_ID,
      role: "attendee",
      rsvp_status: "going",
      joined_at: "2026-01-01T00:00:00Z",
      is_celebrant: false,
      display_name: "Viewer",
      phone_e164: null,
      email: null,
      idempotency_key: null,
    },
    {
      id: OTHER_MEMBER_ID,
      trip_id: TRIP_ID,
      user_id: "user-other",
      role: "attendee",
      rsvp_status: "going",
      joined_at: "2026-01-01T00:00:00Z",
      is_celebrant: false,
      display_name: "Other Member",
      phone_e164: null,
      email: null,
      idempotency_key: null,
    },
  ]),
}));

vi.mock("@/lib/db/shopping-list", () => ({
  getShoppingItems: vi.fn(async () => [
    {
      id: ITEM_1,
      trip_id: TRIP_ID,
      created_by_trip_member_id: VIEWER_MEMBER_ID,
      claimed_by_trip_member_id: null,
      name: "Ice",
      category: null,
      bought: false,
      cost_cents: null,
      currency: "USD",
      visibility: "everyone",
      idempotency_key: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: ITEM_2,
      trip_id: TRIP_ID,
      created_by_trip_member_id: VIEWER_MEMBER_ID,
      claimed_by_trip_member_id: null,
      name: "Sunscreen",
      category: null,
      bought: false,
      cost_cents: null,
      currency: "USD",
      visibility: "everyone",
      idempotency_key: null,
      created_at: "2026-01-02T00:00:00Z",
    },
  ]),
}));

const rawReactions: ShoppingItemReaction[] = [
  {
    id: "r1",
    item_id: ITEM_1,
    trip_id: TRIP_ID,
    trip_member_id: OTHER_MEMBER_ID,
    emoji: "👍",
    created_at: "2026-01-01T01:00:00Z",
  },
  {
    id: "r2",
    item_id: ITEM_1,
    trip_id: TRIP_ID,
    trip_member_id: VIEWER_MEMBER_ID,
    emoji: "👍",
    created_at: "2026-01-01T02:00:00Z",
  },
];

const rawComments: ShoppingItemComment[] = [
  {
    id: "c1",
    item_id: ITEM_2,
    trip_id: TRIP_ID,
    author_trip_member_id: OTHER_MEMBER_ID,
    body: "Get the spray kind",
    idempotency_key: null,
    created_at: "2026-01-02T01:00:00Z",
  },
];

vi.mock("@/lib/db/shopping-item-reactions", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/db/shopping-item-reactions")
  >();
  return {
    ...actual,
    getShoppingReactionsForTrip: vi.fn(async () => rawReactions),
  };
});

vi.mock("@/lib/db/shopping-item-comments", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/db/shopping-item-comments")
  >();
  return {
    ...actual,
    getCommentsForTrip: vi.fn(async () => rawComments),
  };
});

// Extracting props from a plain React element tree returned by an
// uncalled/unrendered async Server Component; no DOM types apply here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function findByComponentName(node: any, name: string): any {
  if (!node) return null;
  if (typeof node === "object" && node.type?.name === name) return node;
  const children = node?.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findByComponentName(child, name);
      if (found) return found;
    }
  } else if (children) {
    return findByComponentName(children, name);
  }
  return null;
}

describe("ShoppingListPage — social wiring (P2-T7)", () => {
  it("passes ONLY the folded { counts, mine } reaction summary to <ShoppingList> — never a raw trip_member_id", async () => {
    const { default: ShoppingListPage } = await import(
      "@/app/(authed)/trips/[tripId]/shopping-list/page"
    );

    const element = await ShoppingListPage({
      params: Promise.resolve({ tripId: "test-trip" }),
    });

    const shoppingListElement = findByComponentName(element, "ShoppingList");
    expect(shoppingListElement).toBeTruthy();

    const { reactionsByItem, commentsByItem, commentCountByItem, now } =
      shoppingListElement.props;

    // Boundary: the folded summary carries only counts + mine per item.
    expect(reactionsByItem[ITEM_1]).toEqual({
      counts: { "👍": 2 },
      mine: ["👍"],
    });
    for (const summary of Object.values(reactionsByItem) as Array<{
      counts: unknown;
      mine: unknown;
    }>) {
      expect(Object.keys(summary)).toEqual(["counts", "mine"]);
    }
    const serialized = JSON.stringify(reactionsByItem);
    expect(serialized).not.toContain("trip_member_id");
    expect(serialized).not.toContain(OTHER_MEMBER_ID);
    expect(serialized).not.toContain(VIEWER_MEMBER_ID);

    // Comments enrich via the trip_members.id-keyed map — the author
    // resolves to a display name, not the fallback, proving the memberMap
    // was built from `.id`, not `.user_id`.
    expect(commentsByItem[ITEM_2]?.[0]?.authorDisplayName).toBe(
      "Other Member"
    );
    expect(commentCountByItem[ITEM_2]).toBe(1);
    expect(commentCountByItem[ITEM_1]).toBeUndefined();
    expect(now).toBeInstanceOf(Date);
  });
});
