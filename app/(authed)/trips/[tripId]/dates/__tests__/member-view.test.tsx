/**
 * Tests for `_member-view.tsx` (#369, #482, #454, #481).
 *
 * Reconcile behaviors pinned here:
 *
 *   1. Empty-state copy must not dangle an action the screen doesn't
 *      render. The "drop one and we'll start voting" line ships ONLY to
 *      a viewer who can propose (the add-window form renders for them);
 *      a plain member with no add affordance gets the passive line.
 *
 *   2. The organizer-only "Lock it in" affordance renders per candidate
 *      when `canLock`, and is absent otherwise (rule 11 — members and
 *      non-organizer celebrants never see it). #454: it's a #210
 *      two-step confirm now, not a single-tap commit.
 *
 *   3. #482: the celebrant's `works` verdict renders a positive badge —
 *      previously it rendered nothing, indistinguishable from unmarked.
 *
 *   4. #481: the organizer-only delete affordance shares the lock-in's
 *      gate and is also a #210 two-step confirm.
 *
 * The date-poll action module is mocked: this is a pure render test, and
 * we don't want to pull the server-action internals into jsdom.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import type {
  DatePollCandidateView,
  DatePollCelebrantMark,
} from "@/lib/db/types";

vi.mock("@/lib/actions/date-poll", () => ({
  castDateVoteAction: vi.fn(),
  lockInCandidateAction: vi.fn(),
  deleteDateCandidateAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function candidateView(
  id: string,
  mark: DatePollCelebrantMark | null = null
): DatePollCandidateView {
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
    mark,
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

describe("MemberView lock-in two-step confirm (#454)", () => {
  it("first tap arms the confirm line instead of committing", async () => {
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1")]} canLock />);

    fireEvent.click(
      screen.getByRole("button", { name: M2_UI_STRINGS.datePoll_lock_in_cta })
    );

    // Armed: the confirm line + escape render, and the action has NOT
    // been called yet — one tap must never commit a crew-wide write.
    expect(
      screen.getByText(
        M2_UI_STRINGS.datePoll_lock_in_confirm_template.replace(
          "{dates}",
          "Jul 29 – Aug 1, 2026"
        )
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: M2_UI_STRINGS.datePoll_lock_in_never_mind,
      })
    ).toBeInTheDocument();
    expect(lockInCandidateAction).not.toHaveBeenCalled();
  });

  it("second tap commits", async () => {
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    vi.mocked(lockInCandidateAction).mockResolvedValue({
      ok: true,
      // Minimal shape — the component doesn't read the payload.
      trip: {} as never,
    });
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1")]} canLock />);

    const lockButton = screen.getByRole("button", {
      name: M2_UI_STRINGS.datePoll_lock_in_cta,
    });
    fireEvent.click(lockButton); // arm
    fireEvent.click(lockButton); // commit

    expect(lockInCandidateAction).toHaveBeenCalledWith("c1");
  });

  it("'Never mind' disarms without calling the action", async () => {
    const { lockInCandidateAction } = await import("@/lib/actions/date-poll");
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1")]} canLock />);

    fireEvent.click(
      screen.getByRole("button", { name: M2_UI_STRINGS.datePoll_lock_in_cta })
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: M2_UI_STRINGS.datePoll_lock_in_never_mind,
      })
    );

    expect(
      screen.queryByRole("button", {
        name: M2_UI_STRINGS.datePoll_lock_in_never_mind,
      })
    ).not.toBeInTheDocument();
    expect(lockInCandidateAction).not.toHaveBeenCalled();
  });
});

describe("MemberView celebrant works badge (#482)", () => {
  it("renders the positive badge when mark is 'works'", async () => {
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1", "works")]} />);
    expect(
      screen.getByText(M2_UI_STRINGS.datePoll_celebrant_works_badge)
    ).toBeInTheDocument();
    // Never both — works and unmarked are mutually exclusive states.
    expect(
      screen.queryByText(M2_UI_STRINGS.datePoll_celebrant_unmarked_badge)
    ).not.toBeInTheDocument();
  });

  it("renders no badge conflict for works-with-effort or unmarked", async () => {
    const { MemberView } = await import("../_member-view");
    render(
      <MemberView
        candidates={[
          candidateView("c1", "works-with-effort"),
          candidateView("c2", null),
        ]}
      />
    );
    expect(
      screen.getByText(M2_UI_STRINGS.datePoll_celebrant_effort_badge)
    ).toBeInTheDocument();
    expect(
      screen.getByText(M2_UI_STRINGS.datePoll_celebrant_unmarked_badge)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(M2_UI_STRINGS.datePoll_celebrant_works_badge)
    ).not.toBeInTheDocument();
  });
});

describe("MemberView delete affordance (#481)", () => {
  it("renders 'Remove' per candidate when canLock, and it's a #210 two-step", async () => {
    const { deleteDateCandidateAction } = await import(
      "@/lib/actions/date-poll"
    );
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1")]} canLock />);

    const removeButton = screen.getByRole("button", {
      name: M2_UI_STRINGS.datePoll_delete_cta,
    });
    fireEvent.click(removeButton); // arm
    expect(
      screen.getByText(
        M2_UI_STRINGS.datePoll_delete_confirm_template.replace(
          "{label}",
          "Window c1"
        )
      )
    ).toBeInTheDocument();
    expect(deleteDateCandidateAction).not.toHaveBeenCalled();

    fireEvent.click(removeButton); // commit
    expect(deleteDateCandidateAction).toHaveBeenCalledWith("c1");
  });

  it("hides the delete affordance when canLock is false (rule 11)", async () => {
    const { MemberView } = await import("../_member-view");
    render(<MemberView candidates={[candidateView("c1")]} canLock={false} />);
    expect(
      screen.queryByRole("button", {
        name: M2_UI_STRINGS.datePoll_delete_cta,
      })
    ).not.toBeInTheDocument();
  });
});
