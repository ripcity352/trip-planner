import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      // Was missing — app/(authed)/trips/[tripId]/dates/__tests__/
      // member-view.test.tsx existed but never ran under `pnpm test`
      // (#454/#481/#482 PR). Covers the growing set of co-located
      // __tests__ dirs under /app.
      "app/**/*.test.{ts,tsx}",
    ],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
