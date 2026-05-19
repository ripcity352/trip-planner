import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
