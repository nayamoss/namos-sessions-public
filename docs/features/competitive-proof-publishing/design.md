# Competitive Proof Publishing — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

Existing demo workspace/event tables and normal event-domain tables store isolated seeded data.
No new product table is required; profiles use the existing schema and demo workspace boundary.

### Required Changes

N/A — profile identity is an internal seed parameter and deploy artifact metadata is static.

### Migration

N/A — reset deletes/recreates only the current isolated demo workspace through existing boundaries.

---

## Backend / API

### Affected Existing Endpoints

| Method | Path | Change |
| --- | --- | --- |
| POST | demo workspace create/reset endpoints | Accept allowlisted `small|medium|large` profile. |
| GET | `/api/demo/workspaces/current` | Return passive profile/count metadata. |

No public caller may seed arbitrary data or target another workspace/event.

### New Endpoints

N/A — extend existing demo endpoints. Local CLI adds an allowlisted profile option if necessary.

### Validation & Business Logic

Use stable fictional generators and deterministic IDs/counts. Reset validates workspace cookie/token,
profile enum, rate limit, and exact event ownership. Release metadata is generated from CI artifacts,
not hand-entered claims. Mirror sync runs secret/fixture scans and opens a PR, never direct-pushes.

---

## Frontend Components

### Modified Components

| File Path | Change |
| --- | --- |
| `src/pages/public/DemoLandingPage.tsx` | Role links and passive profile chooser in body toolbar. |
| `src/pages/public/DemoProofPage.tsx` | Consistent evaluation/release/freshness and fixture metadata. |
| `src/components/demo/DemoWorkspaceBar.tsx` | Profile/reset status outside page headers. |
| `README.md` and public mirror README | Evidence-first opening and current feature truth. |

### New Components

**DemoProfileChooser**
- File: `src/components/demo/DemoProfileChooser.tsx`
- Props: `{ value; counts; disabled; onChange; onReset }`
- Location: demo landing body/setup card, never a page header.
- Elements: three labeled size cards or styled radio group, stable count summaries, reset button,
  loading progress, confirmation dialog for destructive reset, inline error/retry, and explanation.
- Behavior: selecting does not reset; explicit confirmed reset creates that profile and returns role links.
- Third-party: existing app controls; no native select.

---

## State / Data Flow

Profile selection → confirmed demo reset endpoint → deterministic seeded workspace → returned role/count
metadata → direct role links. CI release/eval artifacts → proof metadata generator → README/proof page.
Private main delta → guarded public sync branch/PR → public CI.

---

## Auth / Permissions

Public demo uses isolated workspace tokens/cookies and reserved personas only. Reset cannot address a
real event. Mirror publication requires repository write access and PR review/branch protection.

---

## Edge Cases & Error States

Reset timeout/partial seed, concurrent reset, stale workspace, rate limit, missing role, low eval
coverage, SHA mismatch, missing video, public mirror divergence, secret scan finding, real fixture
content, mobile overflow, and external service unavailable show honest non-PASS states.

---

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Profiles | Deterministic small/medium/large | Makes depth and performance legible. |
| Evidence | CI-generated, SHA-bound | Prevents stale self-attestation. |
| Mirror | Safety-reviewed PR | Preserves public-only fixes and prevents leaks. |
| Visual design | Keep Namos system | Copy evidence discipline, not competitor styling. |

## Dependencies

#249, #257, #263, #264, demo workspace isolation, public-repo-sync safety process.

## Risks & Mitigations

Public sync can leak configuration/data; run full-diff secret/fixture scans and human-review PR.
Large profiles can slow demos; define budgets and show readiness only after seed completion.
