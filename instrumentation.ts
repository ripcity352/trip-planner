import * as Sentry from "@sentry/nextjs";

// Next.js 16 instrumentation hook — runs once per runtime at startup.
// We load the matching Sentry config based on the active runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
