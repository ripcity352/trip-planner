import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AddExpenseSheet, dollarsToCents } from "../add-expense-sheet";

const addExpenseActionMock = vi.fn();
vi.mock("@/lib/actions/expenses", () => ({
  addExpenseAction: (...args: unknown[]) => addExpenseActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const MEMBERS = [
  {
    memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01",
    name: "Dave",
    rsvpStatus: "going",
  },
  {
    memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02",
    name: "Mike",
    rsvpStatus: "going",
  },
  {
    memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03",
    name: "Pete",
    rsvpStatus: "going",
  },
] as const;

// #391 fixture — one member per RSVP state. Sam (maybe) is the persona
// case from the issue; Ray (declined) and Ken (pending) start unselected.
const MIXED_MEMBERS = [
  {
    memberId: "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01",
    name: "Dave",
    rsvpStatus: "going",
  },
  {
    memberId: "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02",
    name: "Sam",
    rsvpStatus: "maybe",
  },
  {
    memberId: "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03",
    name: "Ray",
    rsvpStatus: "declined",
  },
  {
    memberId: "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c04",
    name: "Ken",
    rsvpStatus: "pending",
  },
] as const;

const ORGANIZER = { isOrganizer: true, isCelebrant: false };
const PLAIN_MEMBER = { isOrganizer: false, isCelebrant: false };
const CELEBRANT = { isOrganizer: false, isCelebrant: true };

describe("dollarsToCents", () => {
  it("converts without float drift", () => {
    expect(dollarsToCents("120")).toBe(12000);
    expect(dollarsToCents("120.5")).toBe(12050);
    expect(dollarsToCents("120.55")).toBe(12055);
    expect(dollarsToCents("0.10")).toBe(10);
    // the classic float trap
    expect(dollarsToCents("19.99")).toBe(1999);
  });
});

describe("AddExpenseSheet", () => {
  beforeEach(() => {
    addExpenseActionMock.mockReset();
    refreshMock.mockReset();
    addExpenseActionMock.mockResolvedValue({ ok: true, expense: { id: "e-1" } });
  });

  function openSheet(viewer = ORGANIZER, members: typeof MEMBERS | typeof MIXED_MEMBERS = MEMBERS) {
    render(
      <AddExpenseSheet
        tripId="a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
        members={members}
        viewer={viewer}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Log a spend" }));
  }

  it("submits cents, all 'going' members preselected, and a submit-time key", async () => {
    openSheet();
    fireEvent.change(screen.getByLabelText("What was it?"), {
      target: { value: "First round" },
    });
    fireEvent.change(screen.getByLabelText("How much?"), {
      target: { value: "60.30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => {
      expect(addExpenseActionMock).toHaveBeenCalledTimes(1);
    });
    const [input, key] = addExpenseActionMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(input).toMatchObject({
      description: "First round",
      amountCents: 6030,
      visibility: "everyone",
    });
    expect((input.splitMemberIds as string[]).sort()).toEqual(
      MEMBERS.map((m) => m.memberId).sort()
    );
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("excludes a deselected member from the split", async () => {
    openSheet();
    fireEvent.change(screen.getByLabelText("What was it?"), {
      target: { value: "Steak dinner" },
    });
    fireEvent.change(screen.getByLabelText("How much?"), {
      target: { value: "300" },
    });
    // Mike sits this one out
    fireEvent.click(screen.getByRole("button", { name: "Mike" }));
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => expect(addExpenseActionMock).toHaveBeenCalled());
    const [input] = addExpenseActionMock.mock.calls[0] as [
      { splitMemberIds: string[] },
    ];
    expect(input.splitMemberIds).not.toContain(MEMBERS[1].memberId);
    expect(input.splitMemberIds).toHaveLength(2);
  });

  it("surfaces the action's error key and keeps the form open", async () => {
    addExpenseActionMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "expense_add_failed",
    });
    openSheet();
    fireEvent.change(screen.getByLabelText("What was it?"), {
      target: { value: "Gas" },
    });
    fireEvent.change(screen.getByLabelText("How much?"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That one didn't stick. Log it again in a sec."
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("surfaces field-error text on a blank description + zero amount (#401)", async () => {
    const { FIELD_ERRORS } = await import("@/lib/copy/field-errors");
    openSheet();
    // Blank description; amount "0" — both reject client-side.
    fireEvent.change(screen.getByLabelText("How much?"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => {
      expect(
        screen.getByText(FIELD_ERRORS.expense_description_required)
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(FIELD_ERRORS.expense_amount_required)
    ).toBeInTheDocument();
    // Offending fields carry aria-invalid for screen readers.
    expect(screen.getByLabelText("What was it?")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("How much?")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(addExpenseActionMock).not.toHaveBeenCalled();
  });

  // #468 — an empty split is named at the chooser, not discovered at
  // submit: the button locks and the specific line renders inline.
  describe("zero-split guard (#468)", () => {
    it("disables submit and names the problem when every chip is off", async () => {
      const { ERRORS } = await import("@/lib/copy/errors");
      openSheet();
      // Deselect all three preselected 'going' members.
      fireEvent.click(screen.getByRole("button", { name: "Dave" }));
      fireEvent.click(screen.getByRole("button", { name: "Mike" }));
      fireEvent.click(screen.getByRole("button", { name: "Pete" }));

      expect(
        screen.getByText(ERRORS.expense_split_empty)
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Log it" }));
      expect(addExpenseActionMock).not.toHaveBeenCalled();
    });

    it("re-enables submit once a chip comes back on", async () => {
      const { ERRORS } = await import("@/lib/copy/errors");
      openSheet();
      fireEvent.click(screen.getByRole("button", { name: "Dave" }));
      fireEvent.click(screen.getByRole("button", { name: "Mike" }));
      fireEvent.click(screen.getByRole("button", { name: "Pete" }));
      fireEvent.click(screen.getByRole("button", { name: "Pete" }));

      expect(
        screen.queryByText(ERRORS.expense_split_empty)
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Log it" })
      ).not.toBeDisabled();
    });
  });

  describe("attendance-aware split defaults (#391)", () => {
    it("pre-selects going + maybe; declined + pending start unselected", () => {
      openSheet(ORGANIZER, MIXED_MEMBERS);
      expect(screen.getByRole("button", { name: "Dave" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(
        screen.getByRole("button", { name: "Sam said maybe" })
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByRole("button", { name: "Ray not coming" })
      ).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByRole("button", { name: "Ken hasn't said yet" })
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("submits only going + maybe by default", async () => {
      openSheet(ORGANIZER, MIXED_MEMBERS);
      fireEvent.change(screen.getByLabelText("What was it?"), {
        target: { value: "Boat deposit" },
      });
      fireEvent.change(screen.getByLabelText("How much?"), {
        target: { value: "450" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Log it" }));

      await waitFor(() => expect(addExpenseActionMock).toHaveBeenCalled());
      const [input] = addExpenseActionMock.mock.calls[0] as [
        { splitMemberIds: string[] },
      ];
      expect(input.splitMemberIds.sort()).toEqual(
        [MIXED_MEMBERS[0].memberId, MIXED_MEMBERS[1].memberId].sort()
      );
    });

    it("annotates non-going chips only — the going chip carries no note", () => {
      openSheet(ORGANIZER, MIXED_MEMBERS);
      expect(screen.getByText("said maybe")).toBeInTheDocument();
      expect(screen.getByText("not coming")).toBeInTheDocument();
      expect(screen.getByText("hasn't said yet")).toBeInTheDocument();
      // Dave (going) is just his name — no annotation span.
      expect(
        screen.getByRole("button", { name: "Dave" })
      ).toHaveTextContent(/^Dave$/);
    });

    it("re-seeds RSVP defaults on reopen after a cancel — stale taps don't stick", () => {
      openSheet(ORGANIZER, MIXED_MEMBERS);
      // Tap Ray in and Dave out, type a description, then bail.
      fireEvent.click(screen.getByRole("button", { name: "Ray not coming" }));
      fireEvent.click(screen.getByRole("button", { name: "Dave" }));
      fireEvent.change(screen.getByLabelText("What was it?"), {
        target: { value: "Abandoned draft" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Never mind" }));

      // Reopen: the sheet shows RSVP-derived defaults + a clean form,
      // not the prior taps (the component stays mounted across toggles).
      fireEvent.click(screen.getByRole("button", { name: "Log a spend" }));
      expect(screen.getByRole("button", { name: "Dave" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(
        screen.getByRole("button", { name: "Ray not coming" })
      ).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByLabelText("What was it?")).toHaveValue("");
    });

    it("a declined member can still be tapped in", async () => {
      openSheet(ORGANIZER, MIXED_MEMBERS);
      fireEvent.change(screen.getByLabelText("What was it?"), {
        target: { value: "Airport pizza" },
      });
      fireEvent.change(screen.getByLabelText("How much?"), {
        target: { value: "30" },
      });
      // Ray's in for this one after all.
      fireEvent.click(screen.getByRole("button", { name: "Ray not coming" }));
      expect(
        screen.getByRole("button", { name: "Ray not coming" })
      ).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "Log it" }));

      await waitFor(() => expect(addExpenseActionMock).toHaveBeenCalled());
      const [input] = addExpenseActionMock.mock.calls[0] as [
        { splitMemberIds: string[] },
      ];
      expect(input.splitMemberIds).toContain(MIXED_MEMBERS[2].memberId);
      expect(input.splitMemberIds).toHaveLength(3);
    });
  });

  describe("role-filtered visibility options (#384)", () => {
    function optionValues() {
      return Array.from(
        screen.getByLabelText("Who sees this?").querySelectorAll("option")
      ).map((o) => (o as HTMLOptionElement).value);
    }

    it("organizer sees all three options", () => {
      openSheet(ORGANIZER);
      expect(optionValues()).toEqual([
        "everyone",
        "organizers_only",
        "hide_from_celebrant",
      ]);
    });

    it("plain member never sees 'Just organizers' (it would self-hide)", () => {
      openSheet(PLAIN_MEMBER);
      expect(optionValues()).toEqual(["everyone", "hide_from_celebrant"]);
    });

    it("celebrant gets no visibility select at all — everyone is implied", async () => {
      openSheet(CELEBRANT);
      expect(screen.queryByLabelText("Who sees this?")).toBeNull();

      // The submit still carries the default 'everyone'.
      fireEvent.change(screen.getByLabelText("What was it?"), {
        target: { value: "Karaoke" },
      });
      fireEvent.change(screen.getByLabelText("How much?"), {
        target: { value: "80" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Log it" }));
      await waitFor(() => expect(addExpenseActionMock).toHaveBeenCalled());
      const [input] = addExpenseActionMock.mock.calls[0] as [
        { visibility: string },
      ];
      expect(input.visibility).toBe("everyone");
    });
  });
});
