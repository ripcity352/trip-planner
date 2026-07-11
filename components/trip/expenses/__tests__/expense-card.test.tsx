import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ExpenseCard } from "../expense-card";
import type { Expense, ExpenseSplit } from "@/lib/db/types";

const EXPENSE: Expense = {
  id: "e-1",
  trip_id: "trip-1",
  payer_id: "u-dave",
  amount_cents: 45000,
  currency: "USD",
  description: "Boat deposit",
  occurred_on: "2026-07-29",
  created_at: "2026-07-08T00:00:00Z",
  idempotency_key: null,
  visibility: "everyone",
};

const SPLITS: ExpenseSplit[] = [
  { expense_id: "e-1", trip_member_id: "m-me", amount_cents: 15000, currency: "USD" },
  { expense_id: "e-1", trip_member_id: "m-other", amount_cents: 30000, currency: "USD" },
];

describe("ExpenseCard", () => {
  it("renders description, payer line, amount, and the viewer's share", () => {
    render(
      <ExpenseCard
        expense={EXPENSE}
        splits={SPLITS}
        payerName="Dave Bestman"
        viewerMemberId="m-me"
      />
    );
    expect(screen.getByText("Boat deposit")).toBeInTheDocument();
    expect(screen.getByText(/Dave Bestman covered it/)).toBeInTheDocument();
    expect(screen.getByText("$450.00")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    // date-only register: Jul 29 stays Jul 29 (no UTC shift)
    expect(screen.getByText(/Jul 29/)).toBeInTheDocument();
  });

  it("omits the share line when the viewer is not in the split", () => {
    render(
      <ExpenseCard
        expense={EXPENSE}
        splits={SPLITS}
        payerName="Dave Bestman"
        viewerMemberId="m-uninvolved"
      />
    );
    expect(screen.queryByText(/Your share/)).not.toBeInTheDocument();
  });

  it("shows the celebrant-hidden badge for organizers/members who can see it", () => {
    render(
      <ExpenseCard
        expense={{ ...EXPENSE, visibility: "hide_from_celebrant" }}
        splits={[]}
        payerName="Dave Bestman"
        viewerMemberId={null}
      />
    );
    expect(screen.getByText("Hidden from the celebrant")).toBeInTheDocument();
  });

  it("names the celebrant in the hidden badge when threaded (#405-B)", () => {
    render(
      <ExpenseCard
        expense={{ ...EXPENSE, visibility: "hide_from_celebrant" }}
        splits={[]}
        payerName="Dave Bestman"
        viewerMemberId={null}
        celebrantName="Mike Groom"
      />
    );
    expect(screen.getByText("Hidden from Mike Groom")).toBeInTheDocument();
  });
});
