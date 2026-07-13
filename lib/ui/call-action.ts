/**
 * callAction — shared rejection guard for awaited server actions (#431).
 *
 * Every mutation server action RESOLVES to the `{ ok: true, ... } |
 * { ok: false, errorKey }` envelope — the action itself never throws.
 * But the transport can still reject the await: a middleware-edge 429
 * answers with raw JSON (not a server-action payload) so the action
 * fetch throws, and so does a plain network drop. An uncaught rejection
 * is swallowed by RHF's handleSubmit and by startTransition callbacks —
 * silent no-op buttons, or worse, pending flags set before the await
 * that never reset (stuck-disabled UI until reload).
 *
 * Wrapping the call converts a rejection into the same envelope every
 * call site already handles: the existing `if (!result.ok)` branch
 * renders the network copy, and code after the await (pending-flag
 * resets) always runs. Extracted from the `runAction` wrapper PR #430
 * added to app/login/_form.tsx.
 *
 * Usage:
 *   const result = await callAction(() => someAction(input, key));
 *   if (!result.ok) {
 *     setErrorKey(result.errorKey);
 *     return;
 *   }
 */

import type { ErrorKey } from "@/lib/copy/errors";

/**
 * The envelope shape every mutation server action resolves to. Concrete
 * results may carry extra payload on the ok arm (`invite`, `item`,
 * `url`, ...) — they all extend this.
 */
export type ActionResult = { ok: true } | { ok: false; errorKey: ErrorKey };

/**
 * `Extract` keeps the literal compile-bound to lib/copy/errors — if the
 * "network" key is ever renamed, this file fails typecheck instead of
 * silently returning an unmapped key.
 */
export type NetworkFailure = {
  ok: false;
  errorKey: Extract<ErrorKey, "network">;
};

export async function callAction<T extends ActionResult>(
  fn: () => Promise<T>
): Promise<T | NetworkFailure> {
  try {
    return await fn();
  } catch (err) {
    // Log the error NAME only — no payloads, no user data (the PR #430
    // structured-log convention).
    console.error("[call-action] server action rejected", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, errorKey: "network" };
  }
}
