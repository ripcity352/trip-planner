/**
 * Unit tests for RsvpConfirmBanner (#549) — the member-facing confirm/dismiss
 * banner. The member's own tap is the only thing that writes rsvp_status.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RsvpConfirmBanner } from "../rsvp-confirm-banner";

vi.mock("@/lib/actions/rsvp-confirm-prompts", () => ({
  confirmRsvpConfirmPromptAction: vi.fn(),
  dismissRsvpConfirmPromptAction: vi.fn(),
}));

import {
  confirmRsvpConfirmPromptAction,
  dismissRsvpConfirmPromptAction,
} from "@/lib/actions/rsvp-confirm-prompts";

const confirmMock = vi.mocked(confirmRsvpConfirmPromptAction);
const dismissMock = vi.mocked(dismissRsvpConfirmPromptAction);

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

describe("RsvpConfirmBanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    confirmMock.mockResolvedValue({ ok: true });
    dismissMock.mockResolvedValue({ ok: true });
  });

  it("renders the sender name + status in the heading and the note", () => {
    render(
      <RsvpConfirmBanner
        tripId={TRIP_ID}
        proposedStatus="going"
        note="Rob texted me"
        senderName="Dave"
      />
    );
    expect(screen.getByText(/Dave heard you're in/i)).toBeInTheDocument();
    expect(screen.getByText(/Rob texted me/i)).toBeInTheDocument();
  });

  it("falls back to a generic sender when the name is null", () => {
    render(
      <RsvpConfirmBanner
        tripId={TRIP_ID}
        proposedStatus="maybe"
        note={null}
        senderName={null}
      />
    );
    expect(screen.getByText(/An organizer heard you're a maybe/i)).toBeInTheDocument();
  });

  it("confirm calls confirmRsvpConfirmPromptAction and then hides the banner", async () => {
    render(
      <RsvpConfirmBanner
        tripId={TRIP_ID}
        proposedStatus="going"
        note={null}
        senderName="Dave"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /that's me/i }));
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(TRIP_ID, "going", expect.any(String));
    });
    await waitFor(() => {
      expect(screen.queryByText(/Dave heard you're in/i)).not.toBeInTheDocument();
    });
  });

  it("dismiss calls dismissRsvpConfirmPromptAction and hides the banner", async () => {
    render(
      <RsvpConfirmBanner
        tripId={TRIP_ID}
        proposedStatus="declined"
        note={null}
        senderName="Dave"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /not quite/i }));
    await waitFor(() => {
      expect(dismissMock).toHaveBeenCalledWith(TRIP_ID);
    });
    await waitFor(() => {
      expect(
        screen.queryByText(/Dave heard you're sitting this one out/i)
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the banner and shows an error line when the action fails", async () => {
    confirmMock.mockResolvedValue({ ok: false, errorKey: "rate_limit" });
    render(
      <RsvpConfirmBanner
        tripId={TRIP_ID}
        proposedStatus="going"
        note={null}
        senderName="Dave"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /that's me/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/Dave heard you're in/i)).toBeInTheDocument();
  });
});
