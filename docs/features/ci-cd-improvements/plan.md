# CI/CD Automation — Implementation Plan

## Phase 1: Prerequisites (human, not code — blocks everything else)

- [ ] T001: Generate a Convex deploy key against **`your-project`** with scope
      `deployment:deploy` (Convex dashboard → deployment settings). Confirm the deployment name
      before generating — this is the dev deployment production actually serves, not the
      project's prod deployment.
- [ ] T002: Create a Cloudflare API token with **Edit Cloudflare Workers** permission. Not a
      Global API Key.
- [ ] T003: Add four repository secrets (`gh secret list` is currently empty):
      `CONVEX_DEPLOY_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
      `VITE_CLERK_PUBLISHABLE_KEY`.
- [ ] T004: Confirm `npm run check` passes locally on `main` — it runs `check:worker-types`,
      `typecheck`, `test`, and `build`, and CI does not currently run the first of those, so it
      may fail on first contact.

## Phase 2: Harden the existing CI workflow

- [ ] T005: Add a `Lint` step running `npm run lint` to `.github/workflows/ci.yml`, as its own
      step so it is distinguishable from typecheck in the checks list.
- [ ] T006: Add a `Worker types` step running `npm run check:worker-types`.
- [ ] T007: Push to a branch and confirm both steps appear and pass on the PR.
- [ ] T008: Deliberately break each (an unused variable; an edited binding in `wrangler.jsonc`)
      and confirm CI **fails**. A check that has never failed is not known to work. Revert.

## Phase 3: The deploy workflow

- [ ] T009: Create `.github/workflows/deploy.yml`, `workflow_dispatch` only. Never add `push`.
- [ ] T010: Define inputs per the Operator Interface below.
- [ ] T011: Guard: fail immediately unless `inputs.confirm == 'deploy'`.
- [ ] T012: `concurrency: group: deploy-production, cancel-in-progress: false` — queue, never
      cancel a deploy mid-flight.
- [ ] T013: `permissions: contents: read`.
- [ ] T014: Checkout, Node 22 with npm cache, `npm ci` — mirror `ci.yml`.
- [ ] T015: Run `npm run check`. Deploy nothing that does not pass.
- [ ] T016: Run `npm run build:hosted` with `CONVEX_DEPLOY_KEY` and
      `VITE_CLERK_PUBLISHABLE_KEY` in the environment. Do **not** set `VITE_CONVEX_URL` by
      hand — `build:hosted` injects it, and that is what makes the pairing atomic.
- [ ] T017: Conditional migration step, `if: inputs.migration != ''`, running
      `npx convex run "${{ inputs.migration }}" "${{ inputs.migration_args }}"`.
- [ ] T018: Deploy with `cloudflare/wrangler-action@v4` (apiToken, accountId). It deploys the
      `dist/` produced in T016 — do not rebuild.
- [ ] T019: Write commit SHA, actor, target deployment, and migration-ran yes/no to
      `$GITHUB_STEP_SUMMARY`. Never print secret values.

## Phase 4: Operator Interface (REQUIRED — this is how a human actually uses this)

> This change ships no application UI. Its user-facing surface is GitHub's `workflow_dispatch`
> form and the run summary, and those are as much a designed interface as any React component.
> An operator running this under pressure needs to understand it without reading the YAML.
> Specify it exactly — an implementing agent will not add a field that is not listed here.

### UI Spec

**Location:** GitHub → Actions → "Deploy to production" → *Run workflow* dropdown.

**Elements — the dispatch form:**

| Field | Type | Required | Default | Description shown to operator |
|---|---|---|---|---|
| `confirm` | string | yes | *(empty)* | `Type "deploy" to confirm. This releases to production.` |
| `migration` | string | no | *(empty)* | `Convex function to run after deploy, e.g. migrations:backfillOrganizations. Leave blank to skip.` |
| `migration_args` | string | no | `{}` | `JSON args for the migration, e.g. {"name":"Namos Sessions"}` |

- Branch selector: GitHub's built-in control. Operators should leave it on `main`.
- No other inputs. Deployment target is not an input — it comes from `CONVEX_DEPLOY_KEY`, so it
  cannot be typed wrong at 2am.

**Elements — the run summary** (rendered on the completed run page):

- Heading: `Production deploy`
- `Commit:` short SHA + first line of the message
- `Actor:` who dispatched it
- `Convex deployment:` deployment **name** only, never the key
- `Migration:` the function name, or `none`
- `Worker version:` the version id wrangler reports

**States:**

- *Running:* standard GitHub progress. Steps are named so the current phase is legible at a
  glance — `Deploy Convex + build frontend`, `Run migration`, `Deploy Worker`.
- *Blocked on confirmation:* first step fails with
  `Refusing to deploy: type "deploy" in the confirm field.` Nothing has run.
- *Failed before deploy* (`npm run check`): production untouched; summary says so explicitly so
  nobody starts hunting for damage.
- *Failed after Convex, before Worker:* summary must state plainly that **the backend is live
  and the frontend is not**, and link to the recovery steps in T023. This is the state that
  needs the clearest wording — it is the one where a person is panicking.
- *Succeeded:* full summary as above.

**Behaviour:** each step's failure stops the job; no step is `continue-on-error`.

### Tasks

- [ ] T020: Implement the three inputs with the exact descriptions above — they are the only
      documentation the operator sees at the moment of use.
- [ ] T021: Implement the run summary with every field listed, asserting no secret is printed.
- [ ] T022: Name the steps as written so the run page is readable mid-deploy.
- [ ] T023: Write the recovery runbook to `docs/features/ci-cd-improvements/runbook.md`, covering
      migration-failed-mid-deploy, Worker-deploy-failed, and how to take and restore a Convex
      snapshot export. Link it from the failure summary.

## Phase 5: Verification (do not skip — this touches production)

- [ ] T024: **Snapshot first.** `npx convex export --deployment your-project --path
      backup.zip` before any run that names a migration. The 2026-08-16 export was 107 KB; there
      is no reason to skip it.
- [ ] T025: Dry run — dispatch with `migration` blank against a commit already in production.
      Expected: succeeds, nothing meaningfully changes.
- [ ] T026: Open the app in a browser and confirm it still works. Sign in; load the events list.
      A green workflow is not evidence the app is up.
- [ ] T027: Confirm the run summary is accurate and contains no secret values.
- [ ] T028: Confirm a second dispatch queues behind a running one rather than interleaving.
- [ ] T029: Confirm a bad `confirm` value fails fast and deploys nothing.
- [ ] T030: Only after T025–T029 pass, use the workflow for a real release.

## Task Dependencies

```
T001,T002 → T003 → T016,T017,T018
T004 → T015
T005,T006 → T007 → T008
T009…T013 → T014 → T015 → T016 → T017 → T018 → T019
T019 → T020,T021,T022 → T023
T023 → T024 → T025 → T026,T027,T028,T029 → T030
```

Phase 2 is independent of Phases 3–5 and can ship on its own. If time is short, ship Phase 2
first — it is low risk and immediately useful.

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` met
- [ ] The workflow is reachable and usable from the GitHub Actions UI, with the exact inputs and
      summary specified in Phase 4 — not merely committed as YAML
- [ ] `lint` and `check:worker-types` run in CI and have been *observed failing* on purpose
- [ ] `workflow_dispatch` is the only trigger; no `push` trigger exists
- [ ] No secret value appears in any log or summary
- [ ] `npm run deploy` still works locally as the escape hatch
- [ ] Recovery runbook exists and is linked from the failure summary
- [ ] Docs updated: README release section points at the workflow as the normal path
