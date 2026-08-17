# Web App Security Headers — Implementation Plan

## Phase 1: Runtime inventory

- [x] T001: Capture current production headers for HTML and embed URLs; the origin had no baseline headers and embeds alone declared `frame-ancestors *`.
- [x] T002: Inventory required Clerk, Convex, Turnstile, and Sentry origins from source and deployment configuration.
- [x] T003: Allow external framing only for `/embed/*`; every other route uses `frame-ancestors 'none'`.

## Phase 2: Configure and stage

- [x] T004: Add enforced baseline headers and a checked-in Worker response policy; static Vite scripts need no inline-script exception.
- [ ] T005: Exercise signed-in admin, portal, CFP, upload, embed, API docs, Clerk, and Convex workflows in staging.
- [ ] T006: Remove unnecessary sources and fix violations without adding script `unsafe-inline`/`unsafe-eval`.

## Phase 3: Enforce

- [ ] T007: Switch CSP to enforcement and deploy.
- [ ] T008: Verify runtime headers and absence of unexpected CSP errors on production.
- [x] T009: Add automated assertions for required headers and route-specific framing.
- [ ] T010: Run `npm run check` and targeted browser journeys.

## Rollback

Return temporarily to report-only CSP if a critical workflow breaks, while retaining unrelated baseline protections.
