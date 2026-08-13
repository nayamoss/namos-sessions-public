# Web App Security Headers — Implementation Plan

## Phase 1: Runtime inventory

- [ ] T001: Capture current production headers for HTML, JS, API docs, CFP, portal, and embed URLs.
- [ ] T002: Inventory every required script/connect/frame/image/font origin from source and browser traffic.
- [ ] T003: Decide the explicit public-embed framing policy.

## Phase 2: Configure and stage

- [ ] T004: Add baseline headers and a report-only CSP to checked-in Cloudflare Worker configuration.
- [ ] T005: Exercise signed-in admin, portal, CFP, upload, embed, API docs, Clerk, and Convex workflows in staging.
- [ ] T006: Remove unnecessary sources and fix violations without adding script `unsafe-inline`/`unsafe-eval`.

## Phase 3: Enforce

- [ ] T007: Switch CSP to enforcement and deploy.
- [ ] T008: Verify runtime headers and absence of unexpected CSP errors on production.
- [ ] T009: Add automated assertions for required headers and route-specific framing.
- [ ] T010: Run `npm run check` and targeted browser journeys.

## Rollback

Return temporarily to report-only CSP if a critical workflow breaks, while retaining unrelated baseline protections.
