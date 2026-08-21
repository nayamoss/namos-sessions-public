# SessionBoard Evaluation Evidence — Implementation Plan

## Phase 1: Reproducible run contract

- [ ] T001: Pin the webapp SHA, harness SHA, production URL, personas, and reset procedure.
- [ ] T002: Add a sanitizer/validator for report JSON, artifact paths, coverage, SHA, and secrets.
- [ ] T003: Define the immutable artifact location and proof metadata type.

## Phase 2: Browse, judge, and finalize

- [ ] T004: Authenticate reserved organizer, reviewer, speaker, and attendee personas.
- [ ] T005: Run all required and optional CRM scenarios, capturing screenshots and observations.
- [ ] T006: Judge every evidenced area in a fresh context and record product defects separately
  from harness/run limitations.
- [ ] T007: Complete manual checks, finalize, score, and archive report JSON/HTML/checklist.

## Phase 3: Frontend UI

### UI Spec

- **Location:** `/demo/proof`, body section after release metadata; page header remains identity-only.
- **Elements:** score, coverage, verification date, tested SHA, area result rows, defect totals,
  “Open full report” link, stale badge, unavailable card with `FileCheck2`, and inline invalid-data
  message. No filters or actions appear in the page header.
- **Behavior:** the report link opens the immutable artifact; a SHA mismatch replaces PASS styling
  with STALE; missing/low-coverage data hides the headline score.
- **Data:** validated deploy-time metadata and static report URL.

### Tasks

- [ ] T008: Build the metadata reader and evaluation evidence component.
- [ ] T009: Wire valid, stale, missing, malformed, and low-coverage states.
- [ ] T010: Verify public desktop/mobile, keyboard, light, and dark rendering.

## Phase 4: Publication

- [ ] T011: Publish sanitized artifacts, checksums, and release metadata from the same deployment.
- [ ] T012: Link the report from README/proof work without copying credentials or mutable URLs.

## Task Dependencies

T001–T003 precede the run; finalized artifacts precede UI PASS state.

## Verification Checklist

- [ ] All acceptance criteria met and coverage truthfully reported.
- [ ] Every public result links to preserved evidence.
- [ ] No credential, personal data, or mutable “latest” artifact is published.
- [ ] Browser verification covers stale and failure states, not only a successful report.
