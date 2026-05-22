/**
 * Tests for `components/trip/header.tsx`.
 *
 * Header is a Server Component but renders pure JSX from a `user` prop —
 * no async work, no Next-runtime dependencies — so it tests cleanly in
 * jsdom. We assert: brand text, avatar fallback when no avatar_url,
 * avatar image when avatar_url present, and that opening the menu
 * surfaces a "Sign out" item.
 *
 * The dropdown trigger uses `@base-ui/react`'s Menu which requires a
 * pointer/keyboard event to open. We dispatch a click and then look for
 * the menu item in the portal.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { Header, type HeaderUser } from "@/components/trip/header";

/**
 * base-ui's `<Avatar.Image>` waits for the underlying `<img>` to load
 * before swapping the fallback out. jsdom doesn't actually fetch
 * images, so we shim `window.Image` to fire `onload` synchronously the
 * moment `src` is assigned — this matches the real-browser fast path
 * for cached images and lets us assert image rendering in unit tests.
 */
beforeEach(() => {
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = "";
      naturalWidth = 1;
      complete = true;
      set src(value: string) {
        this._src = value;
        // Resolve on the next tick so React's useEffect can subscribe.
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    }
  );
});

const baseUser: HeaderUser = {
  email: "dave@example.com",
  user_metadata: {},
};

describe("Header", () => {
  it("renders the Party Trip brand", () => {
    render(<Header user={baseUser} />);
    expect(screen.getByText("Party Trip")).toBeInTheDocument();
  });

  it("falls back to the first letter of the email when no avatar_url is present", () => {
    render(<Header user={baseUser} />);
    // The fallback is uppercased to read as an initial avatar.
    expect(screen.getByTestId("header-avatar-fallback")).toHaveTextContent("D");
  });

  it("renders the avatar image when avatar_url is present", async () => {
    const userWithAvatar: HeaderUser = {
      email: "dave@example.com",
      user_metadata: { avatar_url: "https://example.com/dave.png" },
    };
    render(<Header user={userWithAvatar} />);

    const img = await waitFor(
      () => screen.getByTestId("header-avatar-image") as HTMLImageElement
    );
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("https://example.com/dave.png");
  });

  it('opens the menu to reveal a "Sign out" item', async () => {
    render(<Header user={baseUser} />);
    const trigger = screen.getByRole("button", { name: /account menu/i });
    fireEvent.click(trigger);

    // base-ui's Menu portals the popup; testing-library's screen queries
    // span all attached portals via document.body.
    expect(
      await screen.findByRole("menuitem", { name: /sign out/i })
    ).toBeInTheDocument();
  });

  // W2a: brand link tests (#238)
  it("brand renders as a link to /trips", () => {
    render(<Header user={baseUser} />);
    const brandLink = screen.getByRole("link", { name: /party trip/i });
    expect(brandLink).toBeInTheDocument();
    expect(brandLink).toHaveAttribute("href", "/trips");
  });

  it("brand link aria-label comes from M3_UI_STRINGS.nav_brand_label", () => {
    render(<Header user={baseUser} />);
    // The aria-label on the <Link> matches the copy key value "Party Trip"
    const brandLink = screen.getByRole("link", { name: "Party Trip" });
    expect(brandLink).toBeInTheDocument();
  });
});
