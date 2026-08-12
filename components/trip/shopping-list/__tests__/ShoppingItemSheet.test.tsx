/**
 * Tests for `components/trip/shopping-list/ShoppingItemSheet.tsx` (P2-T6)
 * and its split children `ShoppingReactionStrip` / `ShoppingNotesThread` /
 * `ShoppingNoteComposer`.
 *
 * Covers (spec §12.6):
 *   (a) reaction strip renders all six pills with NEUTRAL aria-labels —
 *       "thumbs down" present, "dislike"/"downvote" absent everywhere.
 *   (b) reaction pill count shown only when >= 1.
 *   (c) Notes thread renders comments in order + the empty state when none.
 *   (d) the composer's idempotency key ROTATES on every confirmed ok:true —
 *       two sequential successful submits call addShoppingComment with
 *       DIFFERENT keys.
 *   (e) an rls_denied from a comment/reaction on an open item triggers
 *       onClose + surfaces the shopping_item_gone copy.
 *   (f) no `.email` ever renders (I6).
 *
 * Actions and next/navigation are mocked — this is a focused component
 * test, not an integration test against the db layer.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import type {
  ShoppingItem,
  ShoppingItemComment,
  ShoppingItemReactionSummary,
  TripMember,
} from "@/lib/db/types";
import type { ViewerMember } from "@/lib/db/trips";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const toggleShoppingReactionMock = vi.fn();
vi.mock("@/lib/actions/shopping-item-reactions", () => ({
  toggleShoppingReaction: (...args: unknown[]) =>
    toggleShoppingReactionMock(...args),
}));

const addShoppingCommentMock = vi.fn();
const deleteShoppingCommentMock = vi.fn();
vi.mock("@/lib/actions/shopping-item-comments", () => ({
  addShoppingComment: (...args: unknown[]) => addShoppingCommentMock(...args),
  deleteShoppingComment: (...args: unknown[]) =>
    deleteShoppingCommentMock(...args),
}));

const amendShoppingItemMock = vi.fn();
vi.mock("@/lib/actions/shopping-list", () => ({
  amendShoppingItem: (...args: unknown[]) => amendShoppingItemMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // viewer
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // author

const MEMBER_MAP = new Map<string, TripMember>([
  [
    MEMBER_A,
    {
      id: MEMBER_A,
      trip_id: TRIP_ID,
      user_id: "user-a",
      role: "attendee",
      rsvp_status: "going",
      joined_at: "2026-01-01T00:00:00Z",
      is_celebrant: false,
      display_name: "Dave",
      phone_e164: null,
      email: "dave@example.com",
      idempotency_key: null,
    },
  ],
  [
    MEMBER_B,
    {
      id: MEMBER_B,
      trip_id: TRIP_ID,
      user_id: "user-b",
      role: "organizer",
      rsvp_status: "going",
      joined_at: "2026-01-01T00:00:00Z",
      is_celebrant: false,
      display_name: "Marcus",
      phone_e164: null,
      email: "marcus@example.com",
      idempotency_key: null,
    },
  ],
]);

const VIEWER: ViewerMember = {
  id: MEMBER_A,
  role: "attendee",
  is_celebrant: false,
  rsvp_status: "going",
  display_name: "Dave",
  phone_e164: null,
  idempotency_key: null,
};

const NOW = new Date("2026-08-11T12:00:00Z");

function makeItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: "item-1",
    trip_id: TRIP_ID,
    created_by_trip_member_id: MEMBER_B,
    claimed_by_trip_member_id: null,
    name: "Tequila",
    category: null,
    bought: false,
    cost_cents: null,
    currency: "USD",
    visibility: "everyone",
    idempotency_key: null,
    created_at: "2026-08-10T12:00:00Z",
    completed_by_trip_member_id: null,
    removed_by_trip_member_id: null,
    removed_at: null,
    claim_assigned_by_trip_member_id: null,
    ...overrides,
  };
}

function makeComment(overrides: Partial<ShoppingItemComment> = {}): ShoppingItemComment {
  return {
    id: `comment-${Math.random()}`,
    item_id: "item-1",
    trip_id: TRIP_ID,
    author_trip_member_id: MEMBER_B,
    body: "Get the good stuff",
    idempotency_key: null,
    created_at: "2026-08-11T10:00:00Z",
    authorDisplayName: "Marcus",
    ...overrides,
  };
}

async function renderSheet(
  props: {
    item?: Partial<ShoppingItem>;
    reactionSummary?: ShoppingItemReactionSummary;
    comments?: ShoppingItemComment[];
    onClose?: () => void;
  } = {}
) {
  const { ShoppingItemSheet } = await import(
    "@/components/trip/shopping-list/ShoppingItemSheet"
  );
  const onClose = props.onClose ?? vi.fn();
  const item = makeItem(props.item ?? {});
  render(
    <ShoppingItemSheet
      item={item}
      reactionSummary={props.reactionSummary}
      comments={props.comments ?? []}
      memberMap={MEMBER_MAP}
      viewer={VIEWER}
      now={NOW}
      onClose={onClose}
    />
  );
  return { onClose, item };
}

describe("<ShoppingItemSheet />", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    toggleShoppingReactionMock.mockReset();
    addShoppingCommentMock.mockReset();
    deleteShoppingCommentMock.mockReset();
    amendShoppingItemMock.mockReset();
  });

  // ---- (a) neutral reaction aria labels -----------------------------

  it("(a) renders all six reaction pills with NEUTRAL aria-labels", async () => {
    await renderSheet();
    const group = screen.getByRole("group", {
      name: SHOPPING_LIST_UI_STRINGS.reactionsGroup_aria,
    });
    expect(within(group).getByRole("button", { name: "thumbs up" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "thumbs down" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "heart" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "fire" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "laughing" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "cheers" })).toBeInTheDocument();
  });

  it("(a) NEVER uses the toxic frame 'dislike'/'downvote' anywhere", async () => {
    await renderSheet();
    expect(screen.queryByText(/dislike/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/downvote/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dislike/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /downvote/i })
    ).not.toBeInTheDocument();
  });

  // ---- (b) count shown only >= 1 -------------------------------------

  it("(b) shows a pill's count only when it's >= 1", async () => {
    await renderSheet({
      reactionSummary: { counts: { "👍": 3, "👎": 0 }, mine: [] },
    });
    expect(
      screen.getByRole("button", { name: "thumbs up" })
    ).toHaveTextContent("3");
    expect(
      screen.getByRole("button", { name: "thumbs down" })
    ).not.toHaveTextContent(/\d/);
  });

  it("(b) a zero-count pill is still a tappable ghost, not hidden", async () => {
    await renderSheet({ reactionSummary: { counts: {}, mine: [] } });
    expect(screen.getByRole("button", { name: "cheers" })).toBeInTheDocument();
  });

  // ---- (c) notes thread order + empty state --------------------------

  it("(c) renders comments in order, newest at the bottom", async () => {
    const first = makeComment({
      id: "c1",
      body: "Bring limes",
      created_at: "2026-08-11T08:00:00Z",
    });
    const second = makeComment({
      id: "c2",
      body: "And salt",
      created_at: "2026-08-11T09:00:00Z",
    });
    await renderSheet({ comments: [first, second] });
    const items = screen.getAllByText(/Bring limes|And salt/);
    expect(items[0]).toHaveTextContent("Bring limes");
    expect(items[1]).toHaveTextContent("And salt");
  });

  it("(c) shows the empty-thread copy when there are no comments", async () => {
    await renderSheet({ comments: [] });
    expect(
      screen.getByText(SHOPPING_LIST_UI_STRINGS.notesEmpty)
    ).toBeInTheDocument();
  });

  it('(c) the Notes header is the plain word "Notes", never "Notes (n)"', async () => {
    await renderSheet({ comments: [makeComment(), makeComment({ id: "c2" })] });
    const heading = screen.getByRole("heading", {
      name: SHOPPING_LIST_UI_STRINGS.notesHeading,
    });
    expect(heading.textContent).toBe(SHOPPING_LIST_UI_STRINGS.notesHeading);
  });

  // ---- (d) composer idempotency-key rotation --------------------------

  it("(d) rotates the idempotency key on every confirmed ok:true — two posts use DIFFERENT keys", async () => {
    let call = 0;
    addShoppingCommentMock.mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        comment: makeComment({ id: `c${call}`, body: `note ${call}` }),
      };
    });
    const user = userEvent.setup();
    await renderSheet();

    const input = screen.getByPlaceholderText(
      SHOPPING_LIST_UI_STRINGS.notePlaceholder
    );
    const submit = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.noteComposerSubmit_aria,
    });

    // Composer seeds its key in a useEffect (client-only) — wait for the
    // submit button to become enabled once typed.
    await user.type(input, "first note");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);
    await waitFor(() => expect(addShoppingCommentMock).toHaveBeenCalledTimes(1));

    await user.type(input, "second note");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);
    await waitFor(() => expect(addShoppingCommentMock).toHaveBeenCalledTimes(2));

    const firstKey = addShoppingCommentMock.mock.calls[0]?.[1];
    const secondKey = addShoppingCommentMock.mock.calls[1]?.[1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).not.toBe(secondKey);
  });

  it("(d) a FAILED submit reuses the same key on the next attempt", async () => {
    addShoppingCommentMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "shopping_comment_save_failed",
    });
    const user = userEvent.setup();
    await renderSheet();

    const input = screen.getByPlaceholderText(
      SHOPPING_LIST_UI_STRINGS.notePlaceholder
    );
    const submit = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.noteComposerSubmit_aria,
    });

    await user.type(input, "flaky note");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);
    await waitFor(() => expect(addShoppingCommentMock).toHaveBeenCalledTimes(1));
    const firstKey = addShoppingCommentMock.mock.calls[0]?.[1];

    // Text stays in the box after a failed submit — retype to resubmit.
    addShoppingCommentMock.mockResolvedValueOnce({
      ok: true,
      comment: makeComment({ body: "flaky note" }),
    });
    await user.click(submit);
    await waitFor(() => expect(addShoppingCommentMock).toHaveBeenCalledTimes(2));
    const retryKey = addShoppingCommentMock.mock.calls[1]?.[1];

    expect(retryKey).toBe(firstKey);
  });

  // ---- (e) item-gone handling -----------------------------------------

  it("(e) an rls_denied from a reaction toggle on an open item closes the sheet + surfaces shopping_item_gone", async () => {
    toggleShoppingReactionMock.mockResolvedValue({
      ok: false,
      errorKey: "rls_denied",
    });
    const user = userEvent.setup();
    const { onClose } = await renderSheet();

    await user.click(screen.getByRole("button", { name: "thumbs up" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent(
      ERRORS.shopping_item_gone
    );
  });

  it("(e) an rls_denied from a note post on an open item closes the sheet + surfaces shopping_item_gone", async () => {
    addShoppingCommentMock.mockResolvedValue({
      ok: false,
      errorKey: "rls_denied",
    });
    const user = userEvent.setup();
    const { onClose } = await renderSheet();

    const input = screen.getByPlaceholderText(
      SHOPPING_LIST_UI_STRINGS.notePlaceholder
    );
    const submit = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.noteComposerSubmit_aria,
    });
    await user.type(input, "does this land?");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent(
      ERRORS.shopping_item_gone
    );
  });

  it("(e) a non-rls_denied reaction failure surfaces the generic reaction error, NOT shopping_item_gone", async () => {
    toggleShoppingReactionMock.mockResolvedValue({
      ok: false,
      errorKey: "shopping_reaction_save_failed",
    });
    const user = userEvent.setup();
    const { onClose } = await renderSheet();

    await user.click(screen.getByRole("button", { name: "thumbs up" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ERRORS.shopping_reaction_save_failed
      )
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  // ---- (f) no .email ever renders ---------------------------------------

  it("(f) never renders a member's .email — only display_name / Someone fallback", async () => {
    await renderSheet({
      comments: [
        makeComment({ author_trip_member_id: MEMBER_B, authorDisplayName: "Marcus" }),
        makeComment({ id: "c-orphan", author_trip_member_id: null, authorDisplayName: undefined }),
      ],
    });
    expect(screen.queryByText("dave@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("marcus@example.com")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Marcus/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Someone/)).toBeInTheDocument();
  });

  // ---- header / claim smoke ----------------------------------------------

  it("renders the header 'Added by' line with the Someone fallback for a departed author", async () => {
    await renderSheet({ item: { created_by_trip_member_id: null } });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.addedBy_template
          .replace("{name}", "Someone")
          .replace("{when}", "1 day ago")
      )
    ).toBeInTheDocument();
  });

  it("✕ button and backdrop both call onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = await renderSheet();
    await user.click(
      screen.getAllByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.sheetClose_aria,
      })[0]
    );
    expect(onClose).toHaveBeenCalled();
  });

  // ---- read-only v2 status line ---------------------------------------
  // The sheet no longer offers a claim toggle (Task 5c) — status is a
  // read-only line derived from `deriveShoppingItemState`, mirroring
  // `ShoppingItemCard`'s statusLine.

  it("shows the Open status line when unclaimed / not bought / not removed", async () => {
    await renderSheet({ item: { claimed_by_trip_member_id: null } });
    expect(
      screen.getByText(SHOPPING_LIST_UI_STRINGS.stateOpen)
    ).toBeInTheDocument();
  });

  it("shows 'You to complete' when the VIEWER is the claimer", async () => {
    await renderSheet({ item: { claimed_by_trip_member_id: MEMBER_A } });
    expect(
      screen.getByText(SHOPPING_LIST_UI_STRINGS.inProgressYou)
    ).toBeInTheDocument();
  });

  it("shows '{name} to complete' when someone ELSE is the claimer", async () => {
    await renderSheet({ item: { claimed_by_trip_member_id: MEMBER_B } });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.inProgressThem_template.replace(
          "{name}",
          "Marcus"
        )
      )
    ).toBeInTheDocument();
  });

  it("shows 'Completed by {name}' for a completed item", async () => {
    await renderSheet({
      item: {
        bought: true,
        claimed_by_trip_member_id: MEMBER_B,
        completed_by_trip_member_id: MEMBER_B,
      },
    });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.completedBy_template.replace(
          "{name}",
          "Marcus"
        )
      )
    ).toBeInTheDocument();
  });

  it("shows 'Removed by {name}' for a removed item", async () => {
    await renderSheet({
      item: {
        removed_at: "2026-08-11T11:00:00Z",
        removed_by_trip_member_id: MEMBER_A,
      },
    });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.removedBy_template.replace("{name}", "Dave")
      )
    ).toBeInTheDocument();
  });

  it("never renders a claim-toggle control — no 'I've got this' / 'Off your plate' button", async () => {
    // Literal strings, not `SHOPPING_LIST_UI_STRINGS.claimCta` /
    // `.unclaim` — those keys were retired (Task 8b, precise-copy
    // migration); this guard must survive their deletion.
    await renderSheet({ item: { claimed_by_trip_member_id: null } });
    expect(
      screen.queryByRole("button", { name: "I've got this" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Off your plate." })
    ).not.toBeInTheDocument();
  });

  // ---- provenance line (rule #8) ---------------------------------------

  it("shows the assignedByProvenance line on an ON-BEHALF assign (assigner !== assignee)", async () => {
    await renderSheet({
      item: {
        claimed_by_trip_member_id: MEMBER_A,
        claim_assigned_by_trip_member_id: MEMBER_B,
      },
    });
    expect(
      screen.getByText(
        SHOPPING_LIST_UI_STRINGS.assignedByProvenance_template
          .replace("{assigner}", "Marcus")
          .replace("{assignee}", "Dave")
      )
    ).toBeInTheDocument();
  });

  it("hides the provenance line on a SELF-claim (claim_assigned_by is null)", async () => {
    await renderSheet({
      item: {
        claimed_by_trip_member_id: MEMBER_A,
        claim_assigned_by_trip_member_id: null,
      },
    });
    expect(
      screen.queryByText(
        SHOPPING_LIST_UI_STRINGS.assignedByProvenance_template
          .replace("{assigner}", "Marcus")
          .replace("{assignee}", "Dave")
      )
    ).not.toBeInTheDocument();
  });

  it("hides the provenance line when the item is unclaimed (Open — no one)", async () => {
    await renderSheet({
      item: {
        claimed_by_trip_member_id: null,
        claim_assigned_by_trip_member_id: null,
      },
    });
    expect(screen.queryByText(/put.*on this/)).not.toBeInTheDocument();
  });

  // ---- Task 7b — inline amend/edit (name/category/cost) ----------------

  it("Edit reveals the form prefilled with current name/category/cost", async () => {
    const user = userEvent.setup();
    await renderSheet({
      item: { name: "Tequila", category: "booze", cost_cents: 4500 },
    });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );

    expect(screen.getByDisplayValue("Tequila")).toBeInTheDocument();
    expect(screen.getByDisplayValue("45.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.categoryBooze,
      })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("changing ONLY the name sends { name } — category/costCents NOT in the patch (gap-A)", async () => {
    amendShoppingItemMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await renderSheet({
      item: { name: "Tequila", category: "booze", cost_cents: 4500 },
    });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    const nameInput = screen.getByDisplayValue("Tequila");
    await user.clear(nameInput);
    await user.type(nameInput, "Mezcal");

    const save = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.editSave,
    });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() =>
      expect(amendShoppingItemMock).toHaveBeenCalledTimes(1)
    );
    const [id, patch] = amendShoppingItemMock.mock.calls[0];
    expect(id).toBe("item-1");
    expect(patch).toEqual({ name: "Mezcal" });
    expect(patch).not.toHaveProperty("category");
    expect(patch).not.toHaveProperty("costCents");
  });

  it("clearing category sends { category: null }", async () => {
    amendShoppingItemMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await renderSheet({ item: { category: "booze" } });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    await user.click(
      screen.getByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.categoryBooze,
      })
    );

    const save = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.editSave,
    });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() =>
      expect(amendShoppingItemMock).toHaveBeenCalledWith("item-1", {
        category: null,
      })
    );
  });

  it("changing cost sends costCents in cents; clearing cost sends { costCents: null }", async () => {
    amendShoppingItemMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { item } = await renderSheet({ item: { cost_cents: 4500 } });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    const costInput = screen.getByDisplayValue("45.00");
    await user.clear(costInput);
    await user.type(costInput, "12.50");

    let save = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.editSave,
    });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() =>
      expect(amendShoppingItemMock).toHaveBeenCalledWith(item.id, {
        costCents: 1250,
      })
    );

    amendShoppingItemMock.mockClear();
    amendShoppingItemMock.mockResolvedValue({ ok: true });

    // reopen — clear cost entirely
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    const costInput2 = screen.getByDisplayValue("45.00");
    await user.clear(costInput2);

    save = screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editSave });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() =>
      expect(amendShoppingItemMock).toHaveBeenCalledWith(item.id, {
        costCents: null,
      })
    );
  });

  it("Save is disabled with no changes / does not call the action", async () => {
    const user = userEvent.setup();
    await renderSheet({ item: { name: "Tequila" } });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    const save = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.editSave,
    });
    expect(save).toBeDisabled();
    expect(amendShoppingItemMock).not.toHaveBeenCalled();
  });

  it("ok:true exits edit mode and calls router.refresh", async () => {
    amendShoppingItemMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await renderSheet({ item: { name: "Tequila" } });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    const nameInput = screen.getByDisplayValue("Tequila");
    await user.clear(nameInput);
    await user.type(nameInput, "Mezcal");
    const save = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.editSave,
    });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editSave })
    ).not.toBeInTheDocument();
  });

  it("a failed amend keeps the form open and shows an alert", async () => {
    amendShoppingItemMock.mockResolvedValue({
      ok: false,
      errorKey: "shopping_list_save_failed",
    });
    const user = userEvent.setup();
    await renderSheet({ item: { name: "Tequila" } });

    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editCta })
    );
    const nameInput = screen.getByDisplayValue("Tequila");
    await user.clear(nameInput);
    await user.type(nameInput, "Mezcal");
    const save = screen.getByRole("button", {
      name: SHOPPING_LIST_UI_STRINGS.editSave,
    });
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ERRORS.shopping_list_save_failed
      )
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.editSave })
    ).toBeInTheDocument();
  });
});
