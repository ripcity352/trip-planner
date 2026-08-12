/**
 * Tests for `components/trip/shopping-list/ShoppingMemberPicker.tsx`
 * (Task 5b) — the reusable crew picker shared by the assign/re-assign
 * flow and the who-completed flow on `ShoppingItemCard`.
 */

import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ShoppingMemberPicker } from "@/components/trip/shopping-list/ShoppingMemberPicker";
import type { TripMember } from "@/lib/db/types";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeMember(id: string, displayName: string | null): TripMember {
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
    email: "leaked@example.com",
    idempotency_key: null,
  };
}

const MEMBERS: TripMember[] = [
  makeMember(MEMBER_A, "Dave"),
  makeMember(MEMBER_B, "Winston"),
];
const MEMBER_MAP = new Map(MEMBERS.map((m) => [m.id, m]));

describe("<ShoppingMemberPicker />", () => {
  it("renders one item per member, named via resolveMemberName, and never an email", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne={false}
        triggerLabel="Assign…"
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign…" }));
    expect(await screen.findByRole("menuitem", { name: "Dave" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Winston" })).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("omits the 'Open — no one' item when includeOpenNoOne is false", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne={false}
        triggerLabel="Assign…"
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign…" }));
    await screen.findByRole("menu");
    expect(
      screen.queryByRole("menuitem", {
        name: SHOPPING_LIST_UI_STRINGS.assignOpenNoOne,
      })
    ).not.toBeInTheDocument();
  });

  it("renders 'Open — no one' as the first item when includeOpenNoOne is true", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne
        triggerLabel="Assign…"
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign…" }));
    expect(
      await screen.findByRole("menuitem", {
        name: SHOPPING_LIST_UI_STRINGS.assignOpenNoOne,
      })
    ).toBeInTheDocument();
  });

  it("selecting a member calls onSelect with that member's id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne={false}
        triggerLabel="Assign…"
        onSelect={onSelect}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign…" }));
    await user.click(await screen.findByRole("menuitem", { name: "Winston" }));
    expect(onSelect).toHaveBeenCalledWith(MEMBER_B);
  });

  it("selecting 'Open — no one' calls onSelect with null", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne
        triggerLabel="Assign…"
        onSelect={onSelect}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign…" }));
    await user.click(
      await screen.findByRole("menuitem", {
        name: SHOPPING_LIST_UI_STRINGS.assignOpenNoOne,
      })
    );
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("controlled `open` renders the menu without a trigger click", async () => {
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne={false}
        triggerLabel={SHOPPING_LIST_UI_STRINGS.completedByPickerTitle}
        onSelect={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(
      await screen.findByRole("menuitem", { name: "Dave" })
    ).toBeInTheDocument();
  });

  it("marks the default member with aria-current for default-highlighting", async () => {
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne={false}
        triggerLabel={SHOPPING_LIST_UI_STRINGS.completedByPickerTitle}
        onSelect={vi.fn()}
        defaultMemberId={MEMBER_B}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(
      await screen.findByRole("menuitem", { name: "Winston" })
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("menuitem", { name: "Dave" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("visibly distinguishes the default member — not just aria-current", async () => {
    render(
      <ShoppingMemberPicker
        members={MEMBERS}
        memberMap={MEMBER_MAP}
        includeOpenNoOne={false}
        triggerLabel={SHOPPING_LIST_UI_STRINGS.completedByPickerTitle}
        onSelect={vi.fn()}
        defaultMemberId={MEMBER_B}
        open
        onOpenChange={vi.fn()}
      />
    );
    const defaultItem = await screen.findByRole("menuitem", { name: "Winston" });
    const nonDefaultItem = screen.getByRole("menuitem", { name: "Dave" });

    // Visible emphasis class on the default item only.
    expect(defaultItem.className).toContain("font-medium");
    expect(nonDefaultItem.className).not.toContain("font-medium");

    // A visible leading marker ("•") inside the default item, absent from
    // the non-default item — `aria-current` alone carries no default
    // browser styling, so this is the actual visible affordance.
    expect(defaultItem.textContent).toContain("•");
    expect(nonDefaultItem.textContent).not.toContain("•");
  });
});
