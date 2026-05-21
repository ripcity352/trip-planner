/**
 * Unit tests for AnnouncementComposer — organizer-only post form.
 * TDD: written before implementation (RED phase).
 */

import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnnouncementComposer } from "../announcement-composer";

vi.mock("@/lib/actions/announcements", () => ({
  postAnnouncement: vi.fn(),
}));

// Mock the shadcn Select with a native <select> so jsdom can interact with it.
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

import { postAnnouncement } from "@/lib/actions/announcements";

const mockPost = vi.mocked(postAnnouncement);

describe("AnnouncementComposer", () => {
  const defaultProps = {
    tripId: "trip-uuid-1",
    isOrganizer: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      ok: true,
      announcement: {
        id: "ann-1",
        trip_id: "trip-uuid-1",
        author_id: "user-1",
        body: "Test announcement",
        pinned: false,
        created_at: "2026-05-20T12:00:00Z",
        idempotency_key: "idem-1",
        visibility: "everyone",
        created_by: "user-1",
      },
    });
  });

  // Organizer view
  it("renders the body textarea for organizers", () => {
    render(<AnnouncementComposer {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(/what's the update/i)
    ).toBeInTheDocument();
  });

  it("renders the submit button for organizers", () => {
    render(<AnnouncementComposer {...defaultProps} />);
    expect(screen.getByRole("button", { name: /send it/i })).toBeInTheDocument();
  });

  it("renders the visibility select label for organizers", () => {
    render(<AnnouncementComposer {...defaultProps} />);
    expect(
      screen.getByText(new RegExp("who sees this", "i"))
    ).toBeInTheDocument();
  });

  // Non-organizer: composer is hidden entirely
  it("renders nothing when isOrganizer=false", () => {
    const { container } = render(
      <AnnouncementComposer {...defaultProps} isOrganizer={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  // Visibility options (3 in MVP — no "custom")
  it("renders everyone, organizers_only, and hide_from_celebrant options", () => {
    render(<AnnouncementComposer {...defaultProps} />);
    expect(screen.getByText(/everyone/i)).toBeInTheDocument();
    expect(screen.getByText(/just organizers/i)).toBeInTheDocument();
    expect(screen.getByText(/hide from the celebrant/i)).toBeInTheDocument();
  });

  it("does not render 'custom' as a visibility option", () => {
    render(<AnnouncementComposer {...defaultProps} />);
    // "custom" is not in the MVP visibility palette
    expect(screen.queryByText(/^custom$/i)).not.toBeInTheDocument();
  });

  // Submission
  it("calls postAnnouncement with tripId and body on submit", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText(/what's the update/i), {
      target: { value: "Pre-game at 7pm in the suite." },
    });

    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-uuid-1",
          body: "Pre-game at 7pm in the suite.",
        }),
        expect.any(String) // idempotency key — generated at submit time
      );
    });
  });

  it("passes a UUID as the idempotency key", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText(/what's the update/i), {
      target: { value: "Reminder: no phones at the dinner." },
    });

    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      const [, idempotencyKey] = mockPost.mock.calls[0];
      expect(idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  it("clears the textarea after a successful post", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/what's the update/i);
    fireEvent.change(textarea, { target: { value: "Dress code is black tie." } });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText(/what's the update/i) as HTMLTextAreaElement)
          .value
      ).toBe("");
    });
  });

  it("shows an error alert on post failure", async () => {
    mockPost.mockResolvedValue({
      ok: false,
      errorKey: "announcement_post_failed",
    });

    render(<AnnouncementComposer {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText(/what's the update/i), {
      target: { value: "Something important." },
    });

    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("does not submit when body is empty", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    // No text entered — click submit
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  it("submits the selected visibility value", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    fireEvent.change(screen.getByTestId("visibility-select"), {
      target: { value: "organizers_only" },
    });
    fireEvent.change(screen.getByPlaceholderText(/what's the update/i), {
      target: { value: "Internal note for the planners." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "organizers_only",
          body: "Internal note for the planners.",
        }),
        expect.any(String)
      );
    });
  });

  it("submits hide_from_celebrant when selected", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    fireEvent.change(screen.getByTestId("visibility-select"), {
      target: { value: "hide_from_celebrant" },
    });
    fireEvent.change(screen.getByPlaceholderText(/what's the update/i), {
      target: { value: "Surprise dinner details." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "hide_from_celebrant" }),
        expect.any(String)
      );
    });
  });

  it("generates a fresh idempotency key on each submission", async () => {
    render(<AnnouncementComposer {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/what's the update/i);

    // First submit
    fireEvent.change(textarea, { target: { value: "First message." } });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));

    const firstKey = mockPost.mock.calls[0][1];

    // Second submit
    fireEvent.change(textarea, { target: { value: "Second message." } });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));

    const secondKey = mockPost.mock.calls[1][1];
    expect(firstKey).not.toBe(secondKey);
  });
});
