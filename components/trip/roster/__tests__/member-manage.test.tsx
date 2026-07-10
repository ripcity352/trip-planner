/**
 * Tests for MemberManage (#386) — the organizer-only per-row affordance.
 *
 * Quiet overflow → inline panel with a role toggle + the #210 two-step
 * destructive remove. Eligibility (self / celebrant / founder rows never
 * get this component) is the PARENT's job and is pinned in
 * roster-list.test.tsx; here we test the interaction surface.
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MemberManage } from "../member-manage";

const setMemberRoleActionMock = vi.fn();
const removeMemberActionMock = vi.fn();
vi.mock("@/lib/actions/members", () => ({
  setMemberRoleAction: (...args: unknown[]) => setMemberRoleActionMock(...args),
  removeMemberAction: (...args: unknown[]) => removeMemberActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const TRIP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const MEMBER_ID = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02";

function renderManage(currentRole: "attendee" | "co_organizer" = "attendee") {
  render(
    <MemberManage
      tripId={TRIP_ID}
      memberId={MEMBER_ID}
      memberName="Kevin"
      currentRole={currentRole}
    />
  );
}

function openPanel(currentRole: "attendee" | "co_organizer" = "attendee") {
  renderManage(currentRole);
  fireEvent.click(screen.getByRole("button", { name: "Manage Kevin" }));
}

describe("MemberManage", () => {
  beforeEach(() => {
    setMemberRoleActionMock.mockReset();
    removeMemberActionMock.mockReset();
    refreshMock.mockReset();
    setMemberRoleActionMock.mockResolvedValue({ ok: true, role: "co_organizer" });
    removeMemberActionMock.mockResolvedValue({ ok: true });
  });

  it("renders only a quiet overflow trigger until tapped", () => {
    renderManage();
    expect(
      screen.getByRole("button", { name: "Manage Kevin" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Remove from trip")).not.toBeInTheDocument();
  });

  it("offers 'Make co-organizer' for an attendee and calls the action with a UUID key", async () => {
    openPanel("attendee");
    fireEvent.click(screen.getByRole("button", { name: "Make co-organizer" }));

    await waitFor(() => expect(setMemberRoleActionMock).toHaveBeenCalled());
    const [input, key] = setMemberRoleActionMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(input).toEqual({
      tripId: TRIP_ID,
      memberId: MEMBER_ID,
      role: "co_organizer",
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("offers 'Back to crew' for a co-organizer (demote path)", async () => {
    setMemberRoleActionMock.mockResolvedValue({ ok: true, role: "attendee" });
    openPanel("co_organizer");
    fireEvent.click(screen.getByRole("button", { name: "Back to crew" }));

    await waitFor(() => expect(setMemberRoleActionMock).toHaveBeenCalled());
    const [input] = setMemberRoleActionMock.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(input).toEqual({
      tripId: TRIP_ID,
      memberId: MEMBER_ID,
      role: "attendee",
    });
  });

  it("arms the remove confirm on first tap without calling the action (#210 two-step)", () => {
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove from trip" }));

    expect(removeMemberActionMock).not.toHaveBeenCalled();
    // Confirm copy names the object + the consequence.
    expect(
      screen.getByText(
        "Remove Kevin from the trip? They'd need a new invite to get back in."
      )
    ).toBeInTheDocument();
  });

  it("removes on the second tap and refreshes", async () => {
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove from trip" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from trip" }));

    await waitFor(() => expect(removeMemberActionMock).toHaveBeenCalled());
    const [input, key] = removeMemberActionMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(input).toEqual({ tripId: TRIP_ID, memberId: MEMBER_ID });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("surfaces the copy-palette error line when the action fails", async () => {
    removeMemberActionMock.mockResolvedValue({
      ok: false,
      errorKey: "member_remove_celebrant",
    });
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove from trip" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from trip" }));

    expect(
      await screen.findByText(
        "Can't remove the guest of honor — they're the whole point of the trip."
      )
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("closes without acting via the cancel affordance", () => {
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }));
    expect(screen.queryByText("Remove from trip")).not.toBeInTheDocument();
    expect(setMemberRoleActionMock).not.toHaveBeenCalled();
    expect(removeMemberActionMock).not.toHaveBeenCalled();
  });
});
