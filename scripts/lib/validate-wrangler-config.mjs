import { readFileSync } from "node:fs";

// These are exactly vite.config.ts's INLINED_AT_BUILD list. All three are genuinely
// consumed from wrangler.jsonc's "vars" — vite.config.ts falls back to it whenever
// .env doesn't supply a value, which is always true in CI (no .env is ever checked
// out there) and true for the deploy job's build step specifically (only
// CONVEX_DEPLOY_KEY is set on that step's env — nothing supplies these VITE_* vars
// any other way). A placeholder here is not caught by vite.config.ts's own guard,
// since a placeholder is a non-empty string and that guard only fails on missing
// values — it would bake the placeholder into the bundle and ship it. That gap is
// exactly what this validator exists to close; do not narrow this list without
// re-checking vite.config.ts's fallback behavior first.
export const requiredWranglerVars = ["VITE_CONVEX_URL", "VITE_CLERK_PUBLISHABLE_KEY", "VITE_TURNSTILE_SITE_KEY"];
export const placeholderFragments = ["your-project", "your-clerk-publishable-key", "1x00000000000000000000AA"];

export function readWranglerConfig(configUrl = new URL("../../wrangler.jsonc", import.meta.url)) {
  return JSON.parse(readFileSync(configUrl, "utf8"));
}

export function invalidRequiredVars(config) {
  return requiredWranglerVars.filter((name) => {
    const value = config.vars?.[name];
    return typeof value !== "string" || !value || placeholderFragments.some((part) => value.includes(part));
  });
}

export function validateWranglerConfig(config = readWranglerConfig()) {
  const invalid = invalidRequiredVars(config);
  if (invalid.length === 0) return;

  throw new Error(
    `Configure ${invalid.join(", ")} in wrangler.jsonc before deploying to Cloudflare.`,
  );
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try {
    validateWranglerConfig();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
