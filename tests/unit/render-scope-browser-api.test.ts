/**
 * I9 — no browser API executed during render (hydration-mismatch gate).
 *
 * THE INVARIANT: a `"use client"` component must not read a browser global
 * (`window`, `document`, `localStorage`, `sessionStorage`, `navigator`,
 * `location`, `matchMedia`) during the render pass — the module top level, the
 * component body directly, or a `useState`/`useReducer`/`useMemo` initializer.
 * All of those run on the SSR pass where the global doesn't exist → a crash or
 * a hydration mismatch (#254, feedback_scripted_walk_hydration). The correct
 * shape defaults on SSR and reads the global inside an effect
 * (components/trip/arrivals/arrivals-manifest.tsx is canonical).
 *
 * THE CHECKER (this file): AST scope analysis (meta/render-scope-browser-api.ts).
 * Effect callbacks, `useCallback` bodies, event handlers, and plain helpers are
 * NOT flagged — they run after mount / on demand. Ships as a permanent CI gate.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { findRenderScopeBrowserApi } from "./meta/render-scope-browser-api";

const SCAN_DIRS = [
  join(process.cwd(), "components"),
  join(process.cwd(), "app"),
];

describe("I9 — no browser API at render scope", () => {
  it("no client component reads a browser global during render", () => {
    const violations = findRenderScopeBrowserApi(SCAN_DIRS).map(
      (v) => `${v.file}:${v.line} — \`${v.global}\` at ${v.reason} (move to a useEffect)`,
    );
    expect(violations, "browser globals read during the render pass").toEqual([]);
  });
});
