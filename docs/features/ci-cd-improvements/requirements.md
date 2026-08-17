# CI/CD Automation — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-16

## Problem Statement

Releases are manual, unrecorded, and non-atomic.

`npm run deploy` runs `scripts/deploy-cloudflare.mjs` from a developer's laptop. It builds the
**working tree**, not a commit — the script carries an explicit clean-tree guard with a comment
saying that shipping another session's half-finished edits has already happened once. The
Convex backend deploys through an entirely separate manual path, so nothing couples the two.

That coupling gap caused a real outage window on 2026-08-16. The multi-tenancy change altered
the Convex function contract (functions removed, signatures changed) and added authorization
guards that deny by default until a data migration runs. The backend went live before the
matching frontend, so for a period the deployed app was calling functions that no longer
existed. Two separate manual steps made that window minutes long; it should have been seconds.

There is also no record of releases. Nobody can answer "what commit is in production, who put
it there, and did a migration run with it" from anything other than memory.

Two smaller gaps compound it: CI runs `typecheck`, `test`, and `build` but not `lint` or
`check:worker-types`, both of which exist as scripts. And there is no branch protection — the
repository is private on a plan where GitHub returns 403 for the branch-protection API — so CI
is advisory. Several agents push directly to `main`.

## User Stories

**As the person releasing,** I want to trigger one workflow **so that** the backend, any
migration, and the frontend go out together rather than as three commands I have to sequence
correctly under pressure.

**Acceptance Criteria:**
- GIVEN a commit on `main`, WHEN I trigger the deploy workflow, THEN Convex is deployed, any
  named migration runs, and the Worker is deployed — in that order, in one run.
- GIVEN the workflow is running, WHEN a second run is triggered, THEN it queues rather than
  interleaving with the first.
- GIVEN a deploy has completed, WHEN I open the Actions run, THEN I can see the commit, the
  actor, the target deployment, and whether a migration ran.

**As a reviewer,** I want CI to fail on lint and worker-type errors **so that** those do not
reach `main` and surface later as a broken deploy.

**Acceptance Criteria:**
- GIVEN a PR with an ESLint error, WHEN CI runs, THEN the check fails.
- GIVEN a PR whose worker bindings no longer match `worker-configuration.d.ts`, WHEN CI runs,
  THEN the check fails.

## Functional Requirements

- FR-001: A `workflow_dispatch`-only deploy workflow. It must never trigger on `push`.
- FR-002: Order is Convex deploy → migration → Cloudflare deploy, in a single job.
- FR-003: The migration step takes a function name as an optional input. Blank means skip.
- FR-004: A `concurrency` group prevents overlapping deploys.
- FR-005: A confirmation input the operator must type, so the workflow cannot be launched by a
  stray click.
- FR-006: The run summary records commit SHA, actor, target Convex deployment, and whether a
  migration ran.
- FR-007: `npm run lint` and `npm run check:worker-types` are added to `.github/workflows/ci.yml`.
- FR-008: Secrets are referenced only via `secrets.*` and never echoed.

## Non-Functional Requirements

- NFR-001: No secret value may appear in workflow logs, including on failure.
- NFR-002: The Convex deploy key must be scoped to `deployment:deploy` only.
- NFR-003: The Cloudflare API token must be scoped to Edit Cloudflare Workers only.
- NFR-004: `scripts/deploy-cloudflare.mjs` keeps working as the local escape hatch. The
  workflow is the normal path, not the only one.
- NFR-005: GitHub Actions minutes are a shared, metered resource on a private repository. The
  deploy workflow is manual, so it adds no per-push cost.

## Out of Scope

- **Moving production onto the project's real prod Convex deployment.** Production currently
  serves off `pastel-mosquito-479`, which is `sessionboard-clone`'s *dev* deployment; the
  project's production deployment (`calculating-loris-761`) is not what the live app uses. That
  is a genuine problem, but fixing it means moving live data and it is its own project. This
  workflow targets what production actually serves today.
- **Branch protection / GitHub Pro.** Required to make CI enforcing rather than advisory, but
  it is a billing decision, not a code change.
- **Automatic deploys on merge to `main`.** Deliberately excluded. Deploy timing stays a human
  decision.
- **Preview/staging deployments per PR.** Convex supports preview deploy keys and this workflow
  is structured so they could be added later, but that is not this change.
- Rollback automation.

## Success Metrics

- A release is one workflow run rather than a sequence of laptop commands
- Backend and frontend are never released independently
- Every release is attributable from the Actions log without asking anyone
- `lint` and `check:worker-types` failures are caught in CI rather than at deploy time
- Zero secret values in logs
