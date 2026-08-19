# Sync namos-sessions-public from private main (RUN 6 — 2026-08-18)

## Why

Same recurring job as runs 1-5 (see git history of this file / PRs #14, #19, #21,
#27, #29, #32 on `namos-sessions-public`). Private `main` moved again since run 5's
PR #32 merged (`8333f41`) — most notably the developer platform packages
(`packages/cli`, `packages/mcp`, `packages/sdk`), `evals/operations-agent.v1.json`,
the Apple universal-links file, several `docs/features/*` content updates, and a
`.agents/skills/sync-to-public/SKILL.md` addition (this process's own skill doc).
PR: https://github.com/nayamoss/namos-sessions-public/pull/33, branch
`sync/private-main-delta-2026-08-18`, branched off public's tip at the time (`8333f41`).

## Findings this run — two intentional divergences confirmed, not synced

1. **`convex/publicFeeds.ts` + `src/test/public-feeds.test.ts` — public is AHEAD of
   private, not behind.** Verified by reading `publicFeedProjection()` in
   `convex/publicEmbeds.ts` (identical in both repos): it returns
   `{ event: { name, timezone }, sessions: [...], tracks, speakers }`. Public's
   `publicFeeds.ts` consumes `projection.event.name/timezone` and
   `projection.sessions` (typed `PublicFeedProjection`/`PublicFeedSession`) —
   matches reality. **Private main's copy still reads `projection.agenda`,
   `projection.eventName`, `projection.eventTimezone`, which don't exist on the
   real projection anymore — this is a live bug in private main's `getPublic`
   feed rendering.** Public's version was kept; private's was not synced over it.
   **Action needed in this repo (private), out of scope for the sync itself: fix
   `convex/publicFeeds.ts` to match the `publicEmbeds.ts` projection shape and
   update `src/test/public-feeds.test.ts` to match** (public's version is a
   ready-made reference for both).

2. **`src/test/component-canon.test.ts` — public carries an exemption private
   lacks.** Public's copy exempts `src/components/settings/IntegrationBrandIcon.tsx`
   from the no-hardcoded-hex-color rule (per-provider brand swatches — Notion
   black, Airtable yellow, etc. have no semantic-palette equivalent). The
   component file is identical in both repos and does use hardcoded hex colors,
   so private main's copy of this test is likely currently failing (or was never
   run) against its own `IntegrationBrandIcon.tsx`. Not fixed here — flagging for
   private main to pick up the same exemption from public's version.

## Seed data note

Private main's `convex/seed.ts` was rewritten with realistic-looking demo data —
an "AI.Engineer Sandbox Event — NYC" branded fixture, real companies as sponsor
fixtures (Convex, Resend), named sponsor contacts (Maya Chen, Theo Brooks, Sam
Rivera) — replacing the older generic `Example Conference Fixture` placeholders.
This was **not synced to public**: it resembles a real, recognizable conference
and real companies, which the sync's own no-real-seed-data rule exists to keep out
of the public mirror. Public's `seed.ts` still uses the older `Example`-branded
fixture. If the richer demo data is wanted in public too, it needs a genuinely
fictional rewrite (fake event name, fake sponsor names) first — not a direct port.

## Public-only commits — do not lose these (re-check yourself, this list grows)

Run `git log origin/main..public/main --oneline` in this repo yourself before
starting — do not trust this snapshot, it will have moved. As of writing (after
PR #33 merges, list grows further):
`sync/private-main-delta-2026-08-18 (PR #33), 8333f41, 1d10fec, c8530b7, 069f46c,
8c9d6ea, 80bd3a9, 25304f7, fc278f1, 73dda45, c201aee, 053fafb, d004564, c5e8234,
025d00e, 7dcf1ba, 2424417, 7603b13, 9e3f5e1, dd07c40, f186e90, 4e1df05`. Each is a
prior sync or a public-only safety/docs commit — their effects must survive future
syncs unchanged.

## Non-negotiable safety rules (same as every prior run — re-verify, don't assume)

1. **Never let a secret, credential, or internal-only value reach the public repo.**
   Explicitly check every file that changed since public's last sync for:
   - Clerk secret/publishable keys (`sk_live_`, `sk_test_`, `pk_live_`), JWT issuer
     domains pointing at the private Clerk instance (`clerk.namos-sessions.xyz`)
   - Convex deployment URLs/names not meant to be public
     (`pastel-mosquito-479.convex.*`, `calculating-loris-761`) — narrative mentions
     inside `docs/features/*` prose are an accepted pre-existing pattern in this
     repo (already present from prior runs), but they must never appear in
     runtime/config code paths like `worker/index.ts`'s CSP — those get the
     `clerk.your-project.example` / `your-project.convex.cloud` / `your-project.convex.site`
     placeholder substitution every run.
   - Any `.env`, `.env.local`, `.env.test`, `.env.development.local` file —
     never committed, in either repo
   - The maintainer's live custom domain in `wrangler.jsonc` (`routes`/`custom_domain`)
     — note `app.namos-sessions.xyz` itself (the live product URL) is already
     openly documented in `docs/deployment/one-click.md` and is not treated as
     secret; it's the Clerk/Convex *backend* domains that must never leak.
   - Any personal contact info beyond what's already deliberately public
   - **Any real seed/fixture data** in `convex/seed.ts` or similar — public's copy
     must use placeholder/example data only, never anything that could be a real
     event, speaker, submission, sponsor, or org record from the live product (see
     RUN 6 finding above — this bit private main this run)
   - `worker-configuration.d.ts` — always regenerate via
     `npx wrangler types worker-configuration.d.ts --env-interface Env --env-file wrangler.types.env`
     against **public's own** `wrangler.jsonc`, never copy private's generated file
2. **Never remove or weaken anything the public-only commits added**, including
   test exemptions and correctness fixes public has that private doesn't yet have
   (see findings above — check for this explicitly each run, not just line-level
   conflicts). Conflicts resolve in favor of public's existing safety/correctness
   version; everything else merges normally.
3. **PR against `namos-sessions-public` main, never a direct push** — that repo
   has branch protection requiring a PR + passing status checks anyway.
4. **Genuinely unsure whether something is safe to publish?** Leave it out and
   flag it explicitly in the PR description for human review — don't guess
   either direction.

## Acceptance criteria

- PR opened against `namos-sessions-public` main, branched off public's CURRENT
  main tip (re-check `git log -1` yourself, don't assume this doc's SHAs are current)
- Public's application code (`src/`, `convex/`, `worker/`, `docs/features/`,
  `packages/`) matches private main's tip **except**: intentionally-different
  OSS-identity files (README, CONTRIBUTING, SECURITY, GOVERNANCE, SUPPORT,
  `.github/*`, deploy configs like `wrangler.jsonc`/`netlify.toml`/`vercel.json`)
  stay as public's own versions, and any file where public has independently
  fixed/improved on private (check `publicFeeds.ts`-style divergences every run,
  don't assume private is always the source of truth for every single file)
- Explicit written confirmation in the PR description that you grepped the full
  diff for `sk_live_`, `sk_test_`, `pk_live_`, real Convex deployment names, and
  real seed data, and found nothing that shouldn't be there (or listed exactly
  what you redacted)
- All public-only safety commits' effects still present after the sync
- Public repo's own CI/tests pass on the PR branch
