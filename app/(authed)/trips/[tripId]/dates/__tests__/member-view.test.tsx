/**
 * Tests for `_member-view.tsx` (#369).
 *
 * Two reconcile behaviors are pinned here:
 *
 *   1. Empty-state copy must not dangle an action the screen doesn't
 *      render. The "drop one and we'll start voting" line ships ONLY to
 *      a viewer who can propose (the add-window form renders for them);
 *      a plain member with no add affordance gets the passive line.
 *
 *   2. The organizer-only "Lock it in" affordance renders per candidate
 *      when `canLock`, and is absent otherwise (rule 11 — members and
 *      non-organizer celebrants never see it).
 *
 * The date-poll action module is mocked: this is a pure render test, and
 * we don't want to pull the server-action internals into jsdom.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import type { DatePollCandidateView } from "@/lib/db/types";

vi.mock("@/lib/actions/date-poll", () => ({
  castDateVoteAction: vi.fn(),
  lockInCandidateAction: vi.fn(),
}));

function candidateView(id: string): DatePollCandidateView {
  return {
    candidate: {
      id,
      trip_id: "trip-1",
      label: `Window ${id}`,
      starts_on: "2026-07-29",
      ends_on: "2026-08-01",
      created_by: "user-1",
      created_at: "2026-06-01T00:00:00.000Z",
    },
    mark: null,
    yes_votes: 0,
    no_votes: 0,
    my_vote: null,
  };
}

describe("MemberView empty state (#369)", () => {
  it("shows the 'drop one' invitation when the viewer can propose", async () => {
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[]} canPropose />);
    expect(
      screen.getByText(M2_UI_STRINGS.datePoll_no_candidates_yet)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(M2_UI_STRINGS.datePoll_no_candidates_member)
    ).not.toBeInTheDocument();
  });

  it("shows the passive member line when the viewer cannot propose", async () => {
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[]} canPropose={false} />);
    expect(
      screen.getByText(M2_UI_STRINGS.datePoll_no_candidates_member)
    ).toBeInTheDocument();
    // The invitation to an absent affordance must NOT render.
    expect(
      screen.queryByText(M2_UI_STRINGS.datePoll_no_candidates_yet)
    ).not.toBeInTheDocument();
  });
});

describe("MemberView lock affordance (#369)", () => {
  it("renders 'Lock it in' per candidate when canLock", async () => {
    const { MemberView } = await import("../_member-view");
    render(
      <MemberView
        candidates={[candidateView("c1"), candidateView("c2")]}
        canLock
      />
    );
    const buttons = screen.getAllByRole("button", {
      name: M2_UI_STRINGS.datePoll_lock_in_cta,
    });
    expect(buttons).toHaveLength(2);
  });

  it("hides the lock affordance when canLock is false (rule 11)", async () => {
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1")]} canLock={false} />);
    expect(
      screen.queryByRole("button", {
        name: M2_UI_STRINGS.datePoll_lock_in_cta,
      })
    ).not.toBeInTheDocument();
  });
});
