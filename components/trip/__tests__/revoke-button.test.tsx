/**
 * Tests for `components/trip/invites/revoke-button.tsx` (#431).
 *
 * The stuck-forever sub-shape: `revoking` is set true before the await
 * and reset after it. A REJECTED `revokeInviteAction` promise used to
 * skip the reset — button permanently disabled, no error, until reload.
 * Via `callAction` the rejection now resolves to the network envelope,
 * so the button re-enables and the network copy renders.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

const revokeInviteActionMock = vi.fn();

vi.mock("@/lib/actions/invites", () => ({
  revokeInviteAction: (...args: unknown[]) => revokeInviteActionMock(...args),
}));

const TOKEN = "tok_11111111111111111111";

describe("RevokeButton", () => {
  beforeEach(() => {
    revokeInviteActionMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("revokes and hides itself on success", async () => {
    revokeInviteActionMock.mockResolvedValue({ ok: true });

    const { RevokeButton } = await import(
      "@/components/trip/invites/revoke-button"
    );
    render(<RevokeButton token={TOKEN} />);

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.invitesPage_revoke_cta })
    );

    await waitFor(() => {
      expect(revokeInviteActionMock).toHaveBeenCalledWith(TOKEN);
      expect(
        screen.queryByRole("button", {
          name: M3_UI_STRINGS.invitesPage_revoke_cta,
        })
      ).not.toBeInTheDocument();
    });
  });

  it("re-enables the button and shows network copy when the action REJECTS", async () => {
    revokeInviteActionMock.mockRejectedValue(new TypeError("fetch failed"));

    const { RevokeButton } = await import(
      "@/components/trip/invites/revoke-button"
    );
    render(<RevokeButton token={TOKEN} />);

    const button = screen.getByRole("button", {
      name: M3_UI_STRINGS.invitesPage_revoke_cta,
    });
    fireEvent.click(button);

    // The rejection must surface the network copy...
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(ERRORS.network);
    });
    // ...and the pending flag must reset — no stuck-disabled button.
    expect(button).toBeEnabled();
  });
});
