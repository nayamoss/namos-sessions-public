# Sync namos-sessions-public from private main (RUN 9 — 2026-08-20)

## Why

Recurring job. Private main had moved 107 commits past run 8's sync point
(`b3ffb2a`) to `edb57ea5` (13:27 ET). Public main was at `30a5e3b` (PR #38).
Branched `sync/private-main-run9-20260820` off public's current `main`.

## What this run did

Since the two repos have unrelated git histories (no merge-base), the sync
is done by diffing private's tip against the last-synced commit
(`git diff b3ffb2a..private-webapp/main`) and applying that as a patch onto
public's current tip, rather than a literal git rebase/merge.

Ported (256 files touched upstream; most applied cleanly as a patch, a
handful required full-file replacement or hand editing — see below):
- New Slack integration: `convex/slack*.ts` (client, HTTP handlers, OAuth,
  inbound/outbound notifications, security/verification), wired into
  `convex/http.ts`; `src/components/shared/SlackIntegrationForm.tsx`,
  `slack-manifest.example.yaml`, `docs/runbooks/slack-integration.md`
- Managed AI: `convex/managedAi.ts`, AI usage gating
  (`docs/features/ai-usage-gating/*`, `src/test/ai-usage-gating.test.ts`),
  `MANAGED_AI_DISABLED` kill-switch documented in `.env.example`
- Agent workspace UI: `src/components/agent/AgentWorkspace.tsx`,
  `convex/demoAgent.ts`, related tests
- Form builder / editor page consolidation: `src/components/shared/EditorPage.tsx`,
  `src/pages/portal/TaskEditorPage.tsx`, `src/test/form-pages.test.ts`,
  `src/test/portal-form-builder.test.tsx`
- Settings: `src/pages/settings/ReadinessSettings.tsx`,
  `src/test/settings-navigation.test.tsx`; WizardShell keyboard shortcuts
- ~15 new `docs/features/*` planning docs (ai-schedule-proposals,
  cfp-conditional-routing, review-rounds-scoring, speaker-communications-delivery,
  speaker-portal-readiness, kill-my-saas-brief, portal-resource-pages,
  demo-first-organizer-experience, accelevents/agenda-scheduling/public-embeds
  addenda) — plan-only docs, no code risk
- Broad `src/data/*`, `convex/*` data-layer updates across agenda/settings/
  speakers/CRM that rode along with the above features
- `worker/demo.ts` + `convex/demoWorkspaces.ts`: reworked demo-entry flow
  (role-aware redirects, a `public-entry` workspace-creation mode replacing
  the old judge-access-key gate). Required a matching structural addition to
  public's own `worker/index.ts` (bare `/demo` route now dispatches to
  `handleDemoRequest`, alongside the existing `/demo/schedule-studio` and
  `/api/demo/*` matches) and to `src/App.tsx` (`/demo` now redirects to a new
  `/demo/start` route, matching the Worker's new redirect target)
- `eslint.config.js`, `index.html` (noscript fallback), `vitest.config.ts`
  (worker/test concurrency limits), `package.json` (`@testing-library/dom`
  devDep only — see exclusions below)

**Excluded this run — flagged for explicit review, not silently dropped:**
1. **`JUDGE_DEMO_CLOSEOUT.md`, `design-qa.md`** — internal release/QA
   artifacts naming production Convex deployments
   (`pastel-mosquito-479`/`calculating-loris-761`), the production Clerk
   issuer, and a local machine filesystem path. Not application code; not
   safe or useful to publish.
2. **The "judge walkthrough video" feature**: `public/demo/walkthrough.mp4`
   (+poster/vtt/transcript), `src/lib/demo-proof.ts`'s new
   `readWalkthroughMedia`/`resolveProofDestination` exports and its test,
   `src/test/demo-media.test.ts`, and the `vite.config.ts` /
   `wrangler.jsonc` `VITE_DEMO_*` / `VITE_PUBLIC_EMBED_ORIGIN`
   required-at-build-time vars. Porting this would require adding those vars
   with real or placeholder values to public's own `wrangler.jsonc` (against
   the "deploy configs stay public's own" rule) and ships large binary media
   specific to a private production release event. `src/test/demo-proof.test.ts`
   reverted to public's existing version since it now imports the excluded
   exports.
3. **`src/pages/public/EmbedShowcasePage.tsx` + `src/test/embed-showcase.test.tsx`**
   — the showcase page hardcodes the slug `ai-engineer-sandbox-event`
   (real, recognizable event branding, same category flagged in RUN 6 for
   `convex/seed.ts`). Its `src/App.tsx` route (`/embeds`) and lazy import
   were removed to keep the build green. The underlying helper it used,
   `publicEmbedOrigin()` in `src/lib/public-embed.ts`, is a small
   safe-fallback addition with no hardcoded values — that one line **was**
   ported.
4. **`worker/security-headers.ts`/`.test.ts`, `worker/request-router.ts`/`.test.ts`,
   `worker/index.ts`'s CSP wiring, `convex/auth.config.ts`** — public
   independently rewrote its CSP builder (`createContentSecurityPolicy`,
   landed via PR #40) to derive every origin from env values with an
   explicit placeholder/format check and never emit a literal domain from
   source. Private's parallel version (also new since run 8, coincidentally
   similar naming) hardcodes `clerk.namos-sessions.xyz` and the Sentry
   ingest hostname directly in the CSP template string, and
   `convex/auth.config.ts` gained a fallback literally defaulting to
   `https://clerk.namos-sessions.xyz`. Kept public's existing, safer
   versions — same "public is ahead, not behind" situation as the
   `publicFeeds.ts` divergence from RUN 6.
5. **`scripts/recapture-audit.mjs` + `scripts/lib/recapture-audit*`,
   `@playwright/test` devDep, `audit:recapture` npm script** — a QA tool
   hardcoded to hit `https://app.namos-sessions.xyz` production and drive
   the deployed judge demo; not generic app code.
6. **`docs/deployment/production.md`** — public already maintains its own
   deploy doc under a different name (`docs/deployment/one-click.md`);
   left as public's own, not overwritten.
7. **`src/test/security-response-headers.test.ts`** — tests the excluded
   `worker/security-headers.ts` rewrite directly; public's existing test
   already covers its own (kept) implementation correctly, left untouched.

**Caught and fixed one regression risk before it landed:** private's
`src/pages/portal/PortalPages.tsx` and `src/pages/portal/portal-data.ts`
predate `b3ffb2a` (no diff between b3ffb2a and private's tip for either
file) and still use `localStorage`-backed `loadPortalProfile`/
`savePortalProfile`. Public fixed this as a CodeQL finding in `fccf8f6`
("resolve CodeQL logo and profile alerts" — stop persisting sensitive
speaker profiles in browser storage), with a regression test
(`src/test/code-scanning-regressions.test.ts`) guarding it. An initial
full-file copy of `PortalPages.tsx` from private's tip (to resolve a
patch-apply conflict caused by public's own prior Prettier reformat)
silently reintroduced the vulnerable `portal-data.ts` API and failed that
regression test. Reverted both files to public's existing (patched)
versions; private's small, unrelated `useMemo` scope-memoization
improvement in the same file was not reapplied this run (low value, not
worth the risk of re-touching a security-sensitive file by hand under time
pressure — flagged here for a future run instead of silently dropped).

## Scrub performed

Grepped the full applied diff (`git diff --cached origin/main`, ~19,900
lines) for `sk_live_`, `sk_test_`, `pk_live_`, `pastel-mosquito-479`,
`calculating-loris-761`, `clerk.namos-sessions.xyz` — zero matches in the
final diff (all matches from the raw private delta were confined to the
excluded files above, or to `wrangler.jsonc`/`worker-configuration.d.ts`,
which were never touched). No `.env*` file besides `.env.example` (var
names/placeholders only, no values) was touched. `convex/seed.ts`'s change
is limited to adding generic embed-showcase fixture rows (Speaker gallery,
Schedule grid, etc.) with placeholder colors — no real event/sponsor/
speaker names. Grepped separately for the specific real names/event
flagged in RUN 6 (`Maya Chen`, `Theo Brooks`, `Sam Rivera`,
`AI.Engineer Sandbox`) — zero matches in the final diff.

## Divergences re-verified, not clobbered

- `convex/publicFeeds.ts` / `src/test/public-feeds.test.ts` — zero diff
  between b3ffb2a and private's tip; still reconciled, both repos identical.
- `src/test/component-canon.test.ts`'s `IntegrationBrandIcon.tsx` exemption
  (line 59) — still present after applying private's new, unrelated
  "unstriped table rows" test addition.
- `worker/security-headers.ts` CSP derivation and `convex/auth.config.ts`
  — newly identified this run (see exclusion #4 above), public's version
  kept.

## Verification

`npm run typecheck` clean (all 6 project references). `npm run lint`: 0
errors. `npm run test -- --run`: 776/776 passing (138/138 files) — includes
the CodeQL regression test that the PortalPages.tsx mistake above would
have broken had it not been caught before commit. `npm run build`:
succeeds (rolldown-vite, chunk-size warnings only, pre-existing pattern).
`worker-configuration.d.ts` and `wrangler.jsonc`: confirmed zero-diff
against `origin/main`, no regeneration needed (public's Worker vars/
bindings didn't change this run).

PR: (filled in after opening) against `namos-sessions-public` main, branch
`sync/private-main-run9-20260820`, branched off public's tip `30a5e3b`.

---

# Sync namos-sessions-public from private main (RUN 8 — 2026-08-19)

## Why

Requested explicitly: bring the Speaker CRM work (Contacts page, contact
stages/scores, lifecycle history, segments, event/speaker linking,
Airtable/Notion CRM sources, campaign sending, analytics), the Airtable
integration (Settings → Integrations import + Contacts workspace org CRM
sync), the expanded speaker detail workspace, and related
dashboard/agenda data-layer work over to public. This turned out to already
be in flight: PR #38 (`sync/private-main-delta-2026-08-19`) had been opened
earlier in the same day by a prior session, branched off public's tip at the
time (`5901360`), and its file list already covered exactly this feature
set (`convex/crm.ts`, `crmSourceActions.ts`, `crmSources.ts`, `crons.ts`,
`taskTemplates.ts`; `src/pages/program/Contacts.tsx` + tests;
`Speakers.tsx`, `Agenda.tsx`, `EventAnalytics.tsx` and the `src/data/*`
data-layer updates). Run 7 (PR #34) had already landed on `main` the same
day and was never logged in this doc — noting it here retroactively too.

This run finished and finalized PR #38 rather than opening a duplicate PR
(see the "second concurrent sync" guidance in `SKILL.md` step 8) — a
redundant second PR against the same delta would only create merge
conflicts with no added value.

## What this run did

Public's `main` had moved past PR #38's branch point in the meantime (PR
#39 dompurify fix, PR #40 CSP-derivation-from-runtime-config refactor). Refetched
`origin/main` and `private-webapp/main`, confirmed private's tip
(`b3ffb2a`) had no new application-code delta beyond what PR #38 already
carried (its only new commit was a docs-only entry logging PR #38 itself
in private's own copy of this file). Rebased PR #38's branch onto public's
current `main` (`8241862`); one conflict in `worker/index.ts` between PR
#40's new `security-headers.ts`-based CSP structure and PR #38's addition
of the `/demo/schedule-studio` route to the demo-request match — resolved
by keeping PR #40's structure and re-adding the route match on top.

Re-ran the full scrub (`git diff origin/main...HEAD` grepped for
`sk_live_`, `sk_test_`, `pk_live_`, `pastel-mosquito-479`,
`calculating-loris-761`, `clerk.namos-sessions.xyz` — zero matches; no
`.env*` files touched; `convex/seed.ts`, `wrangler.jsonc`, `netlify.toml`,
`README.md`, `worker-configuration.d.ts` all confirmed zero-diff against
`origin/main`). Spot-checked `convex/crm.ts`, `src/pages/program/Contacts.tsx`,
`convex/crmSourceActions.ts` byte-for-byte against private's copies —
identical. Re-ran verification on the rebased branch: `typecheck` clean,
`lint` 0 errors (35 pre-existing warnings), `test` 711/711 passing
(125/125 files), `build` succeeds.

PR: https://github.com/nayamoss/namos-sessions-public/pull/38, branch
`sync/private-main-delta-2026-08-19`, now rebased onto public's tip
`8241862`.

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
