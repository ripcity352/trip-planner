/**
 * Unit tests for CreateInviteForm — client component (react-hook-form + zod).
 * TDD: RED written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateInviteForm } from "../create-invite-form";

const createInviteActionMock = vi.fn();
vi.mock("@/lib/actions/invites", () => ({
  createInviteAction: (...args: unknown[]) => createInviteActionMock(...args),
}));

describe("CreateInviteForm", () => {
  const defaultProps = {
    tripId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    onCreated: vi.fn(),
  };

  beforeEach(() => {
    createInviteActionMock.mockReset();
    defaultProps.onCreated = vi.fn();
  });

  it("renders the max uses and expires fields", () => {
    render(<CreateInviteForm {...defaultProps} />);
    // M3_UI_STRINGS.invitesForm_max_uses_label
    expect(screen.getByLabelText(/max uses/i)).toBeInTheDocument();
    // M3_UI_STRINGS.invitesForm_expires_label
    expect(screen.getByLabelText(/expires/i)).toBeInTheDocument();
  });

  it("renders the submit CTA button", () => {
    render(<CreateInviteForm {...defaultProps} />);
    // M3_UI_STRINGS.invitesForm_submit = "Mint it"
    expect(screen.getByRole("button", { name: /mint it/i })).toBeInTheDocument();
  });

  it("submits without optional fields (unlimited, no expiry)", async () => {
    createInviteActionMock.mockResolvedValueOnce({
      ok: true,
      invite: {
        token: "tok-1",
        trip_id: defaultProps.tripId,
        created_by: "u-1",
        expires_at: null,
        uses_left: null,
        created_at: new Date().toISOString(),
      },
    });

    render(<CreateInviteForm {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /mint it/i }));

    await waitFor(() => {
      expect(createInviteActionMock).toHaveBeenCalledWith({
        tripId: defaultProps.tripId,
        usesLeft: null,
        expiresAt: null,
      });
      expect(defaultProps.onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("converts a datetime-local expiry to an ISO-8601 string (regression: #257)", async () => {
    createInviteActionMock.mockResolvedValueOnce({
      ok: true,
      invite: {
        token: "tok-expiry",
        trip_id: defaultProps.tripId,
        created_by: "u-1",
        expires_at: new Date().toISOString(),
        uses_left: null,
        created_at: new Date().toISOString(),
      },
    });

    render(<CreateInviteForm {...defaultProps} />);
    // datetime-local inputs accept "YYYY-MM-DDTHH:MM" — the exact shape
    // the browser produces. Pick a future time so the server's
    // refine(> Date.now()) would accept it on a real round-trip.
    const futureLocal = "2099-12-31T23:59";
    fireEvent.change(screen.getByLabelText(/expires/i), {
      target: { value: futureLocal },
    });
    fireEvent.click(screen.getByRole("button", { name: /mint it/i }));

    await waitFor(() => {
      expect(createInviteActionMock).toHaveBeenCalledTimes(1);
    });
    const callArg = createInviteActionMock.mock.calls[0][0] as {
      expiresAt: string | null;
    };
    expect(callArg.expiresAt).toEqual(new Date(futureLocal).toISOString());
    // Belt-and-suspenders: must satisfy z.string().datetime() — seconds + Z/offset.
    expect(callArg.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  });

  it("passes usesLeft as a number when filled in", async () => {
    createInviteActionMock.mockResolvedValueOnce({
      ok: true,
      invite: {
        token: "tok-2",
        trip_id: defaultProps.tripId,
        created_by: "u-1",
        expires_at: null,
        uses_left: 5,
        created_at: new Date().toISOString(),
      },
    });

    render(<CreateInviteForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/max uses/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /mint it/i }));

    await waitFor(() => {
      expect(createInviteActionMock).toHaveBeenCalledWith({
        tripId: defaultProps.tripId,
        usesLeft: 5,
        expiresAt: null,
      });
    });
  });

  it("shows an error toast when the action returns invite_mint_failed", async () => {
    createInviteActionMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "invite_mint_failed",
    });

    render(<CreateInviteForm {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /mint it/i }));

    await waitFor(() => {
      // ERRORS.invite_mint_failed contains "Couldn't mint"
      expect(screen.getByText(/couldn't mint/i)).toBeInTheDocument();
    });
  });

  it("does not call onCreated when the action fails", async () => {
    createInviteActionMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "network",
    });

    render(<CreateInviteForm {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /mint it/i }));

    await waitFor(() => {
      expect(createInviteActionMock).toHaveBeenCalled();
    });
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });
});
