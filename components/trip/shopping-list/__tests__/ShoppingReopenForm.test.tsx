/**
 * Tests for `components/trip/shopping-list/ShoppingReopenForm.tsx`
 * (Task 5b) — the reopen-with-note inline panel opened by the "Re-open"
 * primary action on a terminal (Completed/Removed) row.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TripMember } from "@/lib/db/types";

const reopenShoppingItemMock = vi.fn();
vi.mock("@/lib/actions/shopping-list", () => ({
  reopenShoppingItem: (...args: unknown[]) => reopenShoppingItemMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeMember(id: string, displayName: string): TripMember {
  return {
    id,
    trip_id: TRIP_ID,
    user_id: `user-${id}`,
    role: "attendee",
    rsvp_status: "going",
    joined_at: "2026-01-01T00:00:00Z",
    is_celebrant: false,
    display_name: displayName,
    phone_e164: null,
    email: null,
    idempotency_key: null,
  };
}

const MEMBERS: TripMember[] = [makeMember(MEMBER_A, "Dave"), makeMember(MEMBER_B, "Winston")];
const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.id, m]));

async function renderForm(
  props: { onCancel?: () => void; onConfirmed?: () => void } = {}
) {
  const { ShoppingReopenForm } = await import(
    "@/components/trip/shopping-list/ShoppingReopenForm"
  );
  const onCancel = props.onCancel ?? vi.fn();
  const onConfirmed = props.onConfirmed ?? vi.fn();
  render(
    <ShoppingReopenForm
      itemId={ITEM_ID}
      members={MEMBERS}
      memberMap={MEMBER_MAP}
      onCancel={onCancel}
      onConfirmed={onConfirmed}
    />
  );
  return { onCancel, onConfirmed };
}

beforeEach(() => {
  reopenShoppingItemMock.mockReset();
  reopenShoppingItemMock.mockResolvedValue({ ok: true });
});

describe("<ShoppingReopenForm />", () => {
  it("defaults the assign picker to 'Open — no one'", async () => {
    await renderForm();
    expect(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.assignOpenNoOne })
    ).toBeInTheDocument();
  });

  it("confirm with no note calls reopenShoppingItem with assignTo:null and comment undefined", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    expect(reopenShoppingItemMock).toHaveBeenCalledTimes(1);
    const [itemId, opts, key] = reopenShoppingItemMock.mock.calls[0];
    expect(itemId).toBe(ITEM_ID);
    expect(opts).toEqual({ assignTo: null, comment: undefined });
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("picking an assignee then confirming passes that member's id as assignTo", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.assignOpenNoOne })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Winston" }));
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    const [, opts] = reopenShoppingItemMock.mock.calls[0];
    expect(opts.assignTo).toBe(MEMBER_B);
  });

  it("a typed note is trimmed and passed as comment on confirm", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.type(
      screen.getByPlaceholderText(SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder),
      "  grab the receipt  "
    );
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    const [, opts] = reopenShoppingItemMock.mock.calls[0];
    expect(opts.comment).toBe("grab the receipt");
  });

  it("a blank/whitespace-only note is omitted (comment undefined)", async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.type(
      screen.getByPlaceholderText(SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder),
      "   "
    );
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    const [, opts] = reopenShoppingItemMock.mock.calls[0];
    expect(opts.comment).toBeUndefined();
  });

  it("confirm calls onConfirmed on ok:true", async () => {
    const user = userEvent.setup();
    const { onConfirmed } = await renderForm();
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    expect(onConfirmed).toHaveBeenCalled();
  });

  it("cancel calls onCancel without mutating", async () => {
    const user = userEvent.setup();
    const { onCancel } = await renderForm();
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.cancelCta })
    );
    expect(onCancel).toHaveBeenCalled();
    expect(reopenShoppingItemMock).not.toHaveBeenCalled();
  });

  it("a shopping_comment_* error surfaces in role=alert and keeps the form open (does not call onConfirmed)", async () => {
    reopenShoppingItemMock.mockResolvedValue({
      ok: false,
      errorKey: "shopping_comment_save_failed",
    });
    const user = userEvent.setup();
    const { onConfirmed } = await renderForm();
    await user.type(
      screen.getByPlaceholderText(SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder),
      "note"
    );
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    // Form stays open — the reopen action + note composer are still rendered.
    expect(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    ).toBeInTheDocument();
  });

  it("retrying after a comment error reuses the same idempotency key", async () => {
    reopenShoppingItemMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "shopping_comment_save_failed",
    });
    reopenShoppingItemMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    await renderForm();
    await user.type(
      screen.getByPlaceholderText(SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder),
      "note"
    );
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: SHOPPING_LIST_UI_STRINGS.reopenAction })
    );
    const firstKey = reopenShoppingItemMock.mock.calls[0][2];
    const secondKey = reopenShoppingItemMock.mock.calls[1][2];
    expect(secondKey).toBe(firstKey);
  });
});
