/**
 * AST scan for the I11 hard-banned-UI-pattern invariant
 * (banned-ui-patterns.test.ts). Not a test (no `.test.` suffix).
 *
 * CLAUDE.md's "What NOT to do" list bans a set of load-bearing UI patterns
 * (leaderboards, streaks, progress bars / completion scores, passive-aggressive
 * nudges, mascots). ESLint rule (d) already bans `rounded-full` on buttons;
 * this scans RENDERED surfaces — JSX text, JSX string attributes (className /
 * aria-label / etc.), `<progress>` elements + `role="progressbar"`, and the
 * copy palettes in lib/copy — for the remaining tells. It reads only AST string
 * nodes, so a `// NO completion UI` comment (the correct, intentional kind) is
 * never a false positive.
 */

import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type BannedHit = {
  file: string;
  line: number;
  pattern: string;
  text: string;
};

/** Banned tells: [label, regex, why]. Precise, word-boundaried — no false hits. */
export const BANNED_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["leaderboard", /\bleader-?board/i],
  ["streak", /\bstreak(s|ed)?\b/i],
  ["completion-score", /\b(completion|complete)\s*(score|percentage|ratio|meter|%)/i],
  ["percent-complete", /\b\d{1,3}\s*%\s*(complete|done|filled)/i],
  ["progress-bar-copy", /\bprogress\s*bar\b/i],
  // Passive-aggressive nudge (CLAUDE.md: "Carl still hasn't responded…").
  ["nudge-still-hasnt", /\bstill\s+hasn'?t\b/i],
  ["nudge-hasnt-x", /\bhasn'?t\s+(responded|replied|rsvp|rsvp'?d|paid|answered|voted)/i],
  ["nudge-waiting-on", /\bwaiting\s+on\s+(you|\w+\s+to)\b/i],
  // Anthropomorphized mascot ("Hi, I'm Sparky!") — greeting + self-intro, so a
  // plain "I'm in!" never trips it.
  ["mascot", /\b(hi|hey|hello|howdy),?\s+i'?m\s+[A-Z]\w+/i],
];

function walkFiles(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walkFiles(full, exts, out);
    } else if (exts.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function match(text: string): string | null {
  for (const [label, re] of BANNED_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

/** Collect rendered strings + structural tells from a .tsx / copy .ts file. */
export function scanBannedPatterns(dirs: string[]): BannedHit[] {
  const hits: BannedHit[] = [];
  const files = dirs.flatMap((d) =>
    walkFiles(d, /\.(tsx|ts)$/),
  );

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const rel = file.split("/").slice(-4).join("/");
    const isCopy = /\/lib\/copy\//.test(file);

    const push = (node: ts.Node, text: string) => {
      const pattern = match(text);
      if (pattern) {
        hits.push({
          file: rel,
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          pattern,
          text: text.trim().slice(0, 80),
        });
      }
    };

    const visit = (node: ts.Node): void => {
      // JSX rendered text.
      if (ts.isJsxText(node)) push(node, node.text);
      // JSX string attributes (className, aria-label, title, alt, …).
      if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
        push(node.initializer, node.initializer.text);
      }
      // Structural: <progress> element or role="progressbar".
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        node.tagName.text === "progress"
      ) {
        hits.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, pattern: "progress-element", text: "<progress>" });
      }
      // Copy-palette string values (lib/copy/*.ts) — where nudge phrasing lives.
      if (isCopy && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
        push(node, node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return hits;
}
