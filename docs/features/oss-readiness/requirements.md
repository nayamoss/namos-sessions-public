# Open-Source Readiness — Requirements

## Why

This repo (Takumi Talks) is going to be submitted/published as an open-source project. Before
the GitHub repo flips from private to public, it needs a deliberate readiness pass. This is not
a feature — it's a release gate. Nothing here should touch runtime behavior.

## Source of truth

Full findings from a read-only repo audit (git history + working tree) are captured below. Two
items are release blockers; everything else is should-fix or nice-to-have and can land before or
shortly after the flip, at the owner's discretion.

## Blockers (must fix before the repo is made public)

### B1. Env-var admin allowlist in `functions/api/data.ts`

`requireAdmin()` (functions/api/data.ts:32-48) verifies the Clerk session server-side, then
authorizes against `AIRTABLE_ADMIN_USER_IDS`, a comma-separated env var — not a database check.
This is a standing security anti-pattern regardless of open-source status.

- The rest of the codebase already does this correctly: an `organizers` table +
  `isCurrentUserOrganizer` / `requireOrganizer`, used in `convex/organizers.ts`,
  `convex/emailDelivery.ts`, `convex/apiKeysActions.ts`, `src/data/repo.ts`, `src/data/transport.ts`,
  `src/data/convex/index.ts`.
- Commit `e550d6d` already did this exact migration for the legacy email-delivery handler
  (removed an equivalent `EVENT_ADMIN_USER_IDS` env allowlist, replaced with the `organizers`
  table, called it a security fix in the commit message). `functions/api/data.ts` was never
  migrated to match — this is unfinished cleanup, not a considered design choice.
- `src/test/email-integration-auth.test.ts:25,30` already references the removed
  `EVENT_ADMIN_USER_IDS` pattern as the anti-pattern to avoid, confirming the team's own
  intent.

**Fix**: replace the `AIRTABLE_ADMIN_USER_IDS` check in `functions/api/data.ts` with an
`organizers`-table lookup, following the same shape as the Convex implementation
already in this repo. Then remove `AIRTABLE_ADMIN_USER_IDS` from `.env.example` and from
`README.md` (currently documented at README.md:11,16 as intentional — it isn't; update the
docs to describe the organizers-table check instead). Update `src/test/airtable-auth.test.ts:12`
accordingly.

### B2. Internal / cross-project / competition content tracked in git

Two categories, both need to leave the repo before it's public, and both are in git **history**,
not just the working tree — see "History handling" below.

**Content from a different, unrelated project** (stray, tracked):
- `FIXES.md` — entirely about "Kanrei," an unrelated compliance-controls app. Traces back to
  commit `fa09cc6` ("fork kanrei design system as starter"). Delete outright.

**Internal hackathon/competition planning material**, never meant to be public:
- `TODO.md` — private repo name, a live preview URL, two Convex deployment slugs, references to
  "Naya" providing production Clerk keys, internal agent-tooling notes.
- `AGENTS.md` — names the competition, prize amount ($10,000), deadline.
- `docs/CONTEXT.md` — competition host's identity, private Discord invite link, Luma event link,
  private Google Doc ID, pricing intel the host received.
- `docs/HANDOFF.md` — agent-onboarding doc addressed personally to Naya, deadline countdown.
- `docs/ROADMAP.md`, `docs/DELIVERY_CHECKLIST.md`, `docs/THINGS_TO_THINK_ABOUT.md`,
  `docs/SESSIONBOARD_SCREEN_INVENTORY.md`, `docs/UI-INVENTORY.md`, `docs/COMPONENT-AUDIT.md`,
  `docs/DESIGN-AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/PAGES.md`, `docs/DESIGN-SYSTEM.md`,
  `docs/README.md` — internal build-tracking docs written for the competition, not for external
  contributors.
- `docs/source/competition-brief-with-screenshots.pdf` — the competition host's own brief
  document; not ours to redistribute.
- `README.md:3` — public README currently opens with "Conference program management for the
  Kill My SaaS competition." Needs to describe the project on its own terms.

**Judgment calls, not blockers**: `docs/research/*.md` (competitor pricing/strategy research —
may be fine to keep as engineering research, needs an explicit yes/no from the owner) and
`PRODUCT.md` (legitimate product doc, but names Sessionboard directly in an "Anti-references"
section — reword or keep, owner's call).

**History handling — decide before executing**: deleting these files in a new commit does *not*
remove them from a public repo's history; anyone can `git log -p` an old commit and read them.
Two options:
1. Rewrite history (`git filter-repo` to strip the files entirely) before flipping visibility.
2. Publish as a fresh initial commit / new repo with clean history, instead of pushing this
   branch's full history public.
Either way this must happen *before* `public` is toggled, not after — a rewritten-but-once-public
repo should be treated as if the content is still exposed.

## Should-fix (do before or shortly after going public)

- Add `SECURITY.md` — especially relevant given B1; needs a security contact/reporting process
  before external eyes are on this code.
- Add `CONTRIBUTING.md`.
- Add `.github/workflows/` CI (lint/test/build) — none exists today; external contributors expect
  PR checks.
- Cloudflare is the standing platform decision: new backend work goes through Convex `httpAction`s
  or Cloudflare Workers/Pages Functions. Keep deployment documentation aligned with
  `wrangler.jsonc` so contributors do not infer the wrong target.
- Fix `.env.example` gaps found in the audit:
  - Missing, but used in code: `VITE_CONVEX_SITE_URL` (src/pages/public/ApiDocs.tsx:4),
    `CLERK_JWT_ISSUER_DOMAIN` (convex/auth.config.ts:4).
  - Present but unused/dead: `VITE_SENTRY_DSN` (.env.example:5) — either wire it up or drop it.
  - Remove `AIRTABLE_ADMIN_USER_IDS` once B1 lands.
- Rewrite `README.md` to drop competition framing (ties to B2) and reconcile documented env vars
  with the corrected `.env.example`.

## Nice-to-have

- `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`.
- Remove `.playwright-cli/*.yml` debug artifacts (accidentally committed Playwright accessibility
  dumps) and add `.playwright-cli/` to `.gitignore` (currently not ignored, unlike
  `.impeccable/`, `output/`, `test-artifacts/`, `.worktrees/`).
- `sk_live_...` placeholder strings in `docs/features/public-events-api/design.md:173` and
  `src/pages/public/ApiDocs.tsx:9,144` are this app's own API-key format, not real secrets — one
  is already annotated `// gitleaks:allow`; annotate the rest if gitleaks is enabled in CI so it
  doesn't false-positive forever.
- `package.json`: `"private": true` and `"version": "0.0.0"` — revisit for OSS packaging polish.

## Confirmed clean (no action needed)

- No real secrets/credentials anywhere in git history (full-history `gitleaks` scan + targeted
  pattern/pickaxe searches came back clean). Only `.env.example` was ever committed, and it holds
  clearly-labeled placeholders.
- `.gitignore` already correctly excludes all `.env*` variants.
- `package.json` dependencies are all standard public npm packages — no private registries or
  internal scoped packages to worry about for external contributors.
- The retired serverless configuration contained no hardcoded secrets or internal URLs.

## Out of scope for this plan

- Actually flipping the GitHub repo from private to public — owner action, happens only after
  the blockers above are resolved and history is handled.
- Any runtime/product feature work.
