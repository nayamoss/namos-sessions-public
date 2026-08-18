# Open-Source Readiness — Implementation Plan

See `requirements.md` in this folder for the full findings and rationale. This plan is written
for an implementing agent with no prior context — exact files, exact actions, explicit stop
conditions.

## Step 0 — History handling: DECIDED, Option B

Owner decision (2026-08-13): **publish to a brand-new empty repo with a single fresh commit**,
no history carried over from this repo. Faster and lower-risk than a `git filter-repo` rewrite +
force-push under time pressure — no chance of missing a file in the rewrite, nothing to babysit.

Mechanically: once Steps 1-2 are merged into this repo and `npm run check` passes, create a new
GitHub repo named **`namos-sessions-public`**, copy the working tree at that commit (not
`.git`), `git init` fresh, one commit, push, make *that* repo public. This repo
(`namos-sessions-webapp`) stays private/internal.

**Do not create or push to `namos-sessions-public` before Steps 1-2 are merged and verified.**
Creating it early would publish the still-present admin-allowlist bug and the internal
TODO.md/CONTEXT.md content this plan exists to remove — defeats the purpose. Steps 1-2 first,
then the new repo, in that order, no exceptions.

### Repo relationship (owner decision, 2026-08-13)

- `namos-sessions-webapp` — the main, private repo. This is where all ongoing development
  continues to happen; nothing about that changes.
- `namos-sessions-public` — a **one-time snapshot** publish for the open-source submission, not
  an ongoing mirror. No sync script, no CI job to keep it updated. It's created once, from the
  post-fix commit, and that's it — future work in `namos-sessions-webapp` does not need to be
  ported over automatically.
- The submission itself will reference **both repo names** — `namos-sessions-webapp` as the
  private main development repo, `namos-sessions-public` as the public open-source release.
  Phrase it in the submission roughly as: "core development happens in a private repo; this is
  the public release/mirror prepared for open source." No further repo-relationship tooling is
  needed beyond that framing — this is a documentation point for the submission form, not a code
  task.

## Step 1 — Remove blocker content (B2)

Delete, in a single commit (or squashed per Step 0's approach):

```
FIXES.md
TODO.md
AGENTS.md
docs/CONTEXT.md
docs/HANDOFF.md
docs/ROADMAP.md
docs/DELIVERY_CHECKLIST.md
docs/THINGS_TO_THINK_ABOUT.md
docs/SESSIONBOARD_SCREEN_INVENTORY.md
docs/source/competition-brief-with-screenshots.pdf
```

Owner decision (2026-08-13): **leave these as-is, do not delete or reword**:
```
docs/research/competitors.md
docs/research/architecture-patterns.md
docs/research/code-reuse.md
docs/research/customer-complaints.md
PRODUCT.md
```

Review the remaining `docs/*.md` not listed above (`docs/UI-INVENTORY.md`,
`docs/COMPONENT-AUDIT.md`, `docs/DESIGN-AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/PAGES.md`,
`docs/DESIGN-SYSTEM.md`, `docs/README.md`) — audit flagged these as internal-hackathon-flavored;
either rewrite for a general OSS audience or delete. Use judgment per file; if a doc is genuinely
useful engineering documentation once the competition references are stripped, keep it edited
rather than deleted.

## Step 2 — Fix the admin allowlist (B1)

In `functions/api/data.ts`:
1. Replace the `AIRTABLE_ADMIN_USER_IDS` env-var check inside `requireAdmin()` (lines ~32-48)
   with a database-backed `organizers`-table lookup. Match the pattern already used in
   `convex/organizers.ts` (`isCurrentUserOrganizer` / `requireOrganizer`). The platform decision
   is Cloudflare; new backend work goes through Convex `httpAction`s or Cloudflare Workers/Pages
   Functions. Since `functions/api/data.ts`
   is already a Cloudflare Pages Function, have it call the Convex deployment directly (a Convex
   `httpAction` or query it can reach) to check organizer status — the call shape should be
   Convex-native, not copied from a legacy serverless handler.
2. Remove `AIRTABLE_ADMIN_USER_IDS` from `.env.example`.
3. Update `README.md:11,16` — replace the "explicit server-side event-admin allowlist" language
   with a description of the organizers-table check.
4. Update `src/test/airtable-auth.test.ts:12` to test the new organizer-table check instead of
   the env var.

Run `npm run typecheck && npm run test` after this change — do not consider it done until both
pass.

## Step 3 — README rewrite

Edit `README.md`:
- Line 3: remove "for the Kill My SaaS competition" — describe the project as a standalone
  conference program management tool.
- Reconcile the "Data backends" section with Step 2's changes (no more admin-allowlist language).
- Add the missing env vars found in the audit: `VITE_CONVEX_SITE_URL`, `CLERK_JWT_ISSUER_DOMAIN`.
- If the README links to a live/demo instance, point it at the real deploy domains —
  `namos-sessions.xyz` (marketing) and `app.your-project.example` (app login) — not a provider
  preview URL. Only add these links once those domains are actually live; don't reference a URL
  that 404s.

## Step 4 — `.env.example` fixes

- Add `VITE_CONVEX_SITE_URL` and `CLERK_JWT_ISSUER_DOMAIN` (used in code, currently undocumented).
- Either wire up `VITE_SENTRY_DSN` for real, or remove it — it's currently a dead placeholder.
- Remove `AIRTABLE_ADMIN_USER_IDS` (tied to Step 2).

## Step 5 — Should-fix hygiene

- Add `SECURITY.md` with a real reporting contact/process.
- Add `CONTRIBUTING.md` (install steps already exist in README — point to them, add PR/branch
  conventions).
- Add `.github/workflows/ci.yml` running `npm run typecheck`, `npm run test`, `npm run build`
  (mirrors the existing `npm run check` script) on PRs.

## Step 6 — Nice-to-have cleanup

- Remove `.playwright-cli/page-2026-08-10T12-39-42-661Z.yml` and
  `.playwright-cli/page-2026-08-10T12-39-58-228Z.yml` from git; add `.playwright-cli/` to
  `.gitignore` next to the existing `.impeccable/`, `output/`, `test-artifacts/`, `.worktrees/`
  entries.
- Optional: `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`.

## Hard stop conditions

- Do not toggle *this* repo's (`namos-sessions-webapp`) GitHub visibility to public — it stays
  private. The new fresh-history repo created in Step 0 is the one that goes public, and creating/
  publishing that new repo is still an owner action to confirm before it's made public, even
  though the history-handling *approach* is now decided.
- Do not touch `docs/research/*.md` or `PRODUCT.md` — owner decision is to leave them as-is.
- Do not touch anything not listed in this plan (no unrelated refactors).

## Definition of done for this plan

- Steps 1 and 2 (both blockers) merged into this repo.
- `npm run check` passes.
- Fresh repo created per Step 0, working tree copied at the post-fix commit, single clean
  initial commit — ready for the owner to flip to public.
- Report back explicitly which of Steps 3-6 were completed vs. deferred — don't mark this done
  silently if should-fix/nice-to-have items were skipped for time.
