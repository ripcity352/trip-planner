import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    // #644: the itinerary add/delete refresh fix depends on the client
    // Router Cache never re-serving a stale dynamic page snapshot. 0 is
    // the Next 16 default — pinned explicitly so a future Next default
    // change can't silently reintroduce the stale-list race.
    staleTimes: {
      dynamic: 0,
      // The nested object replaces Next's default wholesale (experimental
      // is merged only one level deep) — `static` must be restated or the
      // default 300s cap on static-route stale time is silently dropped.
      static: 300,
    },
  },
};

// Sourcemap upload is a no-op when SENTRY_AUTH_TOKEN is unset, so local
// builds without Sentry credentials succeed without extra guards.
// `sourcemaps.deleteSourcemapsAfterUpload` defaults to true in @sentry/nextjs
// v8+, replacing the removed `hideSourceMaps` flag.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
