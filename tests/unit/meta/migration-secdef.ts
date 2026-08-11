/**
 * Migration scan for the I5 SECURITY DEFINER anon-revoke invariant
 * (security-definer-anon-revoke.test.ts). Not a test (no `.test.` suffix).
 *
 * Scans supabase/migrations/*.sql for `CREATE [OR REPLACE] FUNCTION
 * public.<name>(...)` blocks that are `SECURITY DEFINER`, and for `REVOKE
 * (EXECUTE|ALL) ON FUNCTION public.<name>(...) FROM ... (public|anon)`.
 *
 * Background: a SECURITY DEFINER function in `public` is PostgREST-callable by
 * `anon` unless EXECUTE is revoked — an anon oracle running with owner rights
 * (project_security_definer_anon_oracle; #422). Trigger functions (RETURNS
 * trigger) are NOT PostgREST-exposable, so they're excluded here. The good
 * pattern (get_poll_vote_counts etc.) pairs each function with
 * `revoke execute ... from public, anon; grant execute ... to authenticated;`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SecDefFunction = {
  name: string;
  /** True if any definition of this name is SECURITY DEFINER. */
  securityDefiner: boolean;
  /** True if every definition returns `trigger` (not PostgREST-exposable). */
  returnsTrigger: boolean;
  /** True if any migration REVOKEs EXECUTE/ALL from public or anon. */
  hasAnonRevoke: boolean;
  /** Migration files that define this function. */
  defFiles: string[];
};

function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

// A function's header is everything from `create ... function public.name(...)`
// up to the body delimiter `as $...$` (or `as '...'`). SECURITY DEFINER and
// RETURNS both live in the header, so we never parse the dollar-quoted body.
const CREATE_FN_RE =
  /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi;
const REVOKE_FN_RE =
  /revoke\s+(?:execute|all)\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s+from\s+([^;]+);/gi;

function headerAfter(sql: string, fromIndex: number): string {
  // Grab a bounded slice and cut at the body delimiter (`as $tag$` / `as '`).
  const slice = sql.slice(fromIndex, fromIndex + 2000);
  const bodyMatch = slice.match(/\bas\s*(\$[a-zA-Z_]*\$|')/i);
  return bodyMatch ? slice.slice(0, bodyMatch.index) : slice;
}

export function extractSecDefFunctions(dir: string): SecDefFunction[] {
  const byName = new Map<
    string,
    {
      securityDefiner: boolean;
      // Undefined until we see a definition; then AND-folded across defs.
      returnsTrigger: boolean | undefined;
      hasAnonRevoke: boolean;
      defFiles: Set<string>;
    }
  >();

  const ensure = (name: string) => {
    let e = byName.get(name);
    if (!e) {
      e = {
        securityDefiner: false,
        returnsTrigger: undefined,
        hasAnonRevoke: false,
        defFiles: new Set(),
      };
      byName.set(name, e);
    }
    return e;
  };

  for (const file of migrationFiles(dir)) {
    const sql = readFileSync(file, "utf8");
    const base = file.split("/").slice(-1)[0];

    CREATE_FN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREATE_FN_RE.exec(sql)) !== null) {
      const name = m[1];
      const header = headerAfter(sql, m.index);
      const isSecDef = /security\s+definer/i.test(header);
      const retTrigger = /returns\s+trigger\b/i.test(header);
      const e = ensure(name);
      e.defFiles.add(base);
      if (isSecDef) e.securityDefiner = true;
      // AND-fold: a name is a trigger function only if EVERY def returns trigger.
      e.returnsTrigger =
        e.returnsTrigger === undefined ? retTrigger : e.returnsTrigger && retTrigger;
    }

    REVOKE_FN_RE.lastIndex = 0;
    while ((m = REVOKE_FN_RE.exec(sql)) !== null) {
      const name = m[1];
      const roles = m[2].toLowerCase();
      if (/\b(public|anon)\b/.test(roles)) {
        ensure(name).hasAnonRevoke = true;
      }
    }
  }

  return [...byName.entries()].map(([name, e]) => ({
    name,
    securityDefiner: e.securityDefiner,
    returnsTrigger: e.returnsTrigger ?? false,
    hasAnonRevoke: e.hasAnonRevoke,
    defFiles: [...e.defFiles],
  }));
}

// A `create policy ... ( ... );` statement; we scan its body for `fn(` calls.
const CREATE_POLICY_RE = /create\s+policy\b[\s\S]*?;/gi;

/**
 * Names of functions referenced inside any RLS policy expression
 * (USING / WITH CHECK). Per the I5 security review: a policy-referenced helper
 * MUST keep anon EXECUTE — PostgreSQL checks EXECUTE against the querying role
 * at call time even for SECURITY DEFINER functions spliced into a policy, so
 * revoking anon would make anon queries error instead of returning empty. This
 * derives the RLS-helper exemption from source rather than hardcoding it.
 */
export function functionsReferencedInPolicies(dir: string): Set<string> {
  const referenced = new Set<string>();
  for (const file of migrationFiles(dir)) {
    const sql = readFileSync(file, "utf8");
    CREATE_POLICY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREATE_POLICY_RE.exec(sql)) !== null) {
      const body = m[0];
      // `public.fn(` or bare `fn(` — capture the callee name.
      const callRe = /(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
      let c: RegExpExecArray | null;
      while ((c = callRe.exec(body)) !== null) referenced.add(c[1].toLowerCase());
    }
  }
  return referenced;
}
