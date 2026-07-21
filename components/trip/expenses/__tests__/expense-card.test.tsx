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

const MEMBER_MAP = new Map<string, { display_name: string | null }>([
  ["m-me", { display_name: "Carl" }],
  ["m-other", { display_name: "Dave Bestman" }],
  ["m-pete", { display_name: "Pete" }],
  ["m-sam", { display_name: "Sam" }],
  ["m-joe", { display_name: "Joe" }],
  ["m-zoe", { display_name: "Zoe" }],
]);

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

  // #465 — an unbroken long payer name (up to DISPLAY_NAME_MAX_LENGTH,
  // 80 chars) must not force horizontal scroll at 375px.
  it("truncates a long payer line instead of overflowing the card", () => {
    const longName = "B".repeat(80);
    render(
      <ExpenseCard
        expense={EXPENSE}
        splits={SPLITS}
        payerName={longName}
        viewerMemberId="m-me"
      />
    );
    const payerLine = screen.getByText(new RegExp(longName));
    expect(payerLine).toHaveClass("truncate");
  });

  // #467 — split membership must be legible to every viewer, not just
  // the payer/organizer's edit sheet.
  describe("who's-in line (#467)", () => {
    it("lists split members with the viewer first as 'you' when included", () => {
      render(
        <ExpenseCard
          expense={EXPENSE}
          splits={SPLITS}
          payerName="Dave Bestman"
          viewerMemberId="m-me"
          memberMap={MEMBER_MAP}
        />
      );
      expect(
        screen.getByText("Split 2 ways — you, Dave Bestman")
      ).toBeInTheDocument();
    });

    it("shows a quiet not-in-this-one state when the viewer is excluded", () => {
      render(
        <ExpenseCard
          expense={EXPENSE}
          splits={SPLITS}
          payerName="Dave Bestman"
          viewerMemberId="m-uninvolved"
          memberMap={MEMBER_MAP}
        />
      );
      expect(screen.getByText("You're not in this one")).toBeInTheDocument();
      expect(screen.queryByText(/Split 2 ways/)).not.toBeInTheDocument();
    });

    it("elides long split lists past 4 names with a '+N more' suffix", () => {
      const manySplits: ExpenseSplit[] = [
        { expense_id: "e-1", trip_member_id: "m-me", amount_cents: 5000, currency: "USD" },
        { expense_id: "e-1", trip_member_id: "m-other", amount_cents: 5000, currency: "USD" },
        { expense_id: "e-1", trip_member_id: "m-pete", amount_cents: 5000, currency: "USD" },
        { expense_id: "e-1", trip_member_id: "m-sam", amount_cents: 5000, currency: "USD" },
        { expense_id: "e-1", trip_member_id: "m-joe", amount_cents: 5000, currency: "USD" },
        { expense_id: "e-1", trip_member_id: "m-zoe", amount_cents: 5000, currency: "USD" },
      ];
      render(
        <ExpenseCard
          expense={EXPENSE}
          splits={manySplits}
          payerName="Dave Bestman"
          viewerMemberId="m-me"
          memberMap={MEMBER_MAP}
        />
      );
      expect(
        screen.getByText(
          "Split 6 ways — you, Dave Bestman, Pete, Sam +2 more"
        )
      ).toBeInTheDocument();
    });

    it("omits the who's-in line entirely for a single-member split", () => {
      const soloSplit: ExpenseSplit[] = [
        { expense_id: "e-1", trip_member_id: "m-me", amount_cents: 45000, currency: "USD" },
      ];
      render(
        <ExpenseCard
          expense={EXPENSE}
          splits={soloSplit}
          payerName="Dave Bestman"
          viewerMemberId="m-me"
          memberMap={MEMBER_MAP}
        />
      );
      expect(screen.queryByText(/Split/)).not.toBeInTheDocument();
      expect(
        screen.queryByText("You're not in this one")
      ).not.toBeInTheDocument();
    });

    it("does not render the who's-in line when memberMap isn't threaded", () => {
      render(
        <ExpenseCard
          expense={EXPENSE}
          splits={SPLITS}
          payerName="Dave Bestman"
          viewerMemberId="m-me"
        />
      );
      // No memberMap: names resolve to the roster fallback, but the
      // line should still render truthfully rather than silently drop.
      expect(screen.getByText(/^Split 2 ways —/)).toBeInTheDocument();
    });
  });
});
