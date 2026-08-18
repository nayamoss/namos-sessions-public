# CI/CD Automation — Technical Design

## Database / Schema Changes

**N/A — this change adds release automation and touches no application data.**

It does, however, *run* migrations. The workflow invokes a Convex migration function by name as
an optional step; it never contains migration logic itself. Migrations continue to live in
`convex/migrations.ts` as `internalMutation`s, which is what keeps them un-callable from the
app.

The ordering constraint below exists because of how the most recent migration behaved: the
multi-tenancy guards deny access when `organizationId` is unresolvable, so the schema deploy and
the backfill must be adjacent in time. Any future fail-closed migration inherits the same
constraint, which is the reason the migration step lives between the two deploys rather than
before or after both.

---

## Backend / API

### Affected Existing Endpoints

**N/A — no endpoint behaviour changes.**

### New Endpoints

**N/A.**

### Build & Deploy Pipeline (the actual subject of this design)

`package.json` already contains the mechanism, unused:

```
"build:hosted": "convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL"
```

This is the officially documented Convex CI pattern. It deploys Convex functions and schema,
then runs the frontend build **with `VITE_CONVEX_URL` set to the deployment it just pushed to**.
The frontend therefore cannot be built against a different backend than the one deployed — the
drift is removed at build time rather than policed by convention. Reusing it is preferable to
hand-rolling two separate steps.

Sequence, one job:

| # | Step | Command | Why here |
|---|------|---------|----------|
| 1 | Checkout + Node 22 + `npm ci` | — | Matches `ci.yml` |
| 2 | Verify | `npm run check` | Never deploy something that does not pass |
| 3 | Deploy backend + build frontend | `npm run build:hosted` | Atomic pairing (above) |
| 4 | Migration *(conditional)* | `npx convex run <input> '<args>'` | Immediately after schema, before the new frontend |
| 5 | Deploy Worker | `cloudflare/wrangler-action@v4` | `dist/` from step 3 |
| 6 | Summary | `$GITHUB_STEP_SUMMARY` | Release record |

Step 4 runs only when the `migration` input is non-empty. `CONVEX_DEPLOY_KEY` is in the job
environment, so `npx convex run` targets the same deployment step 3 pushed to — no second
target to get wrong.

### Validation & Business Logic

The workflow refuses to run unless the `confirm` input equals the literal `deploy`. This is
protection against an accidental click in the Actions UI, not a security control — anyone who
can dispatch the workflow can type the word.

---

## Frontend Components

### Modified Components

**N/A — no application UI changes.**

### New Components

**N/A.** The operator-facing surface is GitHub's own `workflow_dispatch` form and run summary,
specified under *Operator Interface* in `plan.md` rather than as React components.

---

## State / Data Flow

Secrets flow from GitHub repository secrets → job environment → CLI tools. Nothing is written to
the repository and nothing persists between runs.

```
GitHub secrets ─┬─ CONVEX_DEPLOY_KEY ──────────→ convex deploy / convex run
                ├─ VITE_CLERK_PUBLISHABLE_KEY ─→ vite build (baked into bundle)
                └─ CLOUDFLARE_API_TOKEN ───────→ wrangler deploy
                   CLOUDFLARE_ACCOUNT_ID
```

`VITE_CONVEX_URL` is not a secret and is not supplied by hand — `build:hosted` injects it. That
is the whole point of using it.

---

## Auth / Permissions

| Credential | Scope | Notes |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | `deployment:deploy` | Per Convex docs, the minimum for CI push. Generated in the deployment's dashboard settings. |
| `CLOUDFLARE_API_TOKEN` | Edit Cloudflare Workers | Custom token; do **not** use a Global API Key. |
| `CLOUDFLARE_ACCOUNT_ID` | — | Not secret, stored as a secret for tidiness. |
| `VITE_CLERK_PUBLISHABLE_KEY` | — | Publishable, ends up in the client bundle. Held as a secret only because `wrangler.jsonc` carries a placeholder for it. |

Workflow-level `permissions: contents: read`, matching `ci.yml`.

Who can dispatch it is governed by repository write access. **There is currently no branch
protection** (403 from the API on this plan), so anyone with write access can both push to
`main` and deploy. This workflow does not fix that, and should not be mistaken for having fixed
it.

---

## Edge Cases & Error States

| Case | Behaviour |
|---|---|
| `confirm` ≠ `deploy` | Job fails at the first step. Nothing deployed. |
| `npm run check` fails | Stops before any deploy. Production untouched. |
| Convex deploy fails | Stops before migration and before Worker deploy. Production untouched — the old bundle still points at the old backend. |
| **Migration fails after a successful Convex deploy** | **Worst case.** New backend is live, old frontend still served, migration incomplete. Job stops; the Worker is not deployed. Recovery is manual: re-run the migration or restore a snapshot. See Risks. |
| Worker deploy fails | New backend + migration are live, old frontend still served. Re-run the workflow, or `npm run deploy` locally from a clean checkout. |
| Two dispatches at once | Second queues on the `concurrency` group. |
| Migration already applied | `backfillOrganizations` refuses to run twice by design. Other migrations must be written idempotent — this is a requirement on migration authors, not something the workflow can enforce. |

---

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Trigger | `workflow_dispatch` only | Deploy timing stays a human decision. Also avoids consuming Actions minutes on every push to a private repo. |
| Backend/frontend coupling | `npm run build:hosted` | Already present, officially documented, and structurally prevents building the frontend against the wrong backend. Two independent steps would only re-create today's drift. |
| Migration invocation | Optional workflow input naming a function | Keeps the workflow generic. Hardcoding `backfillOrganizations` would date it immediately. |
| Migration position | Between the two deploys | Fail-closed guards mean schema and backfill must be adjacent. Running it after the Worker deploy would expose users to the denial window. |
| Target deployment | `pastel-mosquito-479` via the deploy key | It is what production serves. Moving to the project's real prod deployment needs a data move — out of scope, tracked separately. |
| Keep `scripts/deploy-cloudflare.mjs` | Yes | Local escape hatch for when Actions is down or a hotfix is urgent. Its clean-tree and placeholder guards remain valuable. |
| Wrangler action | `cloudflare/wrangler-action@v4` | Current major; v4 is the action's default Wrangler line. |
| `lint` in CI | Separate step, not folded into `check` | A lint failure and a type failure should be distinguishable at a glance in the checks list. |

---

## Dependencies

**Requires:**
- Four repository secrets, none of which currently exist (`gh secret list` is empty)
- A Convex deploy key generated against `pastel-mosquito-479`
- A Cloudflare API token with Edit Cloudflare Workers

**Enables:**
- #203 — config validation gains a pipeline to run in
- Makes branch protection worth paying for: gating merges only matters once the release path is also controlled

**Related:** #199, #201, #202

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Workflow holds production credentials | Minimum-scope tokens; `permissions: contents: read`; secrets never echoed; manual trigger only |
| Migration fails mid-deploy, leaving new backend behind old frontend | Take a Convex snapshot export before any run that names a migration — cheap (the 2026-08-16 export was 107 KB) and the only real undo. The plan makes this an explicit pre-flight task. |
| A breaking-contract deploy still has a real drift window | Inherent to breaking changes; this shortens it from minutes to seconds. Eliminating it entirely requires backward-compatible function contracts — a discipline for feature work, not something a workflow can impose. |
| Automation makes deploying feel free, so it happens more often | Manual trigger plus typed confirmation keeps it deliberate. Cloudflare does not bill per deploy, so frequency is a stability concern, not a cost one. |
| Secrets drift from what production expects | The run summary prints the target deployment (not the key) so a wrong target is visible in the log |
| A first run misbehaves against production | Validate on a no-op first: dispatch with the migration input blank against a commit already deployed. Nothing should change. |

---

## Update — 2026-08-16, reconciled against #196

**#196 shipped the core of this design independently, while this branch was in flight, and it
should be treated as authoritative — not reverted or redone.** It merged as PR #206 at 15:29,
three minutes before this branch's Phase 2 PR merged at 15:32. Two agents solved overlapping
problems concurrently without coordinating; this section reconciles the two rather than leaving
contradictory docs in the repo.

**What #196 built** (`.github/workflows/ci.yml`, `deploy` job): a `needs: check` job gated on
`github.event_name == 'push' && github.ref == 'refs/heads/main'`, running `npm run build:hosted`
(the exact mechanism this design settled on — see *Backend / API* above) then
`cloudflare/wrangler-action@v4`, with a `concurrency` group matching FR-004 here, and a
fail-fast secret-presence check that matches this doc's Edge Cases table entry for "Convex
deploy fails."

**The one substantive difference: trigger.** This design specified `workflow_dispatch`-only
(FR-001) — deploy timing as a deliberate human decision. #196 ships `push` to `main` —
deploy timing as *whatever merging is*. That is not a bug in #196; it is a different, coherent
answer to the same problem #196's own issue describes: a green `main` that silently wasn't
live. Auto-deploy-on-push makes that gap structurally impossible rather than relying on someone
remembering to trigger a workflow. **This design's FR-001 and FR-005 (confirmation input) are
superseded — do not implement them.** Re-adding a manual gate would reopen the exact drift #196
closed.

**Consequence that must be understood by whoever reads this next:** merging to `main` now
deploys to production, unconditionally, the moment `check` passes. There is no dry run, no
staging step, and — per the #199/#201/#202/#208 planning done in this same session — no branch
protection stopping a direct push to `main` either. Every subsequent piece of security/infra
work planned alongside this one inherits that reality: merging it ships it.

### Scope remaining after reconciliation

Not superseded — #196 does not cover these, and this design's reasoning for them still holds:

- **FR-003, T017: migration step.** #196's `deploy` job has no way to run a named Convex
  migration. A schema change with fail-closed guards (the multi-tenancy migration is the worked
  example) still needs its backfill run immediately adjacent to the schema deploy, and nothing
  automated does that today. Add it to the existing `deploy` job as a conditional step — do not
  build a second workflow now that one already exists and auto-triggers correctly.
- **FR-006, T019: run summary.** #196's job deploys but records nothing beyond the Actions log
  itself. Add `$GITHUB_STEP_SUMMARY` output with commit, actor, target deployment, migration
  status.
- **Phase 5 verification tasks (T024–T030)** still apply, adjusted for `push`-triggered rather
  than manually-dispatched: T025's "dry run" becomes "merge a no-op change and confirm the
  deploy job behaves correctly," since there is no dispatch form to test against in isolation.
- **The recovery runbook (T023)** is more urgent now, not less — every merge is a live deploy
  attempt, so the "migration failed mid-deploy" state in the Edge Cases table is reachable by
  routine merging, not only by someone deliberately choosing to deploy.

Superseded, remove from any future implementation of this issue:

- FR-001 (workflow_dispatch trigger)
- FR-005 (typed confirmation input)
- Phase 4's Operator Interface `workflow_dispatch` form spec — there is no dispatch form; the
  "operator interface" for a push-triggered deploy is the PR itself plus the Actions run it
  produces. If a run summary is added (still in scope, above), specify it against the existing
  `deploy` job, not against a form that no longer exists.

### Still required, unchanged

Phase 1 prerequisites (T001–T004) — the four repository secrets do not exist yet
(`gh secret list` returns empty), so #196's `deploy` job currently fails at its own
"Verify deploy secrets are configured" step on every push to `main`. Generating those secrets
is what turns #196's job from "safely fails every time" into "actually deploys," and remains a
human, off-repo action nothing in either design can automate.
