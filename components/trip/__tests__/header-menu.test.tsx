/**
 * Tests for `components/trip/header-menu.tsx`.
 *
 * W2a deliverable (#238): account dropdown must expose three items in order:
 *   1. "Your trips"          → href /trips
 *   2. "Sign-in & security"  → href /account/sign-in-and-security
 *   3. "Sign out"            → destructive action
 *
 * Copy sourced from:
 *   - M3_UI_STRINGS.nav_account_trips_link    ("Your trips")
 *   - AUTH_COPY.accountSecurity_meNavLink      ("Sign-in & security")
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// signOut is a server action — mock it so the test environment doesn't blow up.
vi.mock("@/lib/actions/auth", () => ({
  signOut: vi.fn(),
}));

// next/link renders an <a> tag in tests via the mock below.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HeaderMenu } from "@/components/trip/header-menu";

function openMenu() {
  const trigger = screen.getByRole("button", { name: /account menu/i });
  fireEvent.click(trigger);
}

describe("HeaderMenu", () => {
  beforeEach(() => {
    render(
      <HeaderMenu>
        <span>Avatar</span>
      </HeaderMenu>
    );
    openMenu();
  });

  it('renders "Your trips" menu item', async () => {
    const item = await screen.findByRole("menuitem", { name: /your trips/i });
    expect(item).toBeInTheDocument();
  });

  it('"Your trips" links to /trips', async () => {
    const item = await screen.findByRole("menuitem", { name: /your trips/i });
    // The item wraps a next/link <a> — walk up to find the anchor.
    const anchor = item.querySelector("a") ?? item.closest("a") ?? item;
    expect(anchor).toHaveAttribute("href", "/trips");
  });

  it('renders "Sign-in & security" menu item', async () => {
    const item = await screen.findByRole("menuitem", {
      name: /sign-in & security/i,
    });
    expect(item).toBeInTheDocument();
  });

  it('"Sign-in & security" links to /account/sign-in-and-security', async () => {
    const item = await screen.findByRole("menuitem", {
      name: /sign-in & security/i,
    });
    const anchor = item.querySelector("a") ?? item.closest("a") ?? item;
    expect(anchor).toHaveAttribute("href", "/account/sign-in-and-security");
  });

  it('renders "Sign out" menu item', async () => {
    const item = await screen.findByRole("menuitem", { name: /sign out/i });
    expect(item).toBeInTheDocument();
  });

  it("renders items in order: Your trips → Sign-in & security → Sign out", async () => {
    // Wait for all three to be present.
    await screen.findByRole("menuitem", { name: /your trips/i });
    await screen.findByRole("menuitem", { name: /sign-in & security/i });
    await screen.findByRole("menuitem", { name: /sign out/i });

    const items = screen.getAllByRole("menuitem");
    const texts = items.map((el) => el.textContent?.trim());

    // "Your trips" must come before "Sign-in & security" which must come
    // before "Sign out".
    const tripsIdx = texts.findIndex((t) => /your trips/i.test(t ?? ""));
    const securityIdx = texts.findIndex((t) =>
      /sign-in & security/i.test(t ?? "")
    );
    const signOutIdx = texts.findIndex((t) => /sign out/i.test(t ?? ""));

    expect(tripsIdx).toBeLessThan(securityIdx);
    expect(securityIdx).toBeLessThan(signOutIdx);
  });

  it('copy for "Your trips" matches M3_UI_STRINGS.nav_account_trips_link', async () => {
    const item = await screen.findByRole("menuitem", { name: "Your trips" });
    expect(item.textContent?.trim()).toBe("Your trips");
  });

  it('copy for "Sign-in & security" matches AUTH_COPY.accountSecurity_meNavLink', async () => {
    const item = await screen.findByRole("menuitem", {
      name: "Sign-in & security",
    });
    expect(item.textContent?.trim()).toBe("Sign-in & security");
  });
});
