/**
 * Tests for `components/trip/shopping-list/ShoppingItemCard.tsx` (P2-T5,
 * v2 row rewrite Task 5a).
 *
 * Covers:
 *   - the row's glanceable social affordances (spec §12.6): like control,
 *     note count, meta-slot emptiness, row-open a11y pattern (unchanged
 *     in v2 — kept verbatim per the module header)
 *   - v2 row legibility (spec §4): state glyph (interactive on non-terminal
 *     states, static on terminal states), one attributed status line per
 *     state, exactly one primary action button per state, and the `⋯`
 *     overflow menu (soft Remove + two-tap purge)
 *
 * Actions and next/navigation are mocked — this is a focused component
 * test, not an integration test against the db layer.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ROW_LIKE_EMOJI } from "@/lib/reactions/shopping-constants";
import type { ShoppingItem, ShoppingItemReactionSummary, TripMember } from "@/lib/db/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const assignShoppingItemMock = vi.fn();
const completeShoppingItemMock = vi.fn();
const removeShoppingItemMock = vi.fn();
const reopenShoppingItemMock = vi.fn();
const deleteShoppingItemMock = vi.fn();
vi.mock("@/lib/actions/shopping-list", () => ({
  assignShoppingItem: (...args: unknown[]) => assignShoppingItemMock(...args),
  completeShoppingItem: (...args: unknown[]) => completeShoppingItemMock(...args),
  removeShoppingItem: (...args: unknown[]) => removeShoppingItemMock(...args),
  reopenShoppingItem: (...args: unknown[]) => reopenShoppingItemMock(...args),
  deleteShoppingItem: (...args: unknown[]) => deleteShoppingItemMock(...args),
}));

const toggleShoppingReactionMock = vi.fn();
vi.mock("@/lib/actions/shopping-item-reactions", () => ({
  toggleShoppingReaction: (...args: unknown[]) => toggleShoppingReactionMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const MEMBER_MAP = new Map<string, TripMember>([
  [
    MEMBER_A,
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
  ],
  [
    MEMBER_B,
    {
      id: MEMBER_B,
      trip_id: TRIP_ID,
      user_id: "user-b",
      role: "attendee",
      rsvp_status: "going",
      joined_at: "2026-01-01T00:00:00Z",
      is_celebrant: false,
      display_name: "Winston",
      phone_e164: null,
      email: null,
      idempotency_key: null,
    },
  ],
]);

function makeItem(overrides: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: "item-1",
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

async function renderCard(
  props: {
    item?: Partial<ShoppingItem>;
    reactionSummary?: ShoppingItemReactionSummary;
    commentCount?: number;
    onOpenItem?: (itemId: string) => void;
    canDelete?: boolean;
  } = {}
) {
  const { ShoppingItemCard } = await import(
    "@/components/trip/shopping-list/ShoppingItemCard"
  );
  const onOpenItem = props.onOpenItem ?? vi.fn();
  const item = makeItem(props.item ?? {});
  render(
    <ShoppingItemCard
      item={item}
      memberMap={MEMBER_MAP}
      viewerMemberId={MEMBER_A}
      canDelete={props.canDelete ?? false}
      claimReadOnly={false}
      reactionSummary={props.reactionSummary}
      commentCount={props.commentCount ?? 0}
      onOpenItem={onOpenItem}
    />
  );
  return { onOpenItem, item };
}

const ALL_MOCKS = [
  refreshMock,
  assignShoppingItemMock,
  completeShoppingItemMock,
  removeShoppingItemMock,
  reopenShoppingItemMock,
  deleteShoppingItemMock,
  toggleShoppingReactionMock,
];

beforeEach(() => {
  for (const mock of ALL_MOCKS) mock.mockReset();
  assignShoppingItemMock.mockResolvedValue({ ok: true });
  completeShoppingItemMock.mockResolvedValue({ ok: true });
  removeShoppingItemMock.mockResolvedValue({ ok: true });
  reopenShoppingItemMock.mockResolvedValue({ ok: true });
  deleteShoppingItemMock.mockResolvedValue({ ok: true });
});

describe("<ShoppingItemCard /> — row social affordances (P2-T5)", () => {
  it("(a) renders the like count only when >= 1, never '👍 0'", async () => {
    await renderCard({
      reactionSummary: { counts: { [ROW_LIKE_EMOJI]: 3 }, mine: [] },
    });
    expect(screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.likeAria })).toHaveTextContent("3");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("(a) no like button renders when the like count is 0", async () => {
    await renderCard({ reactionSummary: { counts: {}, mine: [] } });
    expect(
      screen.queryByRole("button", { name: SHOPPING_LIST_UI_STRINGS.likeAria })
    ).not.toBeInTheDocument();
  });

  it("(b) renders 💬n only when the note count is >= 1", async () => {
    await renderCard({ commentCount: 2 });
    expect(screen.getByText("💬")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("(b) renders no note-count element when the note count is 0", async () => {
    await renderCard({ commentCount: 0 });
    expect(screen.queryByText("💬")).not.toBeInTheDocument();
  });

  it("(c) meta slot renders nothing when like=0 and notes=0", async () => {
    await renderCard({
      reactionSummary: { counts: {}, mine: [] },
      commentCount: 0,
    });
    expect(
      screen.queryByRole("button", { name: SHOPPING_LIST_UI_STRINGS.likeAria })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("💬")).not.toBeInTheDocument();
  });

  it("(d) never renders 👎 or any other reaction emoji on the row", async () => {
    await renderCard({
      reactionSummary: {
        counts: { [ROW_LIKE_EMOJI]: 1, "👎": 5, "❤️": 2, "🔥": 1, "😂": 1, "🍻": 1 },
        mine: [],
      },
    });
    expect(screen.queryByText("👎")).not.toBeInTheDocument();
    expect(screen.queryByText("❤️")).not.toBeInTheDocument();
    expect(screen.queryByText("🔥")).not.toBeInTheDocument();
    expect(screen.queryByText("😂")).not.toBeInTheDocument();
    expect(screen.queryByText("🍻")).not.toBeInTheDocument();
    // The row like control (👍 + its count) is the only reaction glyph.
    expect(screen.getByText(ROW_LIKE_EMOJI)).toBeInTheDocument();
  });

  // (e) These click REAL row content — the item name, a category chip, the
  // cost text — NOT the overlay button by role. Clicking the overlay by
  // role only proves the overlay's own handler fires; it says nothing
  // about whether taps on ordinary row content actually reach it (the
  // fall-through bug this suite exists to catch: a `relative z-10`
  // wrapper around the row's non-interactive content silently painted
  // OVER the overlay, so `fireEvent.click(screen.getByText(item.name))`
  // never reached it).
  it("(e) tapping the item name opens the detail sheet", async () => {
    const { onOpenItem, item } = await renderCard();
    fireEvent.click(screen.getByText(item.name));
    expect(onOpenItem).toHaveBeenCalledWith(item.id);
  });

  it("(e) tapping a category chip opens the detail sheet", async () => {
    const { onOpenItem, item } = await renderCard({
      item: { category: "snacks" },
    });
    fireEvent.click(screen.getByText("snacks"));
    expect(onOpenItem).toHaveBeenCalledWith(item.id);
  });

  it("(e) tapping the cost text opens the detail sheet", async () => {
    const { onOpenItem, item } = await renderCard({
      item: { cost_cents: 2500 },
    });
    fireEvent.click(screen.getByText("~$25.00"));
    expect(onOpenItem).toHaveBeenCalledWith(item.id);
  });

  it("(e) tapping row content opens the detail sheet on a completed row too", async () => {
    const { onOpenItem, item } = await renderCard({
      item: { bought: true, completed_by_trip_member_id: MEMBER_A },
    });
    fireEvent.click(screen.getByText(item.name));
    expect(onOpenItem).toHaveBeenCalledWith(item.id);
  });

  it("(e) the overlay button itself still opens the detail sheet (role-based click)", async () => {
    const user = userEvent.setup();
    const { onOpenItem, item } = await renderCard();
    await user.click(
      screen.getByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.openDetail_template.replace(
          "{name}",
          item.name
        ),
      })
    );
    expect(onOpenItem).toHaveBeenCalledWith(item.id);
  });

  it("(f) tapping the like control does NOT open the detail sheet", async () => {
    toggleShoppingReactionMock.mockResolvedValue({ ok: true, active: false });
    const user = userEvent.setup();
    const { onOpenItem } = await renderCard({
      reactionSummary: { counts: { [ROW_LIKE_EMOJI]: 1 }, mine: [ROW_LIKE_EMOJI] },
    });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.likeAria })
    );
    expect(onOpenItem).not.toHaveBeenCalled();
    expect(toggleShoppingReactionMock).toHaveBeenCalledWith({
      itemId: "item-1",
      emoji: ROW_LIKE_EMOJI,
      active: false,
    });
  });

  it("like toggle rolls back optimistic state on failure", async () => {
    toggleShoppingReactionMock.mockResolvedValue({
      ok: false,
      errorKey: "shopping_reaction_save_failed",
    });
    const user = userEvent.setup();
    await renderCard({
      reactionSummary: { counts: { [ROW_LIKE_EMOJI]: 1 }, mine: [ROW_LIKE_EMOJI] },
    });
    const likeButton = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.likeAria,
    });
    await user.click(likeButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Didn't stick. Give it another tap."
    );
    // Rolled back: still shows count 1 (the pre-toggle server state).
    expect(screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.likeAria })).toHaveTextContent("1");
  });

  // No `.email` anywhere on the row (I6) — resolveMemberName never needs it
  // and this row never renders a raw member record.
  it("never renders a member email anywhere on the row", async () => {
    await renderCard({
      item: {
        bought: true,
        completed_by_trip_member_id: MEMBER_A,
      },
    });
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});

describe("<ShoppingItemCard /> — v2 state glyph (spec §4)", () => {
  it("Open: glyph is ○ and an interactive completeAction-labelled button", async () => {
    await renderCard({ item: { claimed_by_trip_member_id: null, bought: false } });
    const glyph = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.completeAction,
    });
    expect(glyph).toHaveTextContent("○");
  });

  it("In-progress: glyph is ◐ and an interactive completeAction-labelled button", async () => {
    await renderCard({
      item: { claimed_by_trip_member_id: MEMBER_A, bought: false },
    });
    // In-progress shows the glyph AND the primary action button, both
    // aria-labelled `completeAction` by design (same mutation) — the
    // glyph is the one carrying the ◐ glyph text.
    const buttons = screen.getAllByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.completeAction,
    });
    // BOTH render on In-progress (spec §4 mock: `◐ … · [ Completed ]`): the
    // tappable glyph AND the separate primary button. Locking the count so a
    // regression that drops the primary button (leaving only the glyph) fails
    // here rather than silently passing the `.some(◐)` check.
    expect(buttons).toHaveLength(2);
    expect(buttons.some((btn) => btn.textContent === "◐")).toBe(true);
    expect(buttons.some((btn) => btn.textContent !== "◐")).toBe(true);
  });

  it("Completed: glyph is ✓ and static (no completeAction button)", async () => {
    await renderCard({
      item: { bought: true, completed_by_trip_member_id: MEMBER_A },
    });
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("✓")).toHaveAttribute("aria-hidden");
    expect(
      screen.queryByRole("button", { name: SHOPPING_LIST_UI_STRINGS.completeAction })
    ).not.toBeInTheDocument();
  });

  it("Removed: glyph is ⊘ and static (no completeAction button)", async () => {
    await renderCard({
      item: { removed_at: "2026-01-02T00:00:00Z", removed_by_trip_member_id: MEMBER_A },
    });
    expect(screen.getByText("⊘")).toBeInTheDocument();
    expect(screen.getByText("⊘")).toHaveAttribute("aria-hidden");
    expect(
      screen.queryByRole("button", { name: SHOPPING_LIST_UI_STRINGS.completeAction })
    ).not.toBeInTheDocument();
  });
});

describe("<ShoppingItemCard /> — v2 attributed status line (spec §4)", () => {
  it("Open → stateOpen", async () => {
    await renderCard({ item: { claimed_by_trip_member_id: null, bought: false } });
    expect(screen.getByText(SHOPPING_LIST_UI_STRINGS.stateOpen)).toBeInTheDocument();
  });

  it("In-progress, claimed by viewer → inProgressYou", async () => {
    await renderCard({ item: { claimed_by_trip_member_id: MEMBER_A } });
    expect(
      screen.getByText(SHOPPING_LIST_UI_STRINGS.inProgressYou)
    ).toBeInTheDocument();
  });

  it("In-progress, claimed by other → inProgressThem_template with the claimer's name", async () => {
    await renderCard({ item: { claimed_by_trip_member_id: MEMBER_B } });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.inProgressThem_template.replace("{name}", "Winston")
      )
    ).toBeInTheDocument();
  });

  it("Completed → completedBy_template with the completer's name", async () => {
    await renderCard({
      item: { bought: true, completed_by_trip_member_id: MEMBER_B },
    });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.completedBy_template.replace("{name}", "Winston")
      )
    ).toBeInTheDocument();
  });

  it("Removed → removedBy_template with the remover's name", async () => {
    await renderCard({
      item: {
        removed_at: "2026-01-02T00:00:00Z",
        removed_by_trip_member_id: MEMBER_B,
      },
    });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.removedBy_template.replace("{name}", "Winston")
      )
    ).toBeInTheDocument();
  });
});

describe("<ShoppingItemCard /> — v2 one primary action per state (spec §4)", () => {
  it("Open → claimSelfAction calls assignShoppingItem(id, viewerMemberId)", async () => {
    const user = userEvent.setup();
    const { item } = await renderCard({
      item: { claimed_by_trip_member_id: null, bought: false },
    });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.claimSelfAction })
    );
    expect(assignShoppingItemMock).toHaveBeenCalledWith(item.id, MEMBER_A);
    expect(refreshMock).toHaveBeenCalled();
  });

  it("Open row has exactly one primary action button (claimSelfAction only)", async () => {
    await renderCard({ item: { claimed_by_trip_member_id: null, bought: false } });
    expect(
      screen.queryByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    ).not.toBeInTheDocument();
  });

  it("In-progress (claimed by viewer) → completeAction calls completeShoppingItem(id, viewerMemberId)", async () => {
    const user = userEvent.setup();
    const { item } = await renderCard({
      item: { claimed_by_trip_member_id: MEMBER_A },
    });
    // The glyph button AND the primary action button share the same
    // accessible name (completeAction) by design — both trigger the same
    // mutation. Click the primary action (the last matching button).
    const buttons = screen.getAllByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.completeAction,
    });
    await user.click(buttons[buttons.length - 1]);
    expect(completeShoppingItemMock).toHaveBeenCalledWith(item.id, MEMBER_A);
  });

  it("In-progress claimed by OTHER: completeAction passes the OTHER's member id as completedBy (on-hook default)", async () => {
    const user = userEvent.setup();
    const { item } = await renderCard({
      item: { claimed_by_trip_member_id: MEMBER_B },
    });
    const buttons = screen.getAllByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.completeAction,
    });
    await user.click(buttons[buttons.length - 1]);
    expect(completeShoppingItemMock).toHaveBeenCalledWith(item.id, MEMBER_B);
  });

  it("Completed → reopenAction calls reopenShoppingItem(id, {assignTo: null})", async () => {
    const user = userEvent.setup();
    const { item } = await renderCard({
      item: { bought: true, completed_by_trip_member_id: MEMBER_A },
    });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    expect(reopenShoppingItemMock).toHaveBeenCalledWith(item.id, { assignTo: null });
  });

  it("Removed → reopenAction calls reopenShoppingItem(id, {assignTo: null})", async () => {
    const user = userEvent.setup();
    const { item } = await renderCard({
      item: {
        removed_at: "2026-01-02T00:00:00Z",
        removed_by_trip_member_id: MEMBER_A,
      },
    });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    expect(reopenShoppingItemMock).toHaveBeenCalledWith(item.id, { assignTo: null });
  });
});

describe("<ShoppingItemCard /> — v2 overflow menu (spec §4)", () => {
  it("Remove (non-terminal) calls removeShoppingItem, no confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    const { item } = await renderCard({
      item: { claimed_by_trip_member_id: null, bought: false },
    });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.itemMenu_aria })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: SHOPPING_LIST_UI_STRINGS.deleteCta })
    );
    expect(removeShoppingItemMock).toHaveBeenCalledWith(item.id);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("Remove is absent from the menu on a terminal (Completed) row", async () => {
    const user = userEvent.setup();
    await renderCard({
      item: { bought: true, completed_by_trip_member_id: MEMBER_A },
    });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.itemMenu_aria })
    );
    expect(
      await screen.findByRole("menu")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: SHOPPING_LIST_UI_STRINGS.deleteCta })
    ).not.toBeInTheDocument();
  });

  it("Permanent purge is absent when !canDelete", async () => {
    const user = userEvent.setup();
    await renderCard({ canDelete: false });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.itemMenu_aria })
    );
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: SHOPPING_LIST_UI_STRINGS.menuPurge })
    ).not.toBeInTheDocument();
  });

  it("Permanent purge two-tap arm-then-confirm calls deleteShoppingItem", async () => {
    const user = userEvent.setup();
    const { item } = await renderCard({ canDelete: true });
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.itemMenu_aria })
    );
    const purgeItem = await screen.findByRole("menuitem", {
      name: SHOPPING_LIST_UI_STRINGS.menuPurge,
    });
    // First tap arms — no mutation fired yet.
    await user.click(purgeItem);
    expect(deleteShoppingItemMock).not.toHaveBeenCalled();
    // Second tap (confirm label) commits.
    await user.click(
      await screen.findByRole("menuitem", {
        name: SHOPPING_LIST_UI_STRINGS.itemDeleteConfirm,
      })
    );
    expect(deleteShoppingItemMock).toHaveBeenCalledWith(item.id);
  });
});

describe("<ShoppingItemCard /> — row-open a11y preserved (spec §4)", () => {
  it("the row-open button still opens the sheet on an Open row", async () => {
    const { onOpenItem, item } = await renderCard({
      item: { claimed_by_trip_member_id: null, bought: false },
    });
    fireEvent.click(screen.getByText(item.name));
    expect(onOpenItem).toHaveBeenCalledWith(item.id);
  });
});
