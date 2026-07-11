/**
 * Unit tests for PollCard (#390) — tap-to-vote decision widget.
 * TDD: written before implementation (RED phase).
 *
 * Aggregate-only hard rule: the card renders counts, never voter names.
 */

import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/actions/polls", () => ({
  castPollVoteAction: vi.fn(),
}));

import { castPollVoteAction } from "@/lib/actions/polls";
import { PollCard } from "../poll-card";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import type { PollView } from "@/lib/db/types";

const mockVote = vi.mocked(castPollVoteAction);

function makeView(overrides?: {
  closes_on?: string | null;
  my_option_id?: string | null;
  votesA?: number;
  votesB?: number;
}): PollView {
  const votesA = overrides?.votesA ?? 2;
  const votesB = overrides?.votesB ?? 1;
  const myOptionId = overrides?.my_option_id ?? null;
  return {
    poll: {
      id: "poll-1",
      trip_id: "trip-1",
      question: "Steakhouse or omakase?",
      visibility: "everyone",
      closes_on: overrides?.closes_on ?? null,
      created_by: "member-org",
      idempotency_key: null,
      created_at: "2026-07-09T10:00:00.000Z",
    },
    options: [
      {
        option: { id: "opt-a", poll_id: "poll-1", label: "Steakhouse", position: 0 },
        votes: votesA,
        is_my_vote: myOptionId === "opt-a",
      },
      {
        option: { id: "opt-b", poll_id: "poll-1", label: "Omakase", position: 1 },
        votes: votesB,
        is_my_vote: myOptionId === "opt-b",
      },
    ],
    total_votes: votesA + votesB,
    my_option_id: myOptionId,
  };
}

describe("PollCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVote.mockResolvedValue({ ok: true, optionId: "opt-a" });
  });

  it("renders the question and both option labels with aggregate counts only", () => {
    render(<PollCard view={makeView()} canVote onMutated={vi.fn()} />);
    expect(screen.getByText("Steakhouse or omakase?")).toBeInTheDocument();
    expect(screen.getByText("Steakhouse")).toBeInTheDocument();
    expect(screen.getByText("Omakase")).toBeInTheDocument();
    // 3 total votes
    expect(
      screen.getByText(
        M5_UI_STRINGS.polls_vote_count_other.replace("{count}", "3")
      )
    ).toBeInTheDocument();
  });

  it("casts a vote for the tapped option and refetches on success", async () => {
    const onMutated = vi.fn();
    render(<PollCard view={makeView()} canVote onMutated={onMutated} />);
    fireEvent.click(screen.getByRole("button", { name: /Steakhouse/ }));
    await waitFor(() => expect(mockVote).toHaveBeenCalledTimes(1));
    const [input, idempotencyKey] = mockVote.mock.calls[0] as [
      { pollId: string; optionId: string },
      string,
    ];
    expect(input).toEqual({ pollId: "poll-1", optionId: "opt-a" });
    // idempotency key generated at tap time, uuid-shaped
    expect(idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it("marks the viewer's own choice with aria-pressed", () => {
    render(
      <PollCard
        view={makeView({ my_option_id: "opt-b" })}
        canVote
        onMutated={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /Omakase/ })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Steakhouse/ })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("surfaces the error copy when the vote fails", async () => {
    mockVote.mockResolvedValue({ ok: false, errorKey: "poll_closed" });
    render(<PollCard view={makeView()} canVote onMutated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Omakase/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ERRORS.poll_closed
      )
    );
  });

  it("renders a closed poll as a plain outcome — no vote buttons", () => {
    render(
      <PollCard
        view={makeView({ closes_on: "2020-01-01" })}
        canVote
        onMutated={vi.fn()}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByText(M5_UI_STRINGS.polls_closed_label)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        M5_UI_STRINGS.polls_closed_winner_template.replace(
          "{label}",
          "Steakhouse"
        )
      )
    ).toBeInTheDocument();
  });

  it("calls a tie plainly when a closed poll has no single leader", () => {
    render(
      <PollCard
        view={makeView({ closes_on: "2020-01-01", votesA: 2, votesB: 2 })}
        canVote
        onMutated={vi.fn()}
      />
    );
    expect(
      screen.getByText(M5_UI_STRINGS.polls_closed_tie)
    ).toBeInTheDocument();
  });

  it("renders read-only (no buttons) when the viewer cannot vote", () => {
    render(<PollCard view={makeView()} canVote={false} onMutated={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
