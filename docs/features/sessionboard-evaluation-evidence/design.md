# SessionBoard Evaluation Evidence — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

N/A — the harness writes filesystem artifacts under `sbek-eval/runs/`; it must not write eval
results into tenant tables.

### Required Changes

N/A — proof metadata is a deploy-time, immutable artifact rather than application data.

### Migration

N/A — no persisted application rows change.

---

## Backend / API

### Affected Existing Endpoints

| Method | Path | Change |
| --- | --- | --- |
| GET | `/api/demo/workspaces/current` | No behavior change; used to resolve live proof routes. |

### New Endpoints

N/A — publish the sanitized report as a versioned static asset, for example
`/proof/evals/sessionboard/<run-id>/report.html` and `.json`.

### Validation & Business Logic

The release step validates report schema, minimum coverage, artifact checksums, tested URL/SHA,
and absence of credential patterns before copying artifacts. Proof metadata fails closed to
`NOT RUN` or `STALE` when the artifact is missing or names another SHA.

---

## Frontend Components

### Modified Components

| File Path | Change |
| --- | --- |
| `src/lib/demo-proof.ts` | Parse sanitized evaluation metadata and derive freshness. |
| `src/pages/public/DemoProofPage.tsx` | Render evaluation summary and area results. |

### New Components

**EvaluationEvidenceSummary**
- File: `src/components/demo/EvaluationEvidenceSummary.tsx`
- Props: `{ report: EvaluationProofMetadata | null; deployedCommit?: string }`
- Location: `/demo/proof`, content section below release metadata.
- Elements: score, coverage, run date, tested SHA, area rows, defect counts, report link; neutral
  unavailable/stale card; loading is unnecessary for bundled metadata; malformed data shows an
  inline error and no score.
- Behavior: report link opens the immutable HTML artifact; area rows are passive.
- Third-party: N/A.

---

## State / Data Flow

`sbek` evidence → judgements → finalized report → sanitizer/validator → static proof artifact →
deploy metadata import → `EvaluationEvidenceSummary`. A deployment changes the freshness result.

---

## Auth / Permissions

The evaluation uses reserved demo personas only. Public artifacts are read-only and sanitized.
No organizer session token, magic link, or API token is copied into reports.

---

## Edge Cases & Error States

- Auth wall: mark downstream items `cannot_judge`, repair persona state, and rerun.
- Feature missing: record `not_found`, not `blocked`.
- Coverage below 60%: hide headline score and show why.
- SHA mismatch or old timestamp: show STALE and the named tested SHA.
- Malformed/missing artifact: inline unavailable state; never retain an older PASS silently.

---

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Storage | Immutable static artifacts | Auditable, cacheable, and outside tenant data. |
| Judging | Fresh context | Reduces intent contamination as required by the harness. |
| Status | Score plus coverage | A partial-rubric percentage alone is misleading. |

## Dependencies

Green deployed release, isolated demo, `sbek-eval`, #249 seed, and #257 browser evidence.

## Risks & Mitigations

Long runs may drift demo state; reset per scenario group and record run IDs. Secrets may leak in
screenshots; use test-only identities and run automated pattern scans before publication.
