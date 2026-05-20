/**
 * Unit tests for CopyLinkButton — client component that builds an invite
 * URL and copies it to the clipboard.
 * TDD: RED written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyLinkButton } from "../copy-link-button";

describe("CopyLinkButton", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    // jsdom doesn't define window.location.origin by default
    Object.defineProperty(window, "location", {
      value: { origin: "https://travelston.com" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with the copy link CTA label", () => {
    render(<CopyLinkButton token="abc123" />);
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText with the full invite URL on click", async () => {
    render(<CopyLinkButton token="tok-xyz" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "https://travelston.com/invite/tok-xyz",
      );
    });
  });

  it("shows the copied confirmation string after a successful copy", async () => {
    render(<CopyLinkButton token="tok-xyz" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      // The label appears both on the button and in the sr-only status span;
      // assert via the button role for a unique match.
      expect(
        screen.getByRole("button", { name: /copied.*paste/i }),
      ).toBeInTheDocument();
    });
  });

  it("renders an error message when clipboard.writeText rejects (no silent failure)", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("permission denied"));
    render(<CopyLinkButton token="tok-xyz" />);
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/couldn't reach/i);
    });
    // The success label must NOT have rendered.
    expect(
      screen.queryByRole("button", { name: /copied.*paste/i }),
    ).not.toBeInTheDocument();
  });

  it("meets minimum tap target of 44px (h-11 class)", () => {
    const { container } = render(<CopyLinkButton token="tok" />);
    const btn = container.querySelector("button");
    // h-11 in Tailwind = 2.75rem = 44px. The class should be present.
    expect(btn?.className).toMatch(/h-11/);
  });
});
