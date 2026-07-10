import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EditExpenseSheet, centsToDollars } from "../edit-expense-sheet";
import type { Expense } from "@/lib/db/types";

const updateExpenseActionMock = vi.fn();
const deleteExpenseActionMock = vi.fn();
vi.mock("@/lib/actions/expenses", () => ({
  updateExpenseAction: (...args: unknown[]) => updateExpenseActionMock(...args),
  deleteExpenseAction: (...args: unknown[]) => deleteExpenseActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const TRIP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const MEMBERS = [
  { memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01", name: "Dave" },
  { memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02", name: "Mike" },
  { memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03", name: "Pete" },
];

const EXPENSE: Expense = {
  id: "c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c77",
  trip_id: TRIP_ID,
  payer_id: "u-1",
  amount_cents: 12000,
  currency: "USD",
  description: "Boat deposit",
  occurred_on: "2026-07-04",
  created_at: "2026-07-04T00:00:00Z",
  idempotency_key: null,
  visibility: "everyone",
};

const ORGANIZER = { isOrganizer: true, isCelebrant: false };

function renderSheet() {
  render(
    <EditExpenseSheet
      tripId={TRIP_ID}
      expense={EXPENSE}
      members={MEMBERS}
      initialSplitMemberIds={[MEMBERS[0].memberId, MEMBERS[1].memberId]}
      viewer={ORGANIZER}
    />
  );
}

function openSheet() {
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
}

describe("centsToDollars", () => {
  it("round-trips with dollarsToCents", () => {
    expect(centsToDollars(12000)).toBe("120.00");
    expect(centsToDollars(12050)).toBe("120.50");
    expect(centsToDollars(1999)).toBe("19.99");
  });
});

describe("EditExpenseSheet", () => {
  beforeEach(() => {
    updateExpenseActionMock.mockReset();
    deleteExpenseActionMock.mockReset();
    refreshMock.mockReset();
    updateExpenseActionMock.mockResolvedValue({ ok: true });
    deleteExpenseActionMock.mockResolvedValue({ ok: true });
  });

  it("renders only the Edit affordance until tapped", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByLabelText("How much?")).toBeNull();
  });

  it("prefills from the expense and submits the corrected values", async () => {
    openSheet();
    expect(screen.getByLabelText("What was it?")).toHaveValue("Boat deposit");
    expect(screen.getByLabelText("How much?")).toHaveValue("120.00");
    expect(screen.getByLabelText("When?")).toHaveValue("2026-07-04");
    // Current split preselected: Dave + Mike in, Pete out.
    expect(screen.getByRole("button", { name: "Pete" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    // The $1200-typed-as-$120 correction from the issue.
    fireEvent.change(screen.getByLabelText("How much?"), {
      target: { value: "1200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => expect(updateExpenseActionMock).toHaveBeenCalled());
    const [input, key] = updateExpenseActionMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(input).toMatchObject({
      tripId: TRIP_ID,
      expenseId: EXPENSE.id,
      description: "Boat deposit",
      amountCents: 120000,
      occurredOn: "2026-07-04",
      visibility: "everyone",
    });
    expect((input.splitMemberIds as string[]).sort()).toEqual(
      [MEMBERS[0].memberId, MEMBERS[1].memberId].sort()
    );
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("clearing the date submits WITHOUT occurredOn — the stored date is kept", async () => {
    openSheet();
    fireEvent.change(screen.getByLabelText("When?"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => expect(updateExpenseActionMock).toHaveBeenCalled());
    const [input] = updateExpenseActionMock.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(input).not.toHaveProperty("occurredOn");
  });

  it("delete is two-step: first tap arms the confirm, second commits", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteExpenseActionMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Take this off the tab? Can't undo.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteExpenseActionMock).toHaveBeenCalled());
    const [input] = deleteExpenseActionMock.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(input).toEqual({ tripId: TRIP_ID, expenseId: EXPENSE.id });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("surfaces the action's error key and keeps the form open", async () => {
    updateExpenseActionMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "expense_update_failed",
    });
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Change didn't stick. Give it another go in a sec."
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
