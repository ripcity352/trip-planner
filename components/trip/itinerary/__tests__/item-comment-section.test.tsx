/**
 * Tests for ItemCommentSection — collapsed disclosure + flat comment
 * thread + composer, bundled into one unit (unlike polls, which split
 * this into PollsDisclosure/PollCommentThread/PollCommentComposer —
 * item cards are denser, so this stays one component).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemCommentSection } from "../item-comment-section";
import type { ItemComment } from "@/lib/db/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/actions/itinerary", () => ({
  postItemCommentAction: vi.fn(),
  deleteItemCommentAction: vi.fn(),
}));

import {
  postItemCommentAction,
  deleteItemCommentAction,
} from "@/lib/actions/itinerary";

const mockPost = vi.mocked(postItemCommentAction);
const mockDelete = vi.mocked(deleteItemCommentAction);

const ITEM_ID = "item-1";
const NOW = new Date("2026-08-15T12:00:00.000Z");

const makeComment = (overrides: Partial<ItemComment> = {}): ItemComment => ({
  id: "comment-1",
  item_id: ITEM_ID,
  trip_id: "trip-1",
  author_trip_member_id: "member-1",
  body: "What time are we leaving?",
  idempotency_key: null,
  created_at: "2026-08-15T11:00:00.000Z",
  authorDisplayName: "Dave",
  ...overrides,
});

const baseProps = {
  itemId: ITEM_ID,
  comments: [] as readonly ItemComment[],
  viewerTripMemberId: "member-1",
  isViewerOrganizer: false,
  viewerDisplayName: "Dave",
  now: NOW,
};

beforeEach(() => {
  vi.restoreAllMocks();
  refreshMock.mockReset();
  // vi.restoreAllMocks() only rewinds vi.spyOn mocks — it does not clear
  // call history on plain vi.fn() mocks produced by the vi.mock() factory
  // above, so a call recorded in one test otherwise leaks into the next.
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe("ItemCommentSection — disclosure", () => {
  it("shows 'Add a comment' when there are zero comments", () => {
    render(<ItemCommentSection {...baseProps} />);
    expect(screen.getByText("Add a comment")).toBeInTheDocument();
  });

  it("shows '1 comment' for exactly one comment", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    expect(screen.getByText("1 comment")).toBeInTheDocument();
  });

  it("shows 'N comments' for more than one", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment(), makeComment({ id: "comment-2" })]}
      />
    );
    expect(screen.getByText("2 comments")).toBeInTheDocument();
  });

  it("starts collapsed — thread body is not rendered until toggled", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    expect(screen.queryByText("What time are we leaving?")).not.toBeInTheDocument();
  });

  it("expands on click and reveals the thread", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByText("What time are we leaving?")).toBeInTheDocument();
  });
});

describe("ItemCommentSection — thread", () => {
  it("renders author and relative time for each comment", () => {
    render(<ItemCommentSection {...baseProps} comments={[makeComment()]} />);
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByText(/Dave/)).toBeInTheDocument();
  });

  it("shows the delete control on the viewer's own comment", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "member-1" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByRole("button", { name: /delete comment/i })).toBeInTheDocument();
  });

  it("shows the delete control for an organizer on someone else's comment", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        isViewerOrganizer
        comments={[makeComment({ author_trip_member_id: "someone-else" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.getByRole("button", { name: /delete comment/i })).toBeInTheDocument();
  });

  it("hides the delete control for a non-organizer viewing someone else's comment", () => {
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "someone-else" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(screen.queryByRole("button", { name: /delete comment/i })).not.toBeInTheDocument();
  });
});

describe("ItemCommentSection — composer", () => {
  it("renders the composer when the viewer has a trip_member_id", () => {
    render(<ItemCommentSection {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
  });

  it("does not render the composer for a viewer with no trip_member_id", () => {
    render(
      <ItemCommentSection {...baseProps} viewerTripMemberId={undefined} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    expect(screen.queryByPlaceholderText("Add a comment…")).not.toBeInTheDocument();
  });

  it("posts a comment and shows it optimistically", async () => {
    mockPost.mockResolvedValue({
      ok: true,
      comment: makeComment({ id: "new-comment", body: "Bring cash" }),
    });
    render(<ItemCommentSection {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));

    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
      target: { value: "Bring cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send comment/i }));

    await waitFor(() => {
      expect(screen.getByText("Bring cash")).toBeInTheDocument();
    });
    expect(mockPost).toHaveBeenCalledWith(
      { itemId: ITEM_ID, body: "Bring cash" },
      expect.any(String)
    );
  });
});

describe("ItemCommentSection — delete", () => {
  it("calls deleteItemCommentAction and refreshes on confirmed delete", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDelete.mockResolvedValue({ ok: true });
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "member-1" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    fireEvent.click(screen.getByRole("button", { name: /delete comment/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        { commentId: "comment-1" },
        expect.any(String)
      );
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("does not call the action when the confirm dialog is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ItemCommentSection
        {...baseProps}
        comments={[makeComment({ author_trip_member_id: "member-1" })]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    fireEvent.click(screen.getByRole("button", { name: /delete comment/i }));
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
