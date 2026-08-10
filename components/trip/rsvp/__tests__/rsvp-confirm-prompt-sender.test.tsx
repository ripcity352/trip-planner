/**
 * Unit tests for RsvpConfirmPromptSender (#549) — the organizer-side sender.
 * Verifies: nothing renders with no targets; collapsed by default; sending
 * calls sendRsvpConfirmPromptAction with the picked target/status/note; the
 * "asked" cue shows for a member with a pending ask.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RsvpConfirmPromptSender } from "../rsvp-confirm-prompt-sender";

vi.mock("@/lib/actions/rsvp-confirm-prompts", () => ({
  sendRsvpConfirmPromptAction: vi.fn(),
}));

import { sendRsvpConfirmPromptAction } from "@/lib/actions/rsvp-confirm-prompts";

const sendMock = vi.mocked(sendRsvpConfirmPromptAction);

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const ROB = "22222222-2222-4222-8222-222222222222";
const PAT = "33333333-3333-4333-8333-333333333333";

const TARGETS = [
  { id: ROB, name: "Rob", alreadyAsked: null },
  { id: PAT, name: "Pat", alreadyAsked: "going" as const },
];

describe("RsvpConfirmPromptSender", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sendMock.mockResolvedValue({ ok: true });
  });

  it("renders nothing with no targets", () => {
    const { container } = render(
      <RsvpConfirmPromptSender tripId={TRIP_ID} targets={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsed by default", () => {
    render(<RsvpConfirmPromptSender tripId={TRIP_ID} targets={TARGETS} />);
    expect(
      screen.getByRole("button", { name: /confirm someone's rsvp/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("marks a member who already has a pending ask", () => {
    render(<RsvpConfirmPromptSender tripId={TRIP_ID} targets={TARGETS} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm someone's rsvp/i }));
    expect(screen.getByRole("option", { name: /Pat · asked/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Rob$/ })).toBeInTheDocument();
  });

  it("sends the ask with the picked target, status, and note", async () => {
    render(<RsvpConfirmPromptSender tripId={TRIP_ID} targets={TARGETS} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm someone's rsvp/i }));

    const [personSelect, statusSelect] = screen.getAllByRole("combobox");
    fireEvent.change(personSelect, { target: { value: ROB } });
    fireEvent.change(statusSelect, { target: { value: "maybe" } });
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), {
      target: { value: "caught me at lunch" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send the confirm/i }));

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(
        {
          tripId: TRIP_ID,
          targetTripMemberId: ROB,
          proposedStatus: "maybe",
          note: "caught me at lunch",
        },
        expect.any(String)
      );
    });
    // Confirmation line names the member.
    await waitFor(() => {
      expect(screen.getByText(/Asked Rob to confirm/i)).toBeInTheDocument();
    });
  });
});
