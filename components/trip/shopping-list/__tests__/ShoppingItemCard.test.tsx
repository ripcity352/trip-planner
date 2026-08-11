/**
 * Tests for `components/trip/shopping-list/ShoppingItemCard.tsx` (P2-T5).
 *
 * Covers the row's glanceable social affordances (spec §12.6):
 *   (a) the 👍 like control renders its count only when ≥1 — never "👍 0"
 *   (b) the 💬n note-count renders only when ≥1
 *   (c) the meta slot renders nothing when like=0 & notes=0 (no placeholder)
 *   (d) no 👎 or any other reaction emoji ever appears on the row
 *   (e) tapping the row body opens the detail sheet via `onOpenItem`,
 *       including on a bought/struck row
 *   (f) tapping the 👍 like control does NOT fire `onOpenItem`
 *
 * Actions and next/navigation are mocked — this is a focused component
 * test, not an integration test against the db layer.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ROW_LIKE_EMOJI } from "@/lib/reactions/shopping-constants";
import type { ShoppingItem, ShoppingItemReactionSummary, TripMember } from "@/lib/db/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/actions/shopping-list", () => ({
  toggleBought: vi.fn(),
  setClaim: vi.fn(),
  deleteShoppingItem: vi.fn(),
}));

const toggleShoppingReactionMock = vi.fn();
vi.mock("@/lib/actions/shopping-item-reactions", () => ({
  toggleShoppingReaction: (...args: unknown[]) => toggleShoppingReactionMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
    ...overrides,
  };
}

async function renderCard(
  props: {
    item?: Partial<ShoppingItem>;
    reactionSummary?: ShoppingItemReactionSummary;
    commentCount?: number;
    onOpenItem?: (itemId: string) => void;
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
      canDelete={false}
      claimReadOnly={false}
      reactionSummary={props.reactionSummary}
      commentCount={props.commentCount ?? 0}
      onOpenItem={onOpenItem}
    />
  );
  return { onOpenItem, item };
}

describe("<ShoppingItemCard /> — row social affordances (P2-T5)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    toggleShoppingReactionMock.mockReset();
  });

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

  it("(e) tapping the row body opens the detail sheet", async () => {
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

  it("(e) tapping the row body opens the detail sheet on a bought/struck row too", async () => {
    const user = userEvent.setup();
    const { onOpenItem, item } = await renderCard({ item: { bought: true } });
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
});
