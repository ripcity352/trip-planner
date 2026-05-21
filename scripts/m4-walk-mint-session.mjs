#!/usr/bin/env node
// scripts/m4-walk-mint-session.mjs
//
// M4 closure-walk helper: mints a magic-link token via Supabase Admin API
// for `ripcity352@gmail.com` and prints the redirect URL. Used by the
// orchestrator's MCP-Playwright walk after the production Supabase email
// template proved cross-device-fragile (PKCE prefix on the link breaks
// the MCP→inbox→MCP roundtrip).
//
// Usage: `node scripts/m4-walk-mint-session.mjs` (from repo root).
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// This script is closure-walk-only. Do NOT use service-role in app code.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "ripcity352@gmail.com";

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: {
    redirectTo: "https://travelston.com/auth/callback",
  },
});

if (error) {
  console.error("generateLink failed:", error.message);
  process.exit(1);
}

const url = data?.properties?.action_link;

if (!url) {
  console.error("No action_link returned. Inspect:", JSON.stringify(data, null, 2));
  process.exit(1);
}

// Print ONLY the URL on stdout so caller can pipe / copy cleanly.
console.log(url);
