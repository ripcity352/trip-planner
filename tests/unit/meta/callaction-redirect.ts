/**
 * AST extraction for the I12 callAction-∌-redirect invariant
 * (callaction-redirect.test.ts). Not a test itself (no `.test.` suffix).
 *
 * THE HAZARD (#438): `callAction` wraps a server action in try/catch to turn a
 * transport REJECT into the `{ ok: false, errorKey: "network" }` envelope. But
 * Next's `redirect()` works by THROWING a `NEXT_REDIRECT` sentinel — the same
 * try/catch swallows it and reports `{ ok: false }` to the caller, so the
 * navigation silently never happens. A redirecting action must be awaited
 * BARE, never through callAction. The `callAction` JSDoc documents this; this
 * extractor makes it enforceable.
 *
 * Two extractors:
 *   redirectingActions(dir) — every exported function in lib/actions whose body
 *     calls `redirect(...)` (derived from source, not hand-listed).
 *   callActionTargets(dirs) — every `callAction(() => TARGET(...))` call site in
 *     the UI, with the wrapped TARGET callee name.
 * The test asserts the two sets are disjoint.
 */

import ts from "typescript";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

function tsFiles(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || name === "node_modules"
        ? []
        : tsFiles(full, exts);
    }
    return exts.some((e) => name.endsWith(e)) &&
      !name.endsWith(".d.ts") &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
      ? [full]
      : [];
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** Does this subtree call `redirect(...)`? */
function callsRedirect(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "redirect"
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Names of exported functions in lib/actions whose body calls redirect(). */
export function redirectingActions(dir: string): Set<string> {
  const names = new Set<string>();
  for (const file of tsFiles(dir, [".ts"])) {
    const sf = parse(file);
    const visit = (node: ts.Node): void => {
      // export async function foo() { … redirect() … }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.body &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        callsRedirect(node.body)
      ) {
        names.add(node.name.text);
      }
      // export const foo = async () => { … redirect() … }
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const d of node.declarationList.declarations) {
          if (
            ts.isIdentifier(d.name) &&
            d.initializer &&
            (ts.isArrowFunction(d.initializer) ||
              ts.isFunctionExpression(d.initializer)) &&
            d.initializer.body &&
            callsRedirect(d.initializer.body)
          ) {
            names.add(d.name.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return names;
}

export type CallActionSite = { file: string; line: number; target: string };

/** The callee name of the first CallExpression inside an arrow/function body. */
function targetOfThunk(thunk: ts.Expression): string | null {
  if (!ts.isArrowFunction(thunk) && !ts.isFunctionExpression(thunk)) return null;
  let target: string | null = null;
  const visit = (n: ts.Node): void => {
    if (target) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee)) target = callee.text;
      else if (ts.isPropertyAccessExpression(callee)) target = callee.name.text;
      return; // first call wins
    }
    ts.forEachChild(n, visit);
  };
  visit(thunk.body);
  return target;
}

/** Every `callAction(() => TARGET(...))` site in the given UI dirs. */
export function callActionTargets(dirs: string[]): CallActionSite[] {
  const sites: CallActionSite[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of tsFiles(dir, [".ts", ".tsx"])) {
      const sf = parse(file);
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "callAction" &&
          node.arguments.length >= 1
        ) {
          const target = targetOfThunk(node.arguments[0]);
          if (target) {
            sites.push({
              file: file.split("/").slice(-2).join("/"),
              line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              target,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return sites;
}
