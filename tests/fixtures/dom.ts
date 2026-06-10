/**
 * Shared test-harness helpers for async submit interactions.
 *
 * No app imports — pure testing utility.
 */

import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { expect } from "vitest";

/**
 * Click a submit element and wait for it to re-enable before returning.
 *
 * Fixes the async-submit flake class (#230, #207): `fireEvent.click` is
 * synchronous and can fire a second click before React has fully committed
 * all state updates from the first transition (e.g. the errorKey flush
 * after rollback). `userEvent.click` drains the microtask queue after each
 * interaction; the `waitFor(re-enable)` then ensures the full transition
 * — including every setState call inside `startTransition` — has landed
 * before control returns to the test.
 *
 * Uses a native DOM disabled check (no jest-dom dependency) so it works in
 * test files that don't import @testing-library/jest-dom.
 */
export async function clickAndSettle(el: HTMLElement): Promise<void> {
  const user = userEvent.setup();
  await user.click(el);
  // Cast is safe: the helper is called on submit/button elements.
  await waitFor(() => {
    expect((el as HTMLButtonElement).disabled).toBe(false);
  });
}
