# Sync namos-sessions-public from private main (RUN 5 — 2026-08-17/18)

## Why

Same recurring job as runs 1-4 (see git history of this file / PRs #14, #19, #21,
#27, #29 on `namos-sessions-public`). Private `main` moved again since run 4's PR #29
merged (`c8530b7`) — most notably the `improvement/234-form-builder-page-model`
merge (CRM, AI assessments, comms inbox, public feeds, shared public form renderer)
and a robots.txt SEO fix (`#30`, already synced). Naya's explicit ask this run:
**the two repos' application code should end up exactly the same, except public
has all real data and keys scrubbed.** Re-verify that scrubbing holds, not just
that the delta merges cleanly.

## Public-only commits — do not lose these (re-check yourself, this list grows)

Run `git log origin/main..public/main --oneline` in this repo yourself before
starting — do not trust this snapshot, it will have moved. As of writing:
`1d10fec, c8530b7, 069f46c, 8c9d6ea, 80bd3a9, 25304f7, fc278f1, 73dda45, c201aee,
053fafb, d004564, c5e8234, 025d00e, 7dcf1ba, 2424417, 7603b13, 9e3f5e1, dd07c40,
f186e90, 4e1df05`. Each is a prior sync or a public-only safety/docs commit —
their effects must survive this sync unchanged.

## Non-negotiable safety rules (same as every prior run — re-verify, don't assume)

1. **Never let a secret, credential, or internal-only value reach the public repo.**
   Explicitly check every file that changed since public's last sync for:
   - Clerk secret keys (`sk_live_`, `sk_test_`), JWT issuer domains pointing at
     the private Clerk instance (`clerk.namos-sessions.xyz`)
   - Convex deployment URLs/names not meant to be public
     (`pastel-mosquito-479.convex.*`, `calculating-loris-761`)
   - Any `.env`, `.env.local`, `.env.test`, `.env.development.local` file —
     never committed, in either repo
   - The maintainer's live custom domain in `wrangler.jsonc` (`routes`/`custom_domain`)
   - Any personal contact info beyond what's already deliberately public
   - **Any real seed/fixture data** in `convex/seed.ts` or similar — public's copy
     must use placeholder/example data only, never anything that could be a real
     event, speaker, submission, or org record from the live product
2. **Never remove or weaken anything the public-only commits added.** Conflicts
   resolve in favor of public's existing safety/redaction version; everything
   else merges normally.
3. **PR against `namos-sessions-public` main, never a direct push** — that repo
   has branch protection requiring a PR + passing status checks anyway.
4. **Genuinely unsure whether something is safe to publish?** Leave it out and
   flag it explicitly in the PR description for human review — don't guess
   either direction.

## Acceptance criteria

- PR opened against `namos-sessions-public` main, branched off public's CURRENT
  main tip (re-check `git log -1` yourself, don't assume this doc's SHAs are current)
- Public's application code (`src/`, `convex/`, `worker/`, `docs/features/`) matches
  private main's tip **except**: intentionally-different OSS-identity files
  (README, CONTRIBUTING, SECURITY, GOVERNANCE, SUPPORT, `.github/*`, deploy
  configs like `wrangler.jsonc`/`netlify.toml`/`vercel.json`) stay as public's
  own versions — those are supposed to differ, do not overwrite them with private's
- Explicit written confirmation in the PR description that you grepped the full
  diff for `sk_live_`, `sk_test_`, real Convex deployment names, and real seed
  data, and found nothing that shouldn't be there (or listed exactly what you
  redacted)
- All public-only safety commits' effects still present after the sync
- Public repo's own CI/tests pass on the PR branch
