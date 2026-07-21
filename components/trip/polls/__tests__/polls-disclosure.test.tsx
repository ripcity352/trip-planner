/**
 * Unit tests for PollsDisclosure — #470 compact-top relayout (amended).
 *
 * The #390 decision-poll surface stays on /announcements behind a
 * one-line disclosure row: hidden for non-organizers with zero open
 * polls, count label from the dashboard glance strings, expands to the
 * real PollsSection (composer + voting cards) in place.
 */

import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PollsDisclosure } from "../polls-disclosure";
import type { PollView } from "@/lib/db/types";

// PulsePoll owns the realtime plumbing (channel + refetch); stub it to
// invoke the render prop with the initial data so the disclosure test
// exercises the real PollsSection composition without a Supabase client.
vi.mock("@/components/trip/pulse-poll", () => ({
  PulsePoll: <T,>({
    initialData,
    render: renderProp,
  }: {
    initialData: T;
    render: (data: T, isStale: boolean, refetch: () => Promise<void>) => React.ReactNode;
  }) => <>{renderProp(initialData, false, async () => {})}</>,
}));

vi.mock("@/lib/actions/polls", () => ({
  createPollAction: vi.fn(),
  votePollAction: vi.fn(),
}));

const makePollView = (overrides: Partial<PollView["poll"]> = {}): PollView => ({
  poll: {
    id: `poll-${Math.random()}`,
    trip_id: "trip-1",
    question: "Steakhouse or omakase?",
    visibility: "everyone",
    closes_on: null,
    created_by: "member-1",
    idempotency_key: null,
    created_at: "2026-07-01T10:00:00Z",
    ...overrides,
  },
  options: [
    {
      option: { id: "opt-1", poll_id: "poll-1", label: "Steakhouse", position: 0 },
      votes: 2,
      is_my_vote: false,
    },
    {
      option: { id: "opt-2", poll_id: "poll-1", label: "Omakase", position: 1 },
      votes: 1,
      is_my_vote: false,
    },
  ],
  total_votes: 3,
  my_option_id: null,
});

describe("PollsDisclosure", () => {
  const baseProps = {
    tripId: "trip-1",
    isOrganizer: false,
    viewerTripMemberId: "member-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for a non-organizer when there are no open polls", () => {
    const { container } = render(
      <PollsDisclosure {...baseProps} initialViews={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a non-organizer when every poll is closed", () => {
    // closes_on far in the past — today > closes_on → closed.
    const closed = makePollView({ closes_on: "2020-01-01" });
    const { container } = render(
      <PollsDisclosure {...baseProps} initialViews={[closed]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the singular count label with one open poll", () => {
    render(
      <PollsDisclosure {...baseProps} initialViews={[makePollView()]} />
    );
    // DASHBOARD_GLANCE_STRINGS.glance_polls_open_one
    expect(screen.getByTestId("polls-disclosure-label")).toHaveTextContent(
      "1 question up for a vote"
    );
  });

  it("renders the plural count label with multiple open polls, ignoring closed ones", () => {
    render(
      <PollsDisclosure
        {...baseProps}
        initialViews={[
          makePollView(),
          makePollView(),
          makePollView({ closes_on: "2020-01-01" }), // closed — not counted
        ]}
      />
    );
    expect(screen.getByTestId("polls-disclosure-label")).toHaveTextContent(
      "2 questions up for a vote"
    );
  });

  it("stays collapsed by default — no voting UI until tapped", () => {
    render(
      <PollsDisclosure {...baseProps} initialViews={[makePollView()]} />
    );
    expect(
      screen.queryByText("Steakhouse or omakase?")
    ).not.toBeInTheDocument();
  });

  it("expands to the voting UI when the row is tapped", () => {
    render(
      <PollsDisclosure {...baseProps} initialViews={[makePollView()]} />
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("Steakhouse or omakase?")).toBeInTheDocument();
    // The vote affordances are live (PollCard option buttons).
    expect(
      screen.getByRole("button", { name: /vote steakhouse/i })
    ).toBeInTheDocument();
  });

  it("shows the composer CTA row to an organizer even with zero open polls", () => {
    render(
      <PollsDisclosure {...baseProps} isOrganizer={true} initialViews={[]} />
    );
    // M5_UI_STRINGS.polls_composer_cta — poll creation keeps a surface.
    expect(screen.getByTestId("polls-disclosure-label")).toHaveTextContent(
      "Put it to the crew"
    );
  });
});
