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
  { memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01", name: "Dave" },
  { memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02", name: "Mike" },
  { memberId: "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03", name: "Pete" },
];

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

  function openSheet() {
    render(<AddExpenseSheet tripId="a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" members={MEMBERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Log a spend" }));
  }

  it("submits cents, all members preselected, and a submit-time key", async () => {
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
});
