import * as Sentry from "@sentry/nextjs";

// Browser-side Sentry init. Session Replay intentionally disabled for now.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  replaysSessionSampleRate: 0,
});
