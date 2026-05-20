import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export const STORAGE_STATE = path.resolve(
  __dirname,
  "playwright/.auth/storage-state.json"
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // ------------------------------------------------------------------
    // Setup project: runs once before authenticated test projects.
    // Produces playwright/.auth/storage-state.json.
    // Run in isolation: pnpm exec playwright test --project=setup
    // ------------------------------------------------------------------
    {
      name: "setup",
      testMatch: /e2e\/_setup\/auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // ------------------------------------------------------------------
    // Test projects: depend on the setup project for authenticated tests.
    // The storageState is applied per-test via the `authedPage` fixture
    // (tests/fixtures/auth.ts). Unauthenticated specs work without it.
    // ------------------------------------------------------------------
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
