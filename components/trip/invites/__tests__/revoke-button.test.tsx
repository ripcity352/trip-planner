/**
 * Tests for `components/trip/invites/revoke-button.tsx`.
 *
 * Coverage:
 *   - Click → window.confirm; cancel returns no-op (action not called).
 *   - Confirm → revokeInviteAction called with token.
 *   - Success → onRevoked fires; button removed.
 *   - Failure → error toast renders via role=alert + ERRORS.invite_revoke_failed.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ERRORS } from "@/lib/copy/errors";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

const revokeMock = vi.fn();

vi.mock("@/lib/actions/invites", () => ({
  revokeInviteAction: (...args: unknown[]) => revokeMock(...args),
}));

import { RevokeButton } from "../revoke-button";

const TOKEN = "abcdef0123456789";

describe("RevokeButton", () => {
  beforeEach(() => {
    revokeMock.mockReset();
    vi.restoreAllMocks();
  });

  it("renders the revoke CTA with palette copy", () => {
    render(<RevokeButton token={TOKEN} />);
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    ).toBeInTheDocument();
  });

  it("does NOT call the action when the user cancels the confirm dialog", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RevokeButton token={TOKEN} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    );
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("calls revokeInviteAction with the token after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    revokeMock.mockResolvedValue({ ok: true });

    render(<RevokeButton token={TOKEN} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    );

    await waitFor(() => {
      expect(revokeMock).toHaveBeenCalledWith(TOKEN);
    });
  });

  it("fires onRevoked and removes the button on success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    revokeMock.mockResolvedValue({ ok: true });
    const onRevoked = vi.fn();

    render(<RevokeButton token={TOKEN} onRevoked={onRevoked} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    );

    await waitFor(() => {
      expect(onRevoked).toHaveBeenCalledTimes(1);
    });
    // After success the button removes itself from the DOM.
    expect(
      screen.queryByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    ).not.toBeInTheDocument();
  });

  it("renders the invite_revoke_failed copy on action failure (the no-op-revoke detector path)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    revokeMock.mockResolvedValue({
      ok: false,
      errorKey: "invite_revoke_failed",
    });

    render(<RevokeButton token={TOKEN} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        ERRORS.invite_revoke_failed
      );
    });
    // Button stays so the organizer can retry.
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    ).toBeInTheDocument();
  });
});
