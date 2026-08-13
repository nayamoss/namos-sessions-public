# Public CFP Abuse Controls — Implementation Plan

## Phase 1: Measure and choose controls

- [ ] T001: Inventory every caller of `publicForms:submit`, including embeds and tests.
- [ ] T002: Choose the edge rate-limit store and accessible anti-bot provider; document production ownership and outage behavior.
- [ ] T003: Define initial buckets, payload-size ceiling, metrics, and privacy-safe keys.

## Phase 2: Move the boundary

- [ ] T004: Extract the existing Convex submission handler into an internal function without changing domain validation.
- [ ] T005: Add a same-origin Cloudflare Worker POST endpoint with strict schema/body-size validation.
- [ ] T006: Verify anti-bot proof and rate limits before invoking Convex.
- [ ] T007: Update all clients to use the endpoint; remove public mutation reachability.

## Phase 3: Verify

- [ ] T008: Test normal, closed-form, limit-reached, invalid-proof, oversized, and 429 cases.
- [ ] T009: Test retry/replay: one persisted submission, routing assignment, log, and email attempt.
- [ ] T010: Load-test approved thresholds in staging and verify no sensitive payloads enter logs.
- [ ] T011: Run `npm run check` and the authoritative public-CFP browser journey.

## Dependencies

T002-T003 block implementation. T004 blocks T005-T007. Provider credentials are a release gate, not permission to bypass verification.

## Rollback

Roll back the client and endpoint together. Do not restore an unthrottled public mutation; use a temporary maintenance response if the boundary cannot operate safely.
