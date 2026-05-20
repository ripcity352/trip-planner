/**
 * Unit tests for ItemRsvpChip — client component with optimistic state.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemRsvpChip } from "../item-rsvp-chip";

// Mock the server action
vi.mock("@/lib/actions/itinerary-rsvp", () => ({
  setItemRsvp: vi.fn(),
}));

import { setItemRsvp } from "@/lib/actions/itinerary-rsvp";

const mockSetItemRsvp = vi.mocked(setItemRsvp);

describe("ItemRsvpChip", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: action succeeds with the requested status
    mockSetItemRsvp.mockResolvedValue({ ok: true, status: "skipping" });
  });

  it("renders 'Skip me' and 'I'm in' chips", () => {
    render(
      <ItemRsvpChip itemId="item-1" initialStatus={null} />
    );
    expect(screen.getByText("Skip me")).toBeInTheDocument();
    expect(screen.getByText("I'm in")).toBeInTheDocument();
  });

  it("shows no chip as active when initialStatus is null (inherited)", () => {
    render(
      <ItemRsvpChip itemId="item-1" initialStatus={null} />
    );
    const skipBtn = screen.getByText("Skip me").closest("button");
    const goingBtn = screen.getByText("I'm in").closest("button");
    expect(skipBtn).toHaveAttribute("aria-pressed", "false");
    expect(goingBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the active chip when initialStatus is 'going'", () => {
    render(
      <ItemRsvpChip itemId="item-1" initialStatus="going" />
    );
    const goingBtn = screen.getByText("I'm in").closest("button");
    expect(goingBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the active chip when initialStatus is 'skipping'", () => {
    render(
      <ItemRsvpChip itemId="item-1" initialStatus="skipping" />
    );
    const skipBtn = screen.getByText("Skip me").closest("button");
    expect(skipBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("optimistically updates state on click before server responds", async () => {
    // Slow action — let us see the optimistic state
    mockSetItemRsvp.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: "skipping" }), 100))
    );

    render(
      <ItemRsvpChip itemId="item-1" initialStatus={null} />
    );

    const skipBtn = screen.getByText("Skip me").closest("button")!;
    fireEvent.click(skipBtn);

    // Optimistic: chip should appear active immediately
    await waitFor(() => {
      expect(skipBtn).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("rolls back on server error and shows error message", async () => {
    mockSetItemRsvp.mockResolvedValue({
      ok: false,
      errorKey: "item_rsvp_save_failed",
    });

    render(
      <ItemRsvpChip itemId="item-1" initialStatus={null} />
    );

    const skipBtn = screen.getByText("Skip me").closest("button")!;
    fireEvent.click(skipBtn);

    await waitFor(() => {
      // Chip should be rolled back
      expect(skipBtn).toHaveAttribute("aria-pressed", "false");
      // Error should be visible
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("calls setItemRsvp with correct arguments", async () => {
    mockSetItemRsvp.mockResolvedValue({ ok: true, status: "going" });

    render(
      <ItemRsvpChip itemId="item-42" initialStatus={null} />
    );

    fireEvent.click(screen.getByText("I'm in"));

    await waitFor(() => {
      expect(mockSetItemRsvp).toHaveBeenCalledWith(
        { itemId: "item-42", status: "going" },
        expect.any(String) // idempotency key (UUID)
      );
    });
  });
});
