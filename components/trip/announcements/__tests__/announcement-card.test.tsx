/**
 * Unit tests for AnnouncementCard — leaf display component.
 * TDD: written before implementation (RED phase).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnouncementCard } from "../announcement-card";
import type { Announcement } from "@/lib/db/types";

// date-fns formatDistanceToNow is called internally — freeze time so
// relative labels are deterministic.
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));

const makeAnnouncement = (overrides: Partial<Announcement> = {}): Announcement => ({
  id: "ann-1",
  trip_id: "trip-1",
  author_id: "user-1",
  body: "Don't forget your passports.",
  pinned: false,
  created_at: "2026-05-20T10:00:00Z",
  idempotency_key: null,
  visibility: "everyone",
  created_by: "user-1",
  ...overrides,
});

describe("AnnouncementCard", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));
  });

  it("renders the announcement body", () => {
    render(<AnnouncementCard announcement={makeAnnouncement()} />);
    expect(screen.getByText("Don't forget your passports.")).toBeInTheDocument();
  });

  it("renders relative time based on created_at", () => {
    render(<AnnouncementCard announcement={makeAnnouncement()} />);
    // 2 hours ago at the frozen clock
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  it("renders a pinned badge when pinned=true", () => {
    render(<AnnouncementCard announcement={makeAnnouncement({ pinned: true })} />);
    expect(screen.getByText(/pinned/i)).toBeInTheDocument();
  });

  it("does not render a pinned badge when pinned=false", () => {
    render(<AnnouncementCard announcement={makeAnnouncement({ pinned: false })} />);
    expect(screen.queryByText(/pinned/i)).not.toBeInTheDocument();
  });

  it("renders a visibility badge when visibility is not 'everyone'", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement({ visibility: "organizers_only" })}
      />
    );
    // Should show some non-default visibility indicator
    expect(screen.getByTestId("visibility-badge")).toBeInTheDocument();
  });

  it("does not render a visibility badge for 'everyone'", () => {
    render(<AnnouncementCard announcement={makeAnnouncement({ visibility: "everyone" })} />);
    expect(screen.queryByTestId("visibility-badge")).not.toBeInTheDocument();
  });

  it("renders author display name when provided", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement()}
        authorDisplayName="Dave"
      />
    );
    expect(screen.getByText("Dave")).toBeInTheDocument();
  });

  it("does not crash when authorDisplayName is undefined", () => {
    render(<AnnouncementCard announcement={makeAnnouncement()} />);
    // no error; body still visible
    expect(screen.getByText("Don't forget your passports.")).toBeInTheDocument();
  });

  it("renders hide_from_celebrant visibility badge correctly", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement({ visibility: "hide_from_celebrant" })}
      />
    );
    expect(screen.getByTestId("visibility-badge")).toBeInTheDocument();
  });
});
