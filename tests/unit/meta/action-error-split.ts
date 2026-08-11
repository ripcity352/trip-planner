/**
 * AST extraction for the I3 deterministic-vs-transient error-split invariant
 * (deterministic-error-split.test.ts). Not a test itself (no `.test.` suffix).
 *
 * BACKGROUND (#474): a mutation server action returns a discriminated
 * `{ ok: false; errorKey }`. The UI copy for each key is either *retry-framed*
 * ("something went wrong, try again" — the `*_failed` / `network` / `rate_limit`
 * family) or *deterministic-framed* ("you can't do that" / "already taken" —
 * `rls_denied`, `validation_failed`, and feature-specific rejects). Collapsing
 * a *coded* Postgres/PostgREST error (unique-violation 23505, RLS 42501, a
 * P0001 trigger raise) into a retry key loops the user forever on a failure a
 * retry can never fix. The split: coded error → deterministic key; only a
 * *codeless* transport failure (fetch reject, timeout) → a retry key.
 *
 * The classification of a coded error can live in TWO places, both valid:
 *   (a) IN the action file — an `error.code === "42501"` style branch.
 *   (b) IN an imported `@/lib/db/<t>.ts` module — the db function inspects
 *       `error.code` and returns/throws a typed outcome the action maps to a
 *       deterministic key (e.g. `updateMyMemberProfile` → 23505 →
 *       `profile_phone_taken`). `profile.ts` / `members.ts` do exactly this.
 *
 * So this extractor, per `lib/actions/*.ts`, reports:
 *   - isMutationAction — returns an `errorKey` discriminant AND touches the DB
 *     (a direct `.insert/.update/.upsert/.delete/.rpc`, or imports `@/lib/db/`).
 *   - inFileCoded — the file itself has an `<x>.code` error inspection.
 *   - dbModulesWithCoded — the `@/lib/db/<t>` modules it imports that
 *     themselves inspect `.code`.
 * A mutation action "performs the split" iff inFileCoded || dbModulesWithCoded
 * is non-empty. Anything else collapses every coded error to a retry key.
 */

import ts from "typescript";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type ActionErrorProfile = {
  file: string;
  isMutationAction: boolean;
  inFileCoded: boolean;
  dbModulesWithCoded: string[];
  importedDbModules: string[];
};

function tsFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"),
    )
    .map((f) => join(dir, f));
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** True if the file contains any `<expr>.code` property access (error-code read). */
function hasCodeInspection(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "code" &&
      // Exclude object-literal shorthand like `{ code }` (that's a write, not a read)
      !ts.isObjectLiteralExpression(node.parent)
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** True if the file writes to the DB directly (chained supabase mutators). */
function hasDirectDbWrite(sf: ts.SourceFile): boolean {
  let found = false;
  const MUT = new Set(["insert", "update", "upsert", "delete", "rpc"]);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      MUT.has(node.expression.name.text)
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** True if the file returns an `errorKey` discriminated result anywhere. */
function returnsErrorKey(sf: ts.SourceFile): boolean {
  return /\berrorKey\s*:/.test(sf.getFullText());
}

/** `@/lib/db/<name>` module specifiers imported by the file. */
function importedDbModules(sf: ts.SourceFile): string[] {
  const mods: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const m = node.moduleSpecifier.text.match(/^@\/lib\/db\/([\w-]+)$/);
      if (m) mods.push(m[1]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...new Set(mods)];
}

export function extractActionErrorProfiles(
  actionsDir: string,
  dbDir: string,
): ActionErrorProfile[] {
  // Pre-compute which db modules inspect `.code`.
  const dbCoded = new Map<string, boolean>();
  for (const file of tsFilesIn(dbDir)) {
    const name = file.split("/").pop()!.replace(/\.ts$/, "");
    dbCoded.set(name, hasCodeInspection(parse(file)));
  }

  const profiles: ActionErrorProfile[] = [];
  for (const file of tsFilesIn(actionsDir)) {
    const sf = parse(file);
    const imports = importedDbModules(sf);
    const isMutationAction =
      returnsErrorKey(sf) && (hasDirectDbWrite(sf) || imports.length > 0);
    profiles.push({
      file: file.split("/").slice(-2).join("/"),
      isMutationAction,
      inFileCoded: hasCodeInspection(sf),
      importedDbModules: imports,
      dbModulesWithCoded: imports.filter((m) => dbCoded.get(m)),
    });
  }
  return profiles;
}

/** Convenience for the test: does this profile perform the coded/codeless split? */
export function performsSplit(p: ActionErrorProfile): boolean {
  return p.inFileCoded || p.dbModulesWithCoded.length > 0;
}

export const DIRS = {
  actions: () => join(process.cwd(), "lib/actions"),
  db: () => join(process.cwd(), "lib/db"),
  exists: existsSync,
};
