import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init. Safe to leave DSN unset — Sentry treats an empty
// DSN as "disabled" and becomes a no-op, which is what we want locally.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
