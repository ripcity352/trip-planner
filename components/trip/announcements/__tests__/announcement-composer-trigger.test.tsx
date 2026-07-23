/**
 * Unit tests for AnnouncementComposerTrigger — #470 compact-top relayout.
 *
 * The composer defaults to a collapsed one-line trigger; tapping it
 * expands the real `<AnnouncementComposer>` in place. This suite covers
 * the disclosure behavior only — full composer submission behavior is
 * already covered by announcement-composer.test.tsx.
 */

import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnnouncementComposerTrigger } from "../announcement-composer-trigger";

vi.mock("@/lib/actions/announcements", () => ({
  postAnnouncement: vi.fn(),
}));

// Mock the shadcn Select with a native <select> — same pattern as
// announcement-composer.test.tsx — so jsdom can interact with it once
// the composer expands.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-testid="visibility-select"
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

describe("AnnouncementComposerTrigger", () => {
  const defaultProps = { tripId: "trip-uuid-1", isOrganizer: true };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a quiet reader line for non-organizers, not the compose trigger", () => {
    render(<AnnouncementComposerTrigger {...defaultProps} isOrganizer={false} />);
    // Copy sourced from M3_UI_STRINGS.announcements_reader_only_caption.
    expect(
      screen.getByText(/organizers drop updates here/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a collapsed one-line trigger by default", () => {
    render(<AnnouncementComposerTrigger {...defaultProps} />);
    const trigger = screen.getByRole("button", { expanded: false });
    // Copy sourced from M3_UI_STRINGS.announcements_compose_cta.
    expect(trigger).toHaveTextContent("Post an update");
  });

  it("does not render the full composer form until expanded", () => {
    render(<AnnouncementComposerTrigger {...defaultProps} />);
    expect(screen.queryByPlaceholderText(/what's the update/i)).not.toBeInTheDocument();
  });

  it("expands the full composer when the trigger is tapped", () => {
    render(<AnnouncementComposerTrigger {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByPlaceholderText(/what's the update/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send it/i })).toBeInTheDocument();
  });

  it("collapses back to the trigger when Cancel is tapped", () => {
    render(<AnnouncementComposerTrigger {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByPlaceholderText(/what's the update/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByPlaceholderText(/what's the update/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });
});
