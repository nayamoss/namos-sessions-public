# Publish the Cloudflare Worker (CFP edge) to namos-sessions-public

## Why

Two consecutive automated sync runs (PRs #19 and #21 against namos-sessions-public)
excluded `worker/` entirely, describing it as containing "live Clerk/Convex/Sentry
endpoints" — treating the whole directory as unsafe to publish. Actually reading the
source (2026-08-17) shows that assumption was too conservative:

- `worker/index.ts` (62 lines): the only literal domain values are inside a
  Content-Security-Policy header string — `clerk.namos-sessions.xyz`,
  `pastel-mosquito-479.convex.cloud`, a Sentry ingest URL. These are sent to every
  visitor's browser on every page load already; they are not secret, they're public
  by construction (a CSP header is inherently client-visible).
- `worker/public-cfp.ts` (282 lines): all sensitive values — `CFP_EDGE_SECRET`,
  `CFP_RATE_LIMIT_KEY_SECRET`, `TURNSTILE_SECRET_KEY` — are read via `env.*` Cloudflare
  secret bindings, never hardcoded. Grep confirms zero literal secret values in source.
- `worker/secrets.d.ts` (5 lines): just TypeScript type declarations naming the three
  secret bindings above. No values.
- The real barrier is entirely in `wrangler.jsonc`'s `vars` block and `routes`
  (custom domain) — and the public repo **already has an established, working
  redaction pattern for exactly this**, from commit `9e3f5e1` ("remove maintainer's
  live custom domain from public wrangler config"): public's current `wrangler.jsonc`
  already ships `VITE_CONVEX_URL: "https://your-project.convex.cloud"` and
  `VITE_CLERK_PUBLISHABLE_KEY: "pk_test_your-clerk-publishable-key"` as placeholders.
  It has no `main` field yet (serves assets only, no Worker), no Durable Object
  binding, and none of the CFP rate-limit/Turnstile vars.

Net finding: this is a **modest, well-scoped task**, not the open-ended "introduce a
public-safe Worker configuration layer" project both Codex sync runs flagged for
review. It's closer to a few hours of careful, verifiable work.

## Scope

1. Copy `worker/index.ts`, `worker/public-cfp.ts`, `worker/secrets.d.ts` to the public
   repo as-is — no code redaction needed, only verified above to contain zero literal
   secrets. Re-verify this claim at execution time (grep for secret-shaped strings)
   rather than trusting this doc blindly, in case the files changed since this was
   written.
2. Extend public's `wrangler.jsonc`:
   - Add `"main": "worker/index.ts"`
   - Add the `CfpRateLimiter` Durable Object binding + migration block (copy as-is,
     it's just a class name, not a secret)
   - Add placeholder entries for the vars currently missing: `VITE_TURNSTILE_SITE_KEY`,
     `CONVEX_SITE_URL`, `TURNSTILE_ALLOWED_HOSTNAMES`, `TURNSTILE_EXPECTED_ACTION`,
     `TURNSTILE_TEST_MODE`, and the six `CFP_RATE_LIMIT_*` values — follow the exact
     placeholder style already established (`your-project.convex.cloud`,
     `pk_test_your-clerk-publishable-key`), not real values. `TURNSTILE_TEST_MODE`
     should default to `"true"` in the public template so a fresh self-host doesn't
     silently fail CAPTCHA verification with no site configured.
   - Do NOT add `routes`/`custom_domain` — that stays private-only, matching the
     existing precedent.
3. Add `.env.example`-style documentation (or extend whatever public's existing setup
   docs are — check `docs/` and `README.md` for the established pattern from the
   one-click-deploy work in commit `7603b13`) explaining that a self-hoster must run
   `wrangler secret put CFP_EDGE_SECRET`, `wrangler secret put CFP_RATE_LIMIT_KEY_SECRET`,
   and `wrangler secret put TURNSTILE_SECRET_KEY` themselves — these three are never
   in any file, by design, and that doesn't change here.
4. Update the private repo's sync tooling (`docs/features/public-repo-sync/`) so
   future sync runs stop excluding `worker/` wholesale — it should sync normally like
   any other source directory, since it's no longer an exception.

## Non-negotiable safety rules

1. **Grep the actual files at execution time for secret-shaped strings** before
   copying anything — API keys, JWTs, anything matching common secret patterns
   (`sk_`, `whsec_`, hex strings 32+ chars in a suspicious context) — don't rely
   solely on this doc's "already verified clean" claim, which could be stale.
2. **Never copy `routes`/`custom_domain` or any literal `app.namos-sessions.xyz`
   reference** — that identifies the live production instance and stays private,
   same as the existing wrangler.jsonc precedent.
3. **Run gitleaks against the staged diff** before pushing, same as both prior sync
   runs did.
4. **If genuinely unsure whether a value is safe to publish, exclude it and flag it**
   rather than guessing — same rule as every prior sync task in this repo.

## Acceptance criteria

- `worker/index.ts`, `worker/public-cfp.ts`, `worker/secrets.d.ts` exist in
  namos-sessions-public, byte-identical to private's version (or with only the CSP
  domain literals swapped for placeholders, if that's the safer call at execution
  time — decide and document which, don't do both inconsistently)
- Public's `wrangler.jsonc` has a complete, placeholder-only `vars` block covering
  every var the Worker actually reads, a working DO binding, and `main` wired up
  — a fresh self-hoster following the existing one-click-deploy docs can `wrangler
  deploy` this without editing code, only filling in their own secrets/vars
- No live production domain, no real Convex project slug, no real secret value
  anywhere in the change
- Documentation tells a self-hoster exactly which three secrets to
  `wrangler secret put` and why
- Gitleaks clean on the staged diff
- A PR is opened against namos-sessions-public's main (never a direct push) with a
  description covering what was added and why it's safe
- `docs/features/public-repo-sync/requirements.md` (this repo) is updated to remove
  the blanket `worker/` exclusion for future sync runs
