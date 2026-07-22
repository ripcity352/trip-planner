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

  it("renders the actionsSlot when provided (#393)", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement()}
        actionsSlot={<button type="button">Post options</button>}
      />
    );
    expect(
      screen.getByRole("button", { name: "Post options" })
    ).toBeInTheDocument();
  });

  it("does not render an actionsSlot affordance when omitted (non-organizer)", () => {
    render(<AnnouncementCard announcement={makeAnnouncement()} />);
    expect(
      screen.queryByRole("button", { name: /post options/i })
    ).not.toBeInTheDocument();
  });

  it("renders hide_from_celebrant visibility badge correctly", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement({ visibility: "hide_from_celebrant" })}
      />
    );
    expect(screen.getByTestId("visibility-badge")).toBeInTheDocument();
  });

  it("names the celebrant in the hide_from_celebrant badge when provided (#405-B)", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement({ visibility: "hide_from_celebrant" })}
        celebrantName="Mike Groom"
      />
    );
    expect(screen.getByText("Hidden from Mike Groom")).toBeInTheDocument();
  });

  it("falls back to the generic celebrant noun when no name is threaded (#405-B)", () => {
    render(
      <AnnouncementCard
        announcement={makeAnnouncement({ visibility: "hide_from_celebrant" })}
      />
    );
    expect(screen.getByText("Hidden from the celebrant")).toBeInTheDocument();
  });

  describe("multi-line rendering (#464)", () => {
    it("preserves stored newlines via whitespace-pre-wrap on the body element", () => {
      const { container } = render(
        <AnnouncementCard
          announcement={makeAnnouncement({ body: "Day 1: pool\nDay 2: golf" })}
        />
      );
      const body = container.querySelector('[data-testid="announcement-body"]');
      expect(body).not.toBeNull();
      expect(body).toHaveClass("whitespace-pre-wrap");
      // The raw newline must survive into the DOM text content
      expect(body?.textContent).toBe("Day 1: pool\nDay 2: golf");
    });
  });

  describe("URL linkification (#469)", () => {
    it("renders an https URL as an anchor with target=_blank and safe rel", () => {
      render(
        <AnnouncementCard
          announcement={makeAnnouncement({
            body: "Airbnb here: https://airbnb.com/rooms/123",
          })}
        />
      );
      const link = screen.getByRole("link", {
        name: "https://airbnb.com/rooms/123",
      });
      expect(link).toHaveAttribute("href", "https://airbnb.com/rooms/123");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("upgrades a www.-prefixed URL to an https href", () => {
      render(
        <AnnouncementCard
          announcement={makeAnnouncement({ body: "Map: www.example.com/pin" })}
        />
      );
      const link = screen.getByRole("link", { name: "www.example.com/pin" });
      expect(link).toHaveAttribute("href", "https://www.example.com/pin");
    });

    it("does NOT linkify a javascript: scheme", () => {
      render(
        <AnnouncementCard
          announcement={makeAnnouncement({ body: "javascript:alert(1)" })}
        />
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
    });

    it("keeps surrounding text intact around a link", () => {
      const { container } = render(
        <AnnouncementCard
          announcement={makeAnnouncement({
            body: "Before https://example.com after",
          })}
        />
      );
      const body = container.querySelector('[data-testid="announcement-body"]');
      expect(body?.textContent).toBe("Before https://example.com after");
      expect(
        screen.getByRole("link", { name: "https://example.com" })
      ).toBeInTheDocument();
    });

    it("composes with newline preservation — links across multiple lines", () => {
      const { container } = render(
        <AnnouncementCard
          announcement={makeAnnouncement({
            body: "Day 1: https://a.com\nDay 2: https://b.com",
          })}
        />
      );
      const body = container.querySelector('[data-testid="announcement-body"]');
      expect(body?.textContent).toBe(
        "Day 1: https://a.com\nDay 2: https://b.com"
      );
      expect(screen.getAllByRole("link")).toHaveLength(2);
    });
  });
});
