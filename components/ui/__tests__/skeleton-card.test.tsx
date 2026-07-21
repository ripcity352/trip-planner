/**
 * Render tests for the shared route-loading skeleton primitives
 * (issue #466). Low-value to test pixel-perfect placeholder shapes, so
 * this only covers the contract each `loading.tsx` relies on:
 *   - `SkeletonCard` renders the configured number of bar placeholders
 *   - `SkeletonCard` honors `showAvatar`
 *   - `SkeletonCardList` renders `count` cards
 *   - `SkeletonPage` renders a single accessible loading region
 *     (screen readers should hear "Loading" once, not once per card —
 *     the cards themselves are `aria-hidden`)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SkeletonCard,
  SkeletonCardList,
  SkeletonPage,
} from "../skeleton-card";

describe("SkeletonCard", () => {
  it("renders the configured number of bar placeholders", () => {
    const { container } = render(<SkeletonCard lines={3} />);
    // Bars are the `h-3` muted divs inside the flex-1 line stack.
    const bars = container.querySelectorAll(".h-3.bg-muted");
    expect(bars.length).toBe(3);
  });

  it("defaults to 2 lines and no avatar", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelectorAll(".h-3.bg-muted").length).toBe(2);
    expect(container.querySelector(".rounded-full.bg-muted")).toBeNull();
  });

  it("renders an avatar placeholder when showAvatar is true", () => {
    const { container } = render(<SkeletonCard showAvatar />);
    expect(container.querySelector(".rounded-full.bg-muted")).not.toBeNull();
  });
});

describe("SkeletonCardList", () => {
  it("renders `count` skeleton cards", () => {
    const { container } = render(<SkeletonCardList count={4} />);
    expect(
      container.querySelectorAll('[data-slot="skeleton-card"]').length
    ).toBe(4);
  });

  it("defaults to 3 cards", () => {
    const { container } = render(<SkeletonCardList />);
    expect(
      container.querySelectorAll('[data-slot="skeleton-card"]').length
    ).toBe(3);
  });

  it("hides the list from assistive tech (SkeletonPage owns the single status region)", () => {
    const { container } = render(<SkeletonCardList />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("SkeletonPage", () => {
  it("exposes exactly one accessible status region labeled Loading", () => {
    render(
      <SkeletonPage>
        <SkeletonCardList count={2} />
      </SkeletonPage>
    );

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute("aria-label", "Loading");
  });

  it("renders the children passed to it", () => {
    render(
      <SkeletonPage>
        <div data-testid="child" />
      </SkeletonPage>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
