# Public CFP Abuse Controls — Implementation Plan

## Phase 1: Measure and choose controls

- [x] T001: Inventory every caller of `publicForms:submit`, including embeds and tests.
- [x] T002: Choose the edge rate-limit store and accessible anti-bot provider; document production ownership and outage behavior.
- [x] T003: Define initial buckets, payload-size ceiling, metrics, and privacy-safe keys.

## Phase 2: Move the boundary

- [x] T004: Extract the existing Convex submission handler into an internal function without changing domain validation.
- [x] T005: Add a same-origin Cloudflare Worker POST endpoint with strict schema/body-size validation.
- [x] T006: Verify anti-bot proof and rate limits before invoking Convex.
- [x] T007: Update all clients to use the endpoint; remove public mutation reachability.

## Phase 3: Verify

- [x] T008: Test normal, closed-form, limit-reached, invalid-proof, oversized, and 429 cases.
- [x] T009: Test retry/replay: one persisted submission, routing assignment, log, and email attempt.
- [x] T010: Load-test approved thresholds in staging and verify no sensitive payloads enter logs.
- [ ] T011: Run `npm run check` and the authoritative public-CFP browser journey.

## Verification record — 2026-08-15

- Caller inventory found one product caller (`SubmissionPage` through the repository/Convex
  transport boundary) plus adapter/security tests; no embed or alternate write client existed.
- A dedicated Cloudflare preview Worker and isolated Convex preview accepted two edge requests
  with the same idempotency key and returned the same speaker. The database contained one
  submission, one sponsor-routing result, one confirmation request, and one communications log.
- The staging closed-form load test returned generic 409 responses until the thirtieth request in
  the shared IP window, then returned 429 before Convex. Invalid proof, cross-origin, strict-schema,
  oversized-body, email-limit, form-limit, and provider-outage cases have focused coverage.
- Cloudflare tail output contained only the aggregate application metric and standard platform
  request metadata; unique test markers placed in name, email, title, answers, and token were absent.
- `npm run check` passed all three TypeScript projects, generated Worker type drift, 472 tests in 75
  files, and the production Vite build. ESLint passed with warnings only.
- Browser verification loaded the public CFP from the deployed preview and confirmed its first two
  steps render against isolated Convex data. The final production email-verification + Turnstile +
  submit journey remains part of T011 and must pass after release configuration is active.

## Dependencies

T002-T003 block implementation. T004 blocks T005-T007. Provider credentials are a release gate, not permission to bypass verification.

## Rollback

Roll back the client and endpoint together. Do not restore an unthrottled public mutation; use a temporary maintenance response if the boundary cannot operate safely.
