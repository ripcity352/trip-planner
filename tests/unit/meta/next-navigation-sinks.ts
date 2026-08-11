/**
 * AST scan for the I10 `next`-is-GET-navigable invariant
 * (next-navigation-sinks.test.ts). Not a test (no `.test.` suffix).
 *
 * Enumerates client-side location-navigation sinks — `window.location.href = X`,
 * `location.href = X`, `window.location.assign(X)` / `.replace(X)` — and
 * classifies the navigated expression X. These are the exact open-redirect /
 * XSS sinks safeNext() exists to neuter ("Bites client-side sinks like
 * window.location.href = next" — #316/#317, safe-next.ts). Every such sink must
 * navigate to a safeNext()-derived value, a string literal, or an allowlisted
 * server-minted URL (the OAuth round-trip URL) — never a raw `next`.
 *
 * safeNext() ITSELF is unit-tested exhaustively (tests/unit/safe-next.test.ts);
 * this checker is the missing guard against a NEW sink skipping it.
 */

import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type NavSink = {
  file: string;
  line: number;
  code: string;
  /** How the navigated expression is classified. */
  kind: "safeNext" | "literal" | "allowlisted" | "UNGUARDED";
};

/**
 * Navigated expressions that are safe without safeNext, by exact source text.
 * Keep tiny + reasoned — each is a non-`next` value.
 */
const ALLOWLISTED_TARGETS = new Set<string>([
  // OAuth start URL minted by Supabase server-side (signInWithOAuthAction) —
  // an absolute provider URL, never a user-supplied `next`. safe-next.ts §OAuth.
  "result.url",
]);

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walkFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `window.location`, `location`, `window.top.location`, `self.location`, … */
function isLocationObject(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return node.text === "location";
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "location";
  return false;
}

/** A `<location>.href` member access. */
function isLocationHref(node: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "href" &&
    isLocationObject(node.expression)
  );
}

function classify(expr: ts.Expression, safeNextVars: Set<string>): NavSink["kind"] {
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "safeNext") {
    return "safeNext";
  }
  if (ts.isIdentifier(expr) && safeNextVars.has(expr.text)) return "safeNext";
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return "literal";
  if (ALLOWLISTED_TARGETS.has(expr.getText())) return "allowlisted";
  return "UNGUARDED";
}

export function findNavSinks(dirs: string[]): NavSink[] {
  const sinks: NavSink[] = [];
  const files = dirs.flatMap((d) => walkFiles(d));

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("location")) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

    // Local identifiers bound from safeNext(...) — `const x = safeNext(...)`
    // or `{ next: safeNext(...) }`.
    const safeNextVars = new Set<string>();
    const gatherSafe = (node: ts.Node): void => {
      const isSafeCall = (e: ts.Node): boolean =>
        ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "safeNext";
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isSafeCall(node.initializer)) {
        safeNextVars.add(node.name.text);
      }
      ts.forEachChild(node, gatherSafe);
    };
    gatherSafe(sf);

    const record = (node: ts.Node, expr: ts.Expression) => {
      const kind = classify(expr, safeNextVars);
      sinks.push({
        file: file.split("/").slice(-4).join("/"),
        line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        code: node.getText().replace(/\s+/g, " ").slice(0, 100),
        kind,
      });
    };

    const visit = (node: ts.Node): void => {
      // `<location>.href = X`
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isLocationHref(node.left)
      ) {
        record(node, node.right);
      }
      // `<location>.assign(X)` / `<location>.replace(X)`
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === "assign" || node.expression.name.text === "replace") &&
        isLocationObject(node.expression.expression) &&
        node.arguments[0]
      ) {
        record(node, node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sinks;
}
