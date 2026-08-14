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
  postPollCommentAction: vi.fn(),
  deletePollCommentAction: vi.fn(),
  addPollOptionAction: vi.fn(),
}));

// PollCommentThread calls router.refresh() after a successful delete (#349).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  addPollOptionAction,
  castPollVoteAction,
  deletePollCommentAction,
  postPollCommentAction,
} from "@/lib/actions/polls";
import { PollCard } from "../poll-card";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import type { PollComment, PollOptionView, PollView } from "@/lib/db/types";

const mockVote = vi.mocked(castPollVoteAction);
const mockPostComment = vi.mocked(postPollCommentAction);
const mockDeleteComment = vi.mocked(deletePollCommentAction);
const mockAddOption = vi.mocked(addPollOptionAction);

// #620 — poll comments props, not under test here (see poll-card
// comment-thread tests further down). Defaults keep the comment thread
// empty and the composer hidden (no viewer seat) so the existing
// vote-surface assertions ("no buttons when read-only") stay valid.
const defaultCommentProps = {
  comments: [],
  viewerTripMemberId: undefined,
  isViewerOrganizer: false,
  viewerDisplayName: null,
  now: new Date("2026-08-13T12:00:00.000Z"),
} as const;

function makeView(overrides?: {
  closes_on?: string | null;
  my_option_id?: string | null;
  votesA?: number;
  votesB?: number;
  // #621 — an optional write-in third option, for attribution tests.
  writeIn?: { suggestedByDisplayName: string | null; votes?: number };
}): PollView {
  const votesA = overrides?.votesA ?? 2;
  const votesB = overrides?.votesB ?? 1;
  const myOptionId = overrides?.my_option_id ?? null;
  const options: PollOptionView[] = [
    {
      option: {
        id: "opt-a",
        poll_id: "poll-1",
        label: "Steakhouse",
        position: 0,
        suggested_by_trip_member_id: null,
      },
      votes: votesA,
      is_my_vote: myOptionId === "opt-a",
      suggested_by_display_name: null,
    },
    {
      option: {
        id: "opt-b",
        poll_id: "poll-1",
        label: "Omakase",
        position: 1,
        suggested_by_trip_member_id: null,
      },
      votes: votesB,
      is_my_vote: myOptionId === "opt-b",
      suggested_by_display_name: null,
    },
  ];
  if (overrides?.writeIn) {
    options.push({
      option: {
        id: "opt-writein",
        poll_id: "poll-1",
        label: "Sunday brunch",
        position: 2,
        suggested_by_trip_member_id: "member-o",
      },
      votes: overrides.writeIn.votes ?? 0,
      is_my_vote: myOptionId === "opt-writein",
      suggested_by_display_name: overrides.writeIn.suggestedByDisplayName,
    });
  }
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
    options,
    total_votes: votesA + votesB + (overrides?.writeIn?.votes ?? 0),
    my_option_id: myOptionId,
  };
}

describe("PollCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVote.mockResolvedValue({ ok: true, optionId: "opt-a" });
    mockAddOption.mockResolvedValue({ ok: true, optionId: "opt-writein" });
  });

  it("renders the question and both option labels with aggregate counts only", () => {
    render(<PollCard view={makeView()} canVote onMutated={vi.fn()} {...defaultCommentProps} />);
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
    render(<PollCard view={makeView()} canVote onMutated={onMutated} {...defaultCommentProps} />);
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
        {...defaultCommentProps}
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
    render(<PollCard view={makeView()} canVote onMutated={vi.fn()} {...defaultCommentProps} />);
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
        {...defaultCommentProps}
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
        {...defaultCommentProps}
      />
    );
    expect(
      screen.getByText(M5_UI_STRINGS.polls_closed_tie)
    ).toBeInTheDocument();
  });

  it("renders read-only (no buttons) when the viewer cannot vote", () => {
    render(<PollCard view={makeView()} canVote={false} onMutated={vi.fn()} {...defaultCommentProps} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PollCommentThread + PollCommentComposer, mounted inside PollCard (#620,
// part 1/3 of #616).
// ---------------------------------------------------------------------------

describe("PollCard comment thread (#620)", () => {
  const makeComment = (overrides?: Partial<PollComment>): PollComment => ({
    id: "comment-1",
    poll_id: "poll-1",
    trip_id: "trip-1",
    author_trip_member_id: "member-other",
    body: "Omakase, obviously.",
    idempotency_key: null,
    created_at: "2026-08-13T10:00:00.000Z",
    authorDisplayName: "Dave",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVote.mockResolvedValue({ ok: true, optionId: "opt-a" });
    mockAddOption.mockResolvedValue({ ok: true, optionId: "opt-writein" });
  });

  it("renders the empty state when there are no comments", () => {
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
      />
    );
    expect(
      screen.getByText(M5_UI_STRINGS.polls_comments_empty)
    ).toBeInTheDocument();
  });

  it("renders each comment's body and author/when line", () => {
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        comments={[makeComment()]}
      />
    );
    expect(screen.getByText("Omakase, obviously.")).toBeInTheDocument();
    expect(screen.getByText(/Dave/)).toBeInTheDocument();
  });

  it("hides the composer when the viewer has no member seat", () => {
    render(
      <PollCard
        view={makeView()}
        canVote={false}
        onMutated={vi.fn()}
        {...defaultCommentProps}
      />
    );
    expect(
      screen.queryByPlaceholderText(M5_UI_STRINGS.polls_comment_placeholder)
    ).not.toBeInTheDocument();
  });

  it("shows the composer and posts a comment, folding it in optimistically", async () => {
    const posted = makeComment({
      id: "comment-new",
      author_trip_member_id: "member-1",
      body: "Steakhouse has a private room",
      idempotency_key: "some-key",
      authorDisplayName: undefined,
    });
    mockPostComment.mockResolvedValue({ ok: true, comment: posted });

    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
        viewerDisplayName="You"
      />
    );

    const input = screen.getByPlaceholderText(
      M5_UI_STRINGS.polls_comment_placeholder
    );
    fireEvent.change(input, {
      target: { value: "Steakhouse has a private room" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: M5_UI_STRINGS.polls_comment_composer_submit_aria,
      })
    );

    await waitFor(() => expect(mockPostComment).toHaveBeenCalledTimes(1));
    expect(mockPostComment).toHaveBeenCalledWith(
      { pollId: "poll-1", body: "Steakhouse has a private room" },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    );
    await waitFor(() =>
      expect(
        screen.getByText("Steakhouse has a private room")
      ).toBeInTheDocument()
    );
  });

  it("shows a delete control for the viewer's own comment, not a peer's", () => {
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
        comments={[
          makeComment({ id: "mine", author_trip_member_id: "member-1" }),
          makeComment({ id: "theirs", author_trip_member_id: "member-2" }),
        ]}
      />
    );
    expect(
      screen.getAllByRole("button", {
        name: M5_UI_STRINGS.polls_comment_delete_aria,
      })
    ).toHaveLength(1);
  });

  it("shows a delete control on every comment for an organizer", () => {
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-org"
        isViewerOrganizer
        comments={[
          makeComment({ id: "a", author_trip_member_id: "member-1" }),
          makeComment({ id: "b", author_trip_member_id: "member-2" }),
        ]}
      />
    );
    expect(
      screen.getAllByRole("button", {
        name: M5_UI_STRINGS.polls_comment_delete_aria,
      })
    ).toHaveLength(2);
  });

  it("shows no delete control for a plain member on someone else's comment", () => {
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
        comments={[makeComment({ author_trip_member_id: "member-2" })]}
      />
    );
    expect(
      screen.queryByRole("button", {
        name: M5_UI_STRINGS.polls_comment_delete_aria,
      })
    ).not.toBeInTheDocument();
  });

  it("deletes a comment on confirm and removes it from view", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteComment.mockResolvedValue({ ok: true });

    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
        comments={[makeComment({ id: "mine", author_trip_member_id: "member-1" })]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: M5_UI_STRINGS.polls_comment_delete_aria,
      })
    );

    await waitFor(() => expect(mockDeleteComment).toHaveBeenCalledTimes(1));
    expect(mockDeleteComment.mock.calls[0]?.[0]).toEqual({
      commentId: "mine",
    });
    await waitFor(() =>
      expect(
        screen.getByText(M5_UI_STRINGS.polls_comments_empty)
      ).toBeInTheDocument()
    );
  });

  it("surfaces the error copy when a delete is rejected, keeping the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteComment.mockResolvedValue({ ok: false, errorKey: "rls_denied" });

    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
        comments={[makeComment({ id: "mine", author_trip_member_id: "member-1" })]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: M5_UI_STRINGS.polls_comment_delete_aria,
      })
    );

    await waitFor(() =>
      expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
        ERRORS.rls_denied
      )
    );
    expect(screen.getByText("Omakase, obviously.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PollWriteInComposer, mounted inside PollCard (#621, part 2/3 of #616).
// ---------------------------------------------------------------------------

describe("PollCard write-in composer (#621)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVote.mockResolvedValue({ ok: true, optionId: "opt-a" });
    mockAddOption.mockResolvedValue({ ok: true, optionId: "opt-writein" });
  });

  it("hides the write-in affordance when the viewer has no member seat", () => {
    render(
      <PollCard
        view={makeView()}
        canVote={false}
        onMutated={vi.fn()}
        {...defaultCommentProps}
      />
    );
    expect(
      screen.queryByPlaceholderText(M5_UI_STRINGS.polls_writein_placeholder)
    ).not.toBeInTheDocument();
  });

  it("hides the write-in affordance on a closed poll, even with a seat", () => {
    render(
      <PollCard
        view={makeView({ closes_on: "2020-01-01" })}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
      />
    );
    expect(
      screen.queryByPlaceholderText(M5_UI_STRINGS.polls_writein_placeholder)
    ).not.toBeInTheDocument();
  });

  it("shows the write-in affordance on an open poll for a seated viewer", () => {
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
      />
    );
    expect(
      screen.getByPlaceholderText(M5_UI_STRINGS.polls_writein_placeholder)
    ).toBeInTheDocument();
  });

  it("submits a write-in and calls onMutated on success", async () => {
    const onMutated = vi.fn();
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={onMutated}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
      />
    );

    const input = screen.getByPlaceholderText(
      M5_UI_STRINGS.polls_writein_placeholder
    );
    fireEvent.change(input, { target: { value: "Sunday brunch" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: M5_UI_STRINGS.polls_writein_add_cta,
      })
    );

    await waitFor(() => expect(mockAddOption).toHaveBeenCalledTimes(1));
    expect(mockAddOption).toHaveBeenCalledWith(
      { pollId: "poll-1", label: "Sunday brunch" },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    );
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it("surfaces the error copy when a write-in add is rejected (poll full)", async () => {
    mockAddOption.mockResolvedValue({ ok: false, errorKey: "poll_option_full" });
    render(
      <PollCard
        view={makeView()}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText(M5_UI_STRINGS.polls_writein_placeholder),
      { target: { value: "One more, please" } }
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: M5_UI_STRINGS.polls_writein_add_cta,
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ERRORS.poll_option_full
      )
    );
  });

  it("renders a 'suggested by' line on a write-in option, none on organizer options", () => {
    render(
      <PollCard
        view={makeView({ writeIn: { suggestedByDisplayName: "Olivia" } })}
        canVote
        onMutated={vi.fn()}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
      />
    );
    expect(
      screen.getByText(
        M5_UI_STRINGS.polls_writein_suggested_by_template.replace(
          "{name}",
          "Olivia"
        )
      )
    ).toBeInTheDocument();
    // The organizer options ("Steakhouse", "Omakase") appear once each
    // and carry no attribution line — a spot-check that the template
    // string only rendered for the write-in.
    expect(screen.getAllByText(/Suggested by/)).toHaveLength(1);
  });

  it("a viewer can still vote on a write-in option like any other", async () => {
    const onMutated = vi.fn();
    render(
      <PollCard
        view={makeView({ writeIn: { suggestedByDisplayName: "Olivia" } })}
        canVote
        onMutated={onMutated}
        {...defaultCommentProps}
        viewerTripMemberId="member-1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Sunday brunch/ }));
    await waitFor(() => expect(mockVote).toHaveBeenCalledTimes(1));
    expect(mockVote.mock.calls[0]?.[0]).toEqual({
      pollId: "poll-1",
      optionId: "opt-writein",
    });
  });
});
