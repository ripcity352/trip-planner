/**
 * I11 — no hard-banned UI patterns (CLAUDE.md "What NOT to do" gate).
 *
 * THE INVARIANT: the load-bearing bans stay out of the RENDERED UI —
 * leaderboards, streaks, progress bars / completion scores, passive-aggressive
 * nudges ("Carl still hasn't responded…"), mascots. These are the "helpful,
 * not burdensome" promise; they've been re-litigated repeatedly.
 *
 * THE CHECKER: ESLint rule (d) already bans `rounded-full` on action buttons
 * (#304). This meta-test covers the semantic tells — scanning JSX text, JSX
 * string attributes, `<progress>` / `role="progressbar"`, and the lib/copy
 * palettes via AST (so a `// NO completion UI` comment is never flagged).
 * Zero today — a preventive gate that fails the moment a banned pattern lands
 * in shipped copy or markup.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { scanBannedPatterns, BANNED_PATTERNS } from "./meta/banned-ui-patterns";

const SCAN_DIRS = [
  join(process.cwd(), "app"),
  join(process.cwd(), "components"),
  join(process.cwd(), "lib/copy"),
];

describe("I11 — no hard-banned UI patterns", () => {
  it("has a non-empty banned-pattern list (config sanity)", () => {
    expect(BANNED_PATTERNS.length).toBeGreaterThan(0);
  });

  it("no rendered surface or copy palette contains a banned pattern", () => {
    const hits = scanBannedPatterns(SCAN_DIRS).map(
      (h) => `${h.file}:${h.line} — [${h.pattern}] "${h.text}"`,
    );
    expect(hits, "hard-banned UI patterns in rendered surfaces / copy").toEqual([]);
  });
});
