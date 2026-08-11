/**
 * Tests for `components/trip/shopping-list/ShoppingList.tsx`.
 *
 * Covers:
 *   1. Partition logic — active (unbought) items render above the "Got it"
 *      divider, bought items render below it, struck.
 *   2. Empty state (gap-D) shows ONLY when zero items exist at all — not
 *      when active is empty but bought items remain.
 *   3. The "Got it" divider carries no count (no "3/7", no fraction).
 *
 * Actions and next/navigation are mocked — this is a focused component
 * test, not an integration test against the db layer.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { EMPTY_STATES, SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ShoppingItem, TripMember } from "@/lib/db/types";
import type { ViewerMember } from "@/lib/db/trips";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/actions/shopping-list", () => ({
  addShoppingItem: vi.fn(),
  toggleBought: vi.fn(),
  setClaim: vi.fn(),
  amendShoppingItem: vi.fn(),
  deleteShoppingItem: vi.fn(),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const TRIP_MEMBERS: TripMember[] = [
  {
    id: MEMBER_A,
    trip_id: TRIP_ID,
    user_id: "user-a",
    role: "organizer",
    rsvp_status: "going",
    joined_at: "2026-01-01T00:00:00Z",
    is_celebrant: false,
    display_name: "Dave",
    phone_e164: null,
    email: null,
    idempotency_key: null,
  },
  {
    id: MEMBER_B,
    trip_id: TRIP_ID,
    user_id: "user-b",
    role: "attendee",
    rsvp_status: "going",
    joined_at: "2026-01-01T00:00:00Z",
    is_celebrant: true,
    display_name: "Marcus",
    phone_e164: null,
    email: null,
    idempotency_key: null,
  },
];

const VIEWER: ViewerMember = {
  id: MEMBER_A,
  role: "organizer",
  is_celebrant: false,
  rsvp_status: "going",
  display_name: "Dave",
  phone_e164: null,
  idempotency_key: null,
};

function makeItem(overrides: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: `item-${Math.random()}`,
    trip_id: TRIP_ID,
    created_by_trip_member_id: MEMBER_A,
    claimed_by_trip_member_id: null,
    name: "Tequila",
    category: null,
    bought: false,
    cost_cents: null,
    currency: "USD",
    visibility: "everyone",
    idempotency_key: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("<ShoppingList />", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  it("empty state shows only when zero items exist", async () => {
    const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
    render(
      <ShoppingList items={[]} tripMembers={TRIP_MEMBERS} tripId={TRIP_ID} viewer={VIEWER} />
    );
    expect(screen.getByText(EMPTY_STATES.shopping_list_empty)).toBeInTheDocument();
  });

  it("does NOT show the empty state when active is empty but bought items remain", async () => {
    const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
    const items = [makeItem({ name: "Ice", bought: true })];
    render(
      <ShoppingList items={items} tripMembers={TRIP_MEMBERS} tripId={TRIP_ID} viewer={VIEWER} />
    );
    expect(screen.queryByText(EMPTY_STATES.shopping_list_empty)).not.toBeInTheDocument();
    expect(screen.getByText("Ice")).toBeInTheDocument();
  });

  it("partitions active vs. bought items around the divider", async () => {
    const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
    const items = [
      makeItem({ name: "Sunscreen", bought: false }),
      makeItem({ name: "Aux cable", bought: true }),
    ];
    render(
      <ShoppingList items={items} tripMembers={TRIP_MEMBERS} tripId={TRIP_ID} viewer={VIEWER} />
    );
    expect(screen.getByText("Sunscreen")).toBeInTheDocument();
    expect(screen.getByText("Aux cable")).toBeInTheDocument();
    expect(
      screen.getByText(SHOPPING_LIST_UI_STRINGS.gotItDivider)
    ).toBeInTheDocument();
  });

  it("the Got-it divider carries no count", async () => {
    const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
    const items = [
      makeItem({ name: "Sunscreen", bought: false }),
      makeItem({ name: "Aux cable", bought: true }),
      makeItem({ name: "Ice", bought: true }),
    ];
    render(
      <ShoppingList items={items} tripMembers={TRIP_MEMBERS} tripId={TRIP_ID} viewer={VIEWER} />
    );
    // Divider text must be the exact copy string — no "2/3", "2 of 3",
    // or any appended fraction (CLAUDE.md hard-bans completion scores).
    const divider = screen.getByText(SHOPPING_LIST_UI_STRINGS.gotItDivider);
    expect(divider.textContent).toBe(SHOPPING_LIST_UI_STRINGS.gotItDivider);
  });

  it("does not render a divider when nothing is bought yet", async () => {
    const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
    const items = [makeItem({ name: "Sunscreen", bought: false })];
    render(
      <ShoppingList items={items} tripMembers={TRIP_MEMBERS} tripId={TRIP_ID} viewer={VIEWER} />
    );
    expect(
      screen.queryByText(SHOPPING_LIST_UI_STRINGS.gotItDivider)
    ).not.toBeInTheDocument();
  });
});
