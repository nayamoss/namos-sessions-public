# Demo Read-Only Mode — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement
The live demo at `app.namos-sessions.xyz/demo` is currently the opposite of a safe, no-friction
product tour: it gates entry behind a Turnstile CAPTCHA and a role-picker click, then silently
provisions three real Clerk users and a real Convex event, and drops the visitor into the **real,
fully-writable app** — recording decisions, resolving schedule conflicts, publishing programs,
uploading files, and messaging the real Operations Agent (with real AI spend) are all currently
possible. The marketing page (`namos-sessions-marketing/app/(marketing)/demo/page.tsx`) sells this
as a feature ("Confirmation before agent writes").

The reference pattern (https://opensession-web.vercel.app/) shows what a real demo should be: land
directly in the actual product UI, fully populated with realistic seeded data, with zero login
step and zero ability to mutate anything or spend money on AI calls. Every visitor sees an
identical, stable, read-only mirror of the real app.

This matters because: (1) an unauthenticated write-capable demo is a standing abuse surface
(fake Clerk accounts, real AI agent spend, real storage uploads — all currently only rate-limited,
not blocked), and (2) it undersells the product by hiding what a prospect actually wants to see
first — the full app, immediately, with nothing to click through to reach it.

## User Stories

**As a** prospective customer or judge landing on the demo link
**I want to** see the exact real application, fully populated, the instant the page loads
**so that** I can evaluate the product without any signup friction or risk of breaking a shared
demo for someone else.

**Acceptance Criteria:**
- GIVEN a visitor opens the demo link WHEN the page loads THEN they land inside the real app UI
  (organizer dashboard) with seeded data visible — no CAPTCHA, no role-picker click, no visible
  "enter demo" step.
- GIVEN a demo visitor is inside the app WHEN they attempt any write action (edit a field, accept
  a submission, resolve a conflict, publish, upload a file, delete anything) THEN the action is
  visibly blocked (disabled control and/or an inline "Demo is read-only" message) AND the
  corresponding server call is rejected even if attempted directly against the API.
- GIVEN a demo visitor opens the Operations Agent panel WHEN they try to send a message or approve
  an agent action THEN sending is disabled and no agent run is created server-side.
- GIVEN a demo visitor switches between Organizer / Reviewer / Speaker WHEN they view any role's
  screens THEN every screen renders using the same seeded data (no drift from writes), because no
  writes are possible.
- GIVEN the marketing demo page WHEN a visitor reads it THEN the copy accurately describes a
  read-only walkthrough — no claim of "confirmation before agent writes," decisions, or
  publishing.

## Functional Requirements
- FR-001: The public `/demo` entry provisions (or reuses) a demo workspace and signs the visitor
  in with **zero interactive gate** — no Turnstile widget, no "Enter as [role]" click required to
  reach the app. Landing goes straight to `/events/demo-{workspaceId}/dashboard` as the organizer.
- FR-002: Every Convex mutation reachable from an authenticated session is rejected server-side
  when the caller's identity belongs to an active demo workspace. This must be enforced at a
  single, shared choke point — not duplicated per-mutation-file — so no future mutation can
  accidentally ship writable-in-demo.
- FR-003: The Operations Agent (`agentRuns.create`, `.respond`, `.retry`, `.approveTaskProposal`,
  `.approveMessageProposal`, `.rejectProposal`, `.cancel`) is blocked by the same FR-002 choke
  point — no agent run can be created or advanced from a demo identity, so no AI spend is
  possible.
- FR-004: File/storage upload mutations are blocked by the same choke point (covered by FR-002 —
  storage-generating mutations are mutations).
- FR-005: The role switcher (Organizer/Reviewer/Speaker) and the "Reset event" control remain —
  reset stays a write, but it is a demo-workspace-scoped operation performed through the existing
  edge-worker/internal-mutation path (`worker/demo.ts` → `convex/demoWorkspaces.ts`), not a
  regular authenticated mutation, so it is unaffected by and does not conflict with FR-002.
- FR-006: The UI proactively disables/hides write affordances for a demo session (buttons show
  disabled state or a "Demo is read-only" tooltip) rather than only failing after a server round
  trip. This is a UX layer on top of FR-002, never a substitute for it.
- FR-007: Abuse controls that previously relied on Turnstile are replaced with IP-based rate
  limiting only (already implemented in `worker/demo.ts` via `CFP_RATE_LIMITER`) — tightened as
  needed since Turnstile is removed as a gate.
- FR-008: The marketing demo page (`namos-sessions-marketing/app/(marketing)/demo/page.tsx`) copy
  is corrected to describe the demo as read-only (no "confirmation before agent writes," no
  "record an acceptance decision," no "publish the program" language) and to reflect the
  zero-click entry.

## Non-Functional Requirements
- NFR-001 (Security): Demo-identity detection must fail closed — if the workspace lookup errors
  or is ambiguous, the mutation is rejected, never allowed through.
- NFR-002 (Security): Removing Turnstile increases bot-provisioning risk; the existing per-IP
  rate limit (currently 3/hour for `create-v2`) must be reviewed and is expected to need
  tightening now that it is the only gate.
- NFR-003 (Performance): The read-only guard runs on every mutation call — must be a single cheap
  indexed lookup (existing `demo_workspaces` `by_workspaceId`/subject match), not a full table
  scan, so it doesn't add meaningful latency to non-demo traffic.
- NFR-004 (Reliability): Demo workspace provisioning failures must not leave orphaned Clerk users
  (existing rollback behavior in `worker/demo.ts` `createWorkspace` is preserved).

## Out of Scope
- Changing how demo workspaces are seeded, expired, or cleaned up (existing lifecycle in
  `convex/demoWorkspaces.ts` is unchanged).
- Building a separate mock/static UI — the requirement is explicitly to reuse the real app shell,
  not fork it.
- Rate-limit tuning beyond "tighten the existing per-IP limiter" (exact numbers are an
  implementation-time call, not a planning-time one).

## Success Metrics
- Zero successful writes (decisions, publishes, conflict resolutions, uploads, agent runs)
  originate from a demo identity, verified via a Convex mutation-layer test suite.
- A visitor reaches the real organizer dashboard with seeded data with zero clicks past the
  `/demo` link (no CAPTCHA, no role-picker).
- Marketing copy contains no language implying write access.
