# Sync namos-sessions-public from private main (RUN 11 — 2026-08-21)

## Why

Recurring job, requested explicitly. Private `main` moved past run 10's
boundary (`91b9413a`) to its current tip `271b9cb9` — most notably the
cross-event Speaker CRM/Contacts feature (org-wide `crm_contacts` +
`crm_event_contacts`, duplicate-merge handling, organization contact pane,
inbound-email-driven CRM updates via Resend/SES), the Settings modal
size/duplicate-header/Timezone-input fixes from earlier today, and assorted
worker refactors (CSP derivation moved into `security-headers.ts`, a new
`request-router.ts` extracted from `worker/index.ts`).

Branch `sync/private-main-delta-2026-08-21`, based on public's current `main`
tip at the time (`07779fb`, which already includes run 10 (PR #43) and a
small unrelated same-day WIP commit to `ApiDocs.tsx` — see below).

## What this run did

Ported the full `src/`, `convex/`, `worker/`, `docs/features/` delta between
public's run-10 boundary and private main's current tip (`271b9cb9`), via
whole-file checkout from a `private-webapp` git remote pointed at the local
private checkout (not a fresh clone), then scrubbed. 64 files changed net
(some public-only exclusions below reduce the raw private diff's file count).

## Public-only work preserved, not overwritten

**`src/pages/public/ApiDocs.tsx`** — public's `main` had a same-day WIP commit
(`07779fb`, "wip: save in-progress changes before agent work (#45)") adding an
entire "Agent-first (MCP)" documentation section (MCP client config example,
capabilities table, nav entry) that private does **not** have — this is
genuinely public-only content, not something to sync over. A blind
`checkout private-webapp/main -- ApiDocs.tsx` would have silently deleted it.
Caught by diffing `origin/main`'s history for anything past the last known
sync boundary before starting, per SKILL.md step 2 — found the one commit in
that range, confirmed via `grep -c "mcpConfig" <(git show private-webapp/main:...)`
that private's copy has zero trace of it, then re-applied that commit's exact
diff on top of the synced file with `git apply --3way` (applied cleanly, no
conflicts). Typecheck and build both clean afterward.

## Excluded from this sync — private-only test/asset dependencies

Two new private test files were **not** ported, because they assert on files
that are legitimately private-only and correctly don't exist in public:

- `src/test/demo-media.test.ts` — asserts `public/demo/walkthrough.mp4` (a
  real recorded product walkthrough video) exists and is non-trivially sized.
  Passes on private (the asset is committed there); would permanently fail on
  public since the video isn't (and per the seed-data/real-content scrubbing
  principle, arguably shouldn't be) part of the OSS mirror.
- `src/test/release-closeout-contract.test.ts` — asserts `wrangler.preview.jsonc`
  exists, a deploy config. Per SKILL.md step 3, deploy configs stay as
  public's own version; public doesn't have (and doesn't need) private's
  preview-deploy setup. Would permanently fail on public for the same reason.

If either of these should exist in some form on public later (a public-safe
walkthrough video, a public preview-deploy config), that's a deliberate
follow-up decision, not something to force through a routine sync.

## Pre-existing private-main test failures — synced as-is, not this run's job to fix

Private `main` currently fails **4 test files / 11 tests** in its own working
tree, verified directly against `private-webapp/main` before assuming these
were sync artifacts:

- `src/test/table-canon.test.ts` + `src/test/component-canon.test.ts` — both
  flag `pages/settings/AgentUsage.tsx` for a raw `<table>`/non-canonical-card
  violation. Same file, same violation, on private's own `main`.
- `src/test/app-layout.test.tsx` — 6 failing assertions (page-header
  button/input contamination, one throws `multiple <ClerkProvider>` — a test
  setup issue, not application code) — all reproduce on private `main`
  directly, unrelated to this sync.
- `src/test/control-sizing.test.tsx` — 3 failures expecting `src/index.css` to
  contain `font-size: 100%` etc.; that content is currently missing from
  private's own `src/index.css` too.

None of these are new — confirmed by running the exact same test files
against `private-webapp/main` in isolation before writing this section, all
four fail identically there. Per SKILL.md's own precedent (run 6 flagged a
`publicFeeds.ts` bug the same way), this sync mirrors private's actual
current state rather than silently fixing private's application bugs as a
side effect of a routine sync — **flagging here for private main to pick up**,
not fixed in this PR.

## Scrub performed

Full `git diff --cached` grepped for `sk_live_`, `sk_test_`, `pk_live_`,
`calculating-loris-761`, `pastel-mosquito-479`, `clerk.namos-sessions.xyz`,
plus the maintainer's personal email/domain strings — zero matches after two
fixes:

- `convex/auth.config.ts` and `worker/security-headers.ts` both hardcoded
  `https://clerk.namos-sessions.xyz` as a fallback origin (only reached if
  `CLERK_JWT_ISSUER_DOMAIN`/`CLERK_FRONTEND_API_URL` env vars are unset) —
  substituted to `https://clerk.your-project.example`, matching this repo's
  existing `your-project` placeholder convention.
- `worker/security-headers.test.ts`'s new fixture literally used
  `calculating-loris-761`/`pastel-mosquito-479` as example Convex deployment
  names in test assertions — substituted to `wandering-squid-391` (matching
  this repo's existing fake-deployment-name convention already used
  elsewhere in this same test file) and `drifting-otter-204` respectively.

`convex/seed.ts` was **not** synced — reverted back to public's own existing
placeholder (`Example Conference Fixture`) version after the initial blanket
checkout pulled in private's real-looking `AI.Engineer Sandbox Event — NYC`
fixture (real company names as sponsors, named contacts). Same finding as run
6; still not safe to publish as-is.

`worker-configuration.d.ts` was not touched — not in this run's file delta
(no new Wrangler binding/env var reached the generated-types boundary this
time; `worker/secrets.d.ts`'s new `interface Env` entries are hand-written
type declarations only, no values, and were synced normally).

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 834/845 passing; the 11 failures are the pre-existing
  private-main failures documented above, not introduced by this sync
- `npm run build` — succeeds

## Public-only commits — do not lose these (re-check yourself, this list grows)

Run `git log origin/main..public/main --oneline` yourself before starting the
next sync — this snapshot will have moved by then. As of this run (after this
PR merges): everything from run 10 (PR #43) and earlier
(`sync/private-main-delta-2026-08-20-run10`, `e0f3647`, `30a5e3b`, `8241862`,
`9cfccb5`, `5901360`, `d7a61fe`, `81d087c`, `05d52e3`, `8333f41`, and further
back), plus `07779fb` (the ApiDocs.tsx MCP section, preserved by this run —
see above), plus this run's own commit.
