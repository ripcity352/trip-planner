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
    // M3_UI_STRINGS.invitesPage_uses_template = "{remaining} left" — schema
    // only tracks remaining, not original max (fix-up after Wave 4c review).
    expect(screen.getByText(/3 left/i)).toBeInTheDocument();
  });

  it("shows the expiry date when expires_at is set", () => {
    const expiresAt = new Date("2026-06-01T00:00:00Z").toISOString();
    render(
      <InviteList invites={[makeInvite({ expires_at: expiresAt })]} />,
    );
    // M3_UI_STRINGS.invitesPage_expires_template = "Expires {when}"
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it("renders each token via the <Identifier> primitive (display-only mono span)", () => {
    render(<InviteList invites={[makeInvite({ token: "tok-x" })]} />);
    // Identifier renders the raw token verbatim in a font-mono <span>.
    // (The mocked CopyLinkButton also contains the token, in a <button> —
    // so we assert a SPAN specifically carries it.)
    const tokenEls = screen.getAllByText("tok-x");
    expect(tokenEls.some((el) => el.tagName === "SPAN")).toBe(true);
    // Display-only: no second copy affordance in the row — copying the link
    // is CopyLinkButton's job. The only "copy"-named control is the mocked
    // CopyLinkButton (data-testid), NOT an Identifier "Copy" button.
    expect(
      screen.queryByRole("button", { name: /^copy$/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a revoke button for each invite", () => {
    render(<InviteList invites={[makeInvite()]} />);
    // M3_UI_STRINGS.invitesPage_revoke_cta = "Revoke"
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("shows unlimited label when uses_left is null", () => {
    render(<InviteList invites={[makeInvite({ uses_left: null })]} />);
    // Should NOT render the uses template when null (unlimited)
    expect(screen.queryByText(/\d+ left/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #385 — dead links (revoked / expired / used-up) must not look live
// ---------------------------------------------------------------------------

describe("InviteList — dead links (#385)", () => {
  // revokeInvite clamps expires_at to now() and keeps the row so the UI
  // can say "this link is dead" — these tests pin that the row actually
  // says it: muted label from lib/copy, no Copy link, no Revoke.

  const PAST = new Date(Date.now() - 60_000).toISOString();
  const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

  it("renders an expired/revoked invite with the dead label and no actions", () => {
    render(
      <InviteList invites={[makeInvite({ expires_at: PAST })]} />,
    );
    // M3_UI_STRINGS.invitesPage_dead_label = "Link's dead"
    expect(screen.getByText(/link's dead/i)).toBeInTheDocument();
    expect(screen.queryByTestId("copy-link-btn")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revoke/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a used-up invite (uses_left = 0) as dead even with future expiry", () => {
    render(
      <InviteList
        invites={[makeInvite({ uses_left: 0, expires_at: FUTURE })]}
      />,
    );
    expect(screen.getByText(/link's dead/i)).toBeInTheDocument();
    expect(screen.queryByTestId("copy-link-btn")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revoke/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the dead row visible with its token still legible", () => {
    render(
      <InviteList invites={[makeInvite({ token: "tok-dead", expires_at: PAST })]} />,
    );
    // The row stays in the list (audit trail) — token still rendered.
    expect(screen.getByText("tok-dead")).toBeInTheDocument();
  });

  it("leaves live invites untouched (Copy link + Revoke still offered)", () => {
    render(
      <InviteList
        invites={[
          makeInvite({ token: "tok-live", expires_at: FUTURE, uses_left: 3 }),
          makeInvite({ token: "tok-dead", expires_at: PAST }),
        ]}
      />,
    );
    // Exactly ONE live row: one copy button, one revoke button.
    expect(screen.getAllByTestId("copy-link-btn")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /revoke/i })).toHaveLength(1);
    // And exactly one dead label.
    expect(screen.getAllByText(/link's dead/i)).toHaveLength(1);
  });
});
