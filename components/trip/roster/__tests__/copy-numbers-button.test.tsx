/**
 * Unit tests for CopyNumbersButton — "use client" component.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyNumbersButton } from "../copy-numbers-button";

// ── navigator.clipboard mock ─────────────────────────────────────────────────

const mockWriteText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.restoreAllMocks();
  mockWriteText.mockReset();
  mockWriteText.mockResolvedValue(undefined);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mockWriteText },
  });
});

const phones = ["+15555550100", "+15555550101", "+15555550102"];

describe("CopyNumbersButton", () => {
  it("renders the CTA label from M3_UI_STRINGS", () => {
    render(<CopyNumbersButton phones={phones} />);
    // M3_UI_STRINGS.roster_copy_numbers_cta = "Copy all numbers"
    expect(screen.getByText("Copy all numbers")).toBeInTheDocument();
  });

  it("is disabled when phones array is empty", () => {
    render(<CopyNumbersButton phones={[]} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is not disabled when phones exist", () => {
    render(<CopyNumbersButton phones={phones} />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("calls navigator.clipboard.writeText with comma-separated numbers on click", async () => {
    render(<CopyNumbersButton phones={phones} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(mockWriteText).toHaveBeenCalledOnce();
    expect(mockWriteText).toHaveBeenCalledWith(
      "+15555550100, +15555550101, +15555550102"
    );
  });

  it("shows confirmation message after successful copy", async () => {
    render(<CopyNumbersButton phones={phones} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    // M3_UI_STRINGS.roster_copy_numbers_done = "Copied — paste into iMessage."
    expect(
      screen.getByText("Copied — paste into iMessage.")
    ).toBeInTheDocument();
  });

  it("reverts back to CTA label after showing confirmation", async () => {
    vi.useFakeTimers();
    render(<CopyNumbersButton phones={phones} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByText("Copied — paste into iMessage.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Copy all numbers")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("handles a single phone number without trailing comma", async () => {
    render(<CopyNumbersButton phones={["+15555550100"]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(mockWriteText).toHaveBeenCalledWith("+15555550100");
  });

  it("has tap target height >= 44px (min-h-11 class)", () => {
    render(<CopyNumbersButton phones={phones} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/min-h-11|h-11|h-12/);
  });
});
