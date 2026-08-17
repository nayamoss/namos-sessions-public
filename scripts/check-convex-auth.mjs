#!/usr/bin/env node
/**
 * Guard against the 2026-08-16 onboarding outage.
 *
 * `npx convex dev` derives the deployment's CLERK_JWT_ISSUER_DOMAIN from
 * VITE_CLERK_PUBLISHABLE_KEY. While dev and production share one Convex
 * deployment, a `pk_test_` key in a local env file silently repoints the
 * production backend at a dev Clerk instance. Every authenticated write then
 * fails identity verification and users see a generic "cannot write to the
 * database" error. It is invisible until someone tries to sign up.
 *
 * This script re-asserts the invariant after any deploy:
 *
 *   the deployment's CLERK_JWT_ISSUER_DOMAIN
 *     === the issuer encoded in the PRODUCTION publishable key
 *
 * The production publishable key in wrangler.jsonc is the single source of
 * truth — it is what real users' browsers authenticate against, so it is the
 * only value the backend may trust.
 *
 * Usage:
 *   node scripts/check-convex-auth.mjs         # verify, exit 1 on drift
 *   node scripts/check-convex-auth.mjs --fix   # verify and repair drift
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldFix = process.argv.includes("--fix");

/** Clerk publishable keys are `pk_live_<base64(host)>$` — decode the host. */
function issuerFromPublishableKey(key) {
  const body = key.replace(/^pk_(live|test)_/, "");
  const host = Buffer.from(body, "base64").toString("utf8").replace(/\$+$/, "");
  if (!host.includes(".")) {
    throw new Error(`Could not decode a Clerk host from publishable key "${key}".`);
  }
  return `https://${host}`;
}

function readProductionPublishableKey() {
  // Strip // and /* */ comments so the jsonc file parses as JSON.
  const raw = readFileSync(join(repoRoot, "wrangler.jsonc"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const key = JSON.parse(raw)?.vars?.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key) throw new Error("wrangler.jsonc has no vars.VITE_CLERK_PUBLISHABLE_KEY.");
  if (!key.startsWith("pk_live_")) {
    throw new Error(
      `wrangler.jsonc holds a non-production Clerk key (${key.slice(0, 12)}…). ` +
        "Production must serve a pk_live key.",
    );
  }
  return key;
}

function convex(args) {
  return execFileSync("npx", ["convex", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readDeployedIssuer() {
  const line = convex(["env", "list"])
    .split("\n")
    .find((l) => l.startsWith("CLERK_JWT_ISSUER_DOMAIN="));
  return line ? line.slice("CLERK_JWT_ISSUER_DOMAIN=".length).trim() : null;
}

const expected = issuerFromPublishableKey(readProductionPublishableKey());
const actual = readDeployedIssuer();

if (actual === expected) {
  console.log(`✔ Convex auth issuer is correct (${expected}).`);
  process.exit(0);
}

console.error(
  [
    "",
    "✖ Convex auth issuer drift — production writes are BROKEN.",
    "",
    `  deployment trusts : ${actual ?? "(unset)"}`,
    `  production issues : ${expected}`,
    "",
    "  Signed-in users' tokens will fail identity verification, so every",
    "  authenticated write is rejected. Onboarding will not complete.",
    "",
    "  Cause: `npx convex dev` derives this from VITE_CLERK_PUBLISHABLE_KEY.",
    "  Check that no local env file sets a pk_test_ key (see .env.local).",
    "",
  ].join("\n"),
);

if (!shouldFix) {
  console.error("  Re-run with --fix to repair, or: npm run convex:deploy\n");
  process.exit(1);
}

console.error(`  Repairing → ${expected}`);
convex(["env", "set", "CLERK_JWT_ISSUER_DOMAIN", expected]);

const repaired = readDeployedIssuer();
if (repaired !== expected) {
  console.error(`✖ Repair failed; deployment still trusts ${repaired ?? "(unset)"}.\n`);
  process.exit(1);
}
console.log(`✔ Repaired. Convex auth issuer is now ${expected}.\n`);
