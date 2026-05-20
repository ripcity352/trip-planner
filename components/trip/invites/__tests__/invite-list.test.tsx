/**
 * Unit tests for InviteList — server-friendly list of InviteRow items.
 * TDD: RED written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InviteList } from "../invite-list";
import type { Invite } from "@/lib/db/types";

// Mock client sub-components so we can test InviteList in isolation.
vi.mock("../copy-link-button", () => ({
  CopyLinkButton: ({ token }: { token: string }) => (
    <button data-testid="copy-link-btn">{token}</button>
  ),
}));

vi.mock("@/lib/actions/invites", () => ({
  revokeInviteAction: vi.fn(),
}));

const makeInvite = (overrides: Partial<Invite> = {}): Invite => ({
  token: "tok-1",
  trip_id: "trip-uuid",
  created_by: "user-uuid",
  expires_at: null,
  uses_left: null,
  created_at: new Date("2026-05-20T10:00:00Z").toISOString(),
  ...overrides,
});

describe("InviteList", () => {
  it("renders the empty state when there are no invites", () => {
    render(<InviteList invites={[]} />);
    // M3_UI_STRINGS.invitesPage_empty
    expect(
      screen.getByText(/no links out yet/i),
    ).toBeInTheDocument();
  });

  it("renders a row for each invite", () => {
    const invites = [
      makeInvite({ token: "tok-a" }),
      makeInvite({ token: "tok-b" }),
    ];
    render(<InviteList invites={invites} />);
    const copyBtns = screen.getAllByTestId("copy-link-btn");
    expect(copyBtns).toHaveLength(2);
  });

  it("shows uses remaining when uses_left is set", () => {
    render(
      <InviteList invites={[makeInvite({ uses_left: 3 })]} />,
    );
    // M3_UI_STRINGS.invitesPage_uses_template = "{remaining} of {total} left"
    // uses_left represents the remaining count
    expect(screen.getByText(/of.*left/i)).toBeInTheDocument();
  });

  it("shows the expiry date when expires_at is set", () => {
    const expiresAt = new Date("2026-06-01T00:00:00Z").toISOString();
    render(
      <InviteList invites={[makeInvite({ expires_at: expiresAt })]} />,
    );
    // M3_UI_STRINGS.invitesPage_expires_template = "Expires {when}"
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it("renders a revoke button for each invite", () => {
    render(<InviteList invites={[makeInvite()]} />);
    // M3_UI_STRINGS.invitesPage_revoke_cta = "Revoke"
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("shows unlimited label when uses_left is null", () => {
    render(<InviteList invites={[makeInvite({ uses_left: null })]} />);
    // Should NOT render the uses template when null (unlimited)
    expect(screen.queryByText(/of.*left/i)).not.toBeInTheDocument();
  });
});
