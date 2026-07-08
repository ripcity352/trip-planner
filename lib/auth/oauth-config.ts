/**
 * OAuth provider gating (#370).
 *
 * `signInWithOAuthAction` + the Google button shipped code-complete in
 * M5 PR5, but the Supabase Google provider is not enabled in the
 * Dashboard (#232 parked per operator 2026-06-22). Until an operator
 * flips the provider on, a tap dead-ends at a provider-disabled error —
 * so the button only renders when this flag says the provider is live.
 *
 * Flip by setting `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true` (Vercel env +
 * .env.local) AFTER enabling the provider in the Supabase Dashboard,
 * then walk the round-trip and resume #232.
 *
 * Read at call time (not module scope) so tests can stub the env; the
 * literal `process.env.NEXT_PUBLIC_*` reference is what Next.js inlines
 * into the client bundle.
 */
export function isGoogleOAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "true";
}
