/**
 * Tests for `components/trip/shopping-list/ShoppingList.tsx` (v2, Task 6).
 *
 * Covers:
 *   1. Grouping — items land in the right bucket by `deriveShoppingItemState`.
 *   2. Segmented filter (All / Open / In-progress / Completed / Removed) —
 *      default All renders the sectioned view; each other tab filters to a
 *      flat list of just that state's cards. No fraction/percentage in the
 *      control (CLAUDE.md hard-bans completion scores).
 *   3. Sectioning (the All view) — active items flat on top, then a
 *      collapsible Completed section, then a collapsible Removed section.
 *      Active items never render under a divider.
 *   4. Empty state (gap-D) — the big empty state only when there are ZERO
 *      items total; an empty filtered tab gets a small neutral line instead.
 *
 * Actions and next/navigation are mocked — this is a focused component
 * test, not an integration test against the db layer.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { A11Y_UI_STRINGS, EMPTY_STATES, SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ShoppingItem, TripMember } from "@/lib/db/types";
import type { ViewerMember } from "@/lib/db/trips";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/actions/shopping-list", () => ({
  addShoppingItem: vi.fn(),
  amendShoppingItem: vi.fn(),
  deleteShoppingItem: vi.fn(),
  assignShoppingItem: vi.fn(),
  completeShoppingItem: vi.fn(),
  removeShoppingItem: vi.fn(),
  reopenShoppingItem: vi.fn(),
}));

vi.mock("@/lib/actions/shopping-item-reactions", () => ({
  toggleShoppingReaction: vi.fn(),
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

let itemCounter = 0;

function makeItem(overrides: Partial<ShoppingItem>): ShoppingItem {
  itemCounter += 1;
  return {
    id: `item-${itemCounter}`,
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
    completed_by_trip_member_id: null,
    removed_by_trip_member_id: null,
    removed_at: null,
    claim_assigned_by_trip_member_id: null,
    ...overrides,
  };
}

// One item of each derived state, for grouping/filter tests.
function fourStateItems() {
  const open = makeItem({ name: "Open Item" });
  const inProgress = makeItem({
    name: "In Progress Item",
    claimed_by_trip_member_id: MEMBER_A,
  });
  const completed = makeItem({
    name: "Completed Item",
    bought: true,
    completed_by_trip_member_id: MEMBER_A,
  });
  const removed = makeItem({
    name: "Removed Item",
    removed_at: "2026-01-02T00:00:00Z",
    removed_by_trip_member_id: MEMBER_B,
  });
  return { open, inProgress, completed, removed };
}

// The collapsible section toggle's accessible name is the aria-label
// template, NOT the bare state label — `completeAction` is also
// literally "Completed", so a bare "Completed" name would collide with
// the primary-action button on Open/In-progress rows.
function sectionToggleName(stateLabel: string) {
  return SHOPPING_LIST_UI_STRINGS.sectionToggle_aria_template.replace(
    "{section}",
    stateLabel
  );
}

// Filter-tab buttons carry an optional " · {count}" suffix, so an exact
// name match won't work; scope to the filter group and match by prefix —
// scoping (rather than a bare global regex) avoids collisions with other
// same-named controls on the page (e.g. a card's row-open button is
// labelled "Open {item name}").
function filterTab(name: string | RegExp) {
  const group = screen.getByRole("group", {
    name: A11Y_UI_STRINGS.shoppingListFilterGroup,
  });
  return within(group).getByRole("button", { name });
}

async function renderList(items: ShoppingItem[]) {
  const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
  render(
    <ShoppingList items={items} tripMembers={TRIP_MEMBERS} tripId={TRIP_ID} viewer={VIEWER} />
  );
}

describe("<ShoppingList />", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    itemCounter = 0;
  });

  // ---- empty state -------------------------------------------------------

  it("empty state shows only when zero items exist", async () => {
    await renderList([]);
    expect(screen.getByText(EMPTY_STATES.shopping_list_empty)).toBeInTheDocument();
  });

  it("does NOT show the big empty state when items exist but a filtered tab is merely empty", async () => {
    const user = userEvent.setup();
    const items = [makeItem({ name: "Ice" })]; // open only
    await renderList(items);
    await user.click(
      filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateRemoved}`))
    );
    expect(screen.queryByText(EMPTY_STATES.shopping_list_empty)).not.toBeInTheDocument();
    expect(
      screen.getByText(SHOPPING_LIST_UI_STRINGS.filterTab_emptyNote)
    ).toBeInTheDocument();
  });

  // ---- grouping ------------------------------------------------------------

  it("groups a mix of all 4 derived states correctly in the All (sectioned) view", async () => {
    const { open, inProgress, completed, removed } = fourStateItems();
    await renderList([open, inProgress, completed, removed]);

    // Active items render flat, up top.
    expect(screen.getByText("Open Item")).toBeInTheDocument();
    expect(screen.getByText("In Progress Item")).toBeInTheDocument();

    // Completed/Removed render under their own dividers.
    expect(screen.getByText("Completed Item")).toBeInTheDocument();
    expect(screen.getByText("Removed Item")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: sectionToggleName(SHOPPING_LIST_UI_STRINGS.stateCompleted),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: sectionToggleName(SHOPPING_LIST_UI_STRINGS.stateRemoved),
      })
    ).toBeInTheDocument();
  });

  // ---- segmented filter ----------------------------------------------------

  it("defaults to the All (sectioned) segment", async () => {
    const { open, completed } = fourStateItems();
    await renderList([open, completed]);
    expect(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.filterAll })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the Open tab filters to only open items", async () => {
    const user = userEvent.setup();
    const { open, inProgress, completed, removed } = fourStateItems();
    await renderList([open, inProgress, completed, removed]);

    await user.click(filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateOpen}`)));

    expect(screen.getByText("Open Item")).toBeInTheDocument();
    expect(screen.queryByText("In Progress Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Completed Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Removed Item")).not.toBeInTheDocument();
  });

  it("clicking the In-progress tab filters to only in-progress items", async () => {
    const user = userEvent.setup();
    const { open, inProgress, completed, removed } = fourStateItems();
    await renderList([open, inProgress, completed, removed]);

    await user.click(
      filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateInProgress}`))
    );

    expect(screen.getByText("In Progress Item")).toBeInTheDocument();
    expect(screen.queryByText("Open Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Completed Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Removed Item")).not.toBeInTheDocument();
  });

  it("clicking the Completed tab filters to only completed items", async () => {
    const user = userEvent.setup();
    const { open, inProgress, completed, removed } = fourStateItems();
    await renderList([open, inProgress, completed, removed]);

    await user.click(
      filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateCompleted}`))
    );

    expect(screen.getByText("Completed Item")).toBeInTheDocument();
    expect(screen.queryByText("Open Item")).not.toBeInTheDocument();
    expect(screen.queryByText("In Progress Item")).not.toBeInTheDocument();
    expect(screen.queryByText("Removed Item")).not.toBeInTheDocument();
  });

  it("removed items appear under the Removed tab and never under Open/active", async () => {
    const user = userEvent.setup();
    const { open, inProgress, removed } = fourStateItems();
    await renderList([open, inProgress, removed]);

    await user.click(
      filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateRemoved}`))
    );
    expect(screen.getByText("Removed Item")).toBeInTheDocument();

    await user.click(filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateOpen}`)));
    expect(screen.queryByText("Removed Item")).not.toBeInTheDocument();

    await user.click(
      filterTab(new RegExp(`^${SHOPPING_LIST_UI_STRINGS.stateInProgress}`))
    );
    expect(screen.queryByText("Removed Item")).not.toBeInTheDocument();
  });

  // ---- counts (optional, allowed) -------------------------------------------

  it("if a tab shows a count, it never renders a fraction or percentage", async () => {
    const { open, inProgress, completed, removed } = fourStateItems();
    await renderList([open, inProgress, completed, removed]);
    const group = screen.getByRole("group", {
      name: A11Y_UI_STRINGS.shoppingListFilterGroup,
    });
    expect(group.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
    expect(group.textContent).not.toContain("%");
  });

  // ---- sections --------------------------------------------------------

  it("does not render Completed/Removed dividers when both groups are empty", async () => {
    await renderList([makeItem({ name: "Just Open" })]);
    expect(
      screen.queryByRole("button", {
        name: sectionToggleName(SHOPPING_LIST_UI_STRINGS.stateCompleted),
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: sectionToggleName(SHOPPING_LIST_UI_STRINGS.stateRemoved),
      })
    ).not.toBeInTheDocument();
  });

  it("collapsing the Completed section hides its cards; expanding shows them again", async () => {
    const user = userEvent.setup();
    const { open, completed } = fourStateItems();
    await renderList([open, completed]);

    const toggle = screen.getByRole("button", {
      name: sectionToggleName(SHOPPING_LIST_UI_STRINGS.stateCompleted),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Completed Item")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Completed Item")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Completed Item")).toBeInTheDocument();
  });

  it("active items never render inside a collapsible section (no divider above them)", async () => {
    const { open, inProgress, completed } = fourStateItems();
    await renderList([open, inProgress, completed]);
    // Active items are NOT gated behind an aria-expanded toggle.
    const openItem = screen.getByText("Open Item");
    expect(openItem.closest("[aria-expanded]")).toBeNull();
    const inProgressItem = screen.getByText("In Progress Item");
    expect(inProgressItem.closest("[aria-expanded]")).toBeNull();
  });

  // ---- no-leaderboard guard (spec §12.2, carried from v1) -----------------

  it("renders items in created_at (input) order regardless of reaction counts — no-leaderboard guard", async () => {
    const items = [
      makeItem({ name: "Early Low Likes", created_at: "2026-01-01T00:00:00Z" }),
      makeItem({ name: "Later High Likes", created_at: "2026-01-02T00:00:00Z" }),
    ];
    const reactionsByItem = {
      [items[0].id]: { counts: { "👍": 0 }, mine: [] },
      [items[1].id]: { counts: { "👍": 99 }, mine: [] },
    };
    const { ShoppingList } = await import("@/components/trip/shopping-list/ShoppingList");
    render(
      <ShoppingList
        items={items}
        tripMembers={TRIP_MEMBERS}
        tripId={TRIP_ID}
        viewer={VIEWER}
        reactionsByItem={reactionsByItem}
      />
    );
    const rendered = screen.getAllByRole("listitem").map((li) => li.textContent);
    const earlyIndex = rendered.findIndex((t) => t?.includes("Early Low Likes"));
    const laterIndex = rendered.findIndex((t) => t?.includes("Later High Likes"));
    expect(earlyIndex).toBeGreaterThanOrEqual(0);
    expect(laterIndex).toBeGreaterThan(earlyIndex);
  });
});
