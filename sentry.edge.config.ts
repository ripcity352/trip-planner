import * as Sentry from "@sentry/nextjs";

// Edge runtime Sentry init — minimal: DSN + environment only.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
