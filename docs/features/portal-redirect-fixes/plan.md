# Portal Redirect Fixes — Implementation Plan

## Phase 1: Reproduce & Confirm Root Cause

- [x] T001: Confirmed without needing a live browser pass: `/portal/*` is nested inside `<Route element={<RequireAuth />}>` in `src/App.tsx`. A truly clean, signed-out submitter is redirected straight to `/sign-in` — the portal is not reachable at all, let alone reachable as the wrong speaker. The original audit's "wrong speaker" symptom is explained by a stale Clerk session already present in that browser: `RequireAuth` passed silently, `PortalIdentity` resolved `ownSpeaker` (correctly, by design — see Phase 2), and it looked like a routing bug instead of an auth gate working as intended. This is a deeper, real blocker beyond the two bugs this issue originally scoped — see Phase 2b.
- [x] T002: Confirm the abstract-content root cause: `src/pages/program/Abstracts.tsx`'s `valueFromAnswers()` (around line 138) only matches a field by label text against the fixed set `["abstract", "description", "summary"]`. Any CFP form whose abstract field has a different organizer-chosen label produces `""` → rendered as `—`, even though `convex/publicForms.ts`'s `submit` mutation (line ~178) wrote the value correctly into `answers.fieldValues`/`answers.fieldLabels`. Confirm by checking the actual field label used on the audited event's submission form.

## Phase 2: Fix — Portal Identity Resolution

`src/pages/portal/PortalIdentity.tsx` already prioritizes a Clerk-authenticated `ownSpeaker` over the sessionStorage handoff (`consumePortalHandoffSpeaker()`), by design — a handoff is "a convenience, not a credential" and must not let an anonymous submission hijack an already-authenticated speaker's portal. That priority is correct and must not be weakened.

The gap is FR-002: when this happens, the person who just submitted sees an unrelated authenticated speaker's dashboard with no explanation.

- [x] T003: In `PortalIdentityProvider` (`src/pages/portal/PortalIdentity.tsx`), when `resolvedHandoffId` was present but discarded because `ownSpeaker` took priority (i.e. `handoffId` existed and `handoffId !== ownSpeaker?.id`), surface that fact on the identity object (e.g. add `handoffMismatch: boolean` to `PortalIdentity`).
- [x] T004: In `PortalLayout.tsx`, when `identity.handoffMismatch` is true, render a dismissible inline notice above the portal content: "You're viewing the portal as {ownSpeaker name} — your recent submission isn't shown here because you're signed in as a different speaker." No modal, no fixed overlay — inline banner per the design system rules (no border, no shadow, `bg-neutral-100`/`bg-muted`).
- [x] T005: N/A — T001 found the portal isn't reachable signed-out at all (`RequireAuth` redirects to sign-in), so there's no client-side speaker-list race to chase. Superseded by Phase 2b.

## Phase 2b: Make an Anonymous CFP Submitter's Portal Actually Reachable

**Scope decision (approved 2026-08-12, see issue #108 comment):** an anonymous CFP submitter cannot reach `/portal/*` at all today — it's fully gated by `RequireAuth`. Two ways to fix this were considered:

- ~~A custom scoped, single-use, time-limited portal access token~~ — **rejected.** New auth surface (mint/store/expire/single-use-invalidate) with real data-leak risk if any part of it is wrong, duplicating what Clerk already does safely.
- **Approved: Clerk email verification on the CFP's Account step.** The submitter proves their email (magic link or OTP) before submitting. By the time they land on `/portal`, they have a real Clerk session whose email matches `speakers.email` — `RequireAuth` and the existing `speakers.getMine` email-matched lookup (`convex/speakers.ts`) work completely unmodified. No new Convex functions, no new code path to security-review. Cost: a "check your email" step added to the public CFP funnel.

**Hard constraint, non-negotiable:** do not weaken `RequireAuth` on `/portal/*`, and do not add any query/mutation that returns speaker data without a Clerk-authenticated identity whose email matches that speaker. (An earlier attempt at this issue removed `RequireAuth` from `/portal/*` in `App.tsx` — reverted. It didn't leak data, since `speakers.getMine`/`speakers.list` independently call `requireIdentity`/`assertOrganizer` server-side and would still throw for a signed-out caller — but it also didn't solve reachability, it just turned "redirect to sign-in" into an unhandled portal error. Do not repeat this approach.)

- [ ] T010: In `src/pages/public/SubmissionPage.tsx`'s Account step (step index 1), replace the plain `name`/`email` `Input` fields with a Clerk-verified email flow: use `useSignUp` (new email) / `useSignIn` (returning email, `email_code` strategy) to send an OTP, collect the code inline in the same step, and call `setActive({ session })` once verified. Keep `name` as a plain text field alongside it — Clerk verifies the email, not the display name.
- [ ] T011: Handle both branches cleanly: a first-time submitter (`useSignUp`) and a returning speaker re-submitting from a new browser/session (`useSignIn`). Clerk returns a "that identifier exists" error from `signUp.create` for the latter — catch it and fall through to the sign-in flow with the same email.
- [ ] T012: UI for the OTP step follows the design system: no border/shadow on the code input, inline error text (not a modal) for an invalid/expired code, a "Resend code" action, and it must not block the rest of the already-filled-in form state (name, abstract, etc. stay intact while verifying).
- [ ] T013: Once verified and `setActive` has run, the rest of the submit flow (`repo.publicForms.submit`) proceeds as today — `speakerId` handoff, timed redirect to `/portal`. Confirm the Convex mutation's `email` argument is sourced from the verified Clerk identity, not the free-text input, so a submitter can't claim an email they didn't verify.
- [ ] T014: Regression test: a signed-out `SubmissionPage` render requires completing OTP verification before `next()` on the Account step succeeds (mock `useSignUp`/`useSignIn`).

## Phase 3: Fix — Abstract Field Display

- [x] T006: In `src/pages/program/Abstracts.tsx`, stop relying on label-text matching alone for the abstract field. The submission form's section/field configuration already has a stable `key` (`"abstract"` section, per `convex/publicForms.ts` and `SubmissionFormBuilder.tsx`) — thread that key through so `valueFromAnswers` (or a new sibling helper) can resolve the abstract field by its stable field role first, falling back to label-text matching only as a last resort for older/legacy data.
- [x] T007: Apply the same fix to any other `valueFromAnswers` calls in the same file that rely solely on label text where a stable key is available (`title`/`sessionTitle`, `track`/`topic`) — audit each call site in `createRows()`. Title remains canonical on `submission.title`; no similarly stable role exists for Track, so its legacy label fallback is deliberately retained.
- [x] T008: Add a regression test in `src/test/` seeding a submission whose abstract field label is something other than "Abstract" (e.g. "What will you cover?") and asserting the grid row's `description` is the actual text, not `—`.

## Phase 4: Regression Coverage for Redirect

- [x] T009: Add a test for `PortalIdentityProvider`/`usePortalIdentity` covering: (a) anonymous handoff with no `ownSpeaker` → handoff speaker wins; (b) handoff present but a different `ownSpeaker` resolves → `ownSpeaker` still wins AND `handoffMismatch` is true.

## Task Dependencies

- T002 informs T006–T008.
- T001 gates whether T005 is needed at all (it isn't — see T005).
- T003 must land before T004 (banner depends on the new field).
- T010 must land before T011–T014 (they extend the same Account-step flow).

## Verification Checklist

- [ ] All acceptance criteria (FR-001–FR-006) met
- [ ] Reproduced original P0s against current `main`/branch tip before claiming fixed (audit was against commit `5b6bbf7`; later commits may have already changed relevant code)
- [ ] `RequireAuth` still gates `/portal/*` in `src/App.tsx` — never weakened
- [ ] `npm run check` passes (typecheck, tests, build)
- [ ] Fresh, signed-out browser pass: submit CFP → verify email via Clerk OTP → redirect → own submission visible in portal
- [ ] Organizer Abstracts grid shows real text for a submission using a non-default abstract field label
- [ ] No regressions introduced to existing portal identity, route-guard, or Abstracts grid tests
- [ ] Docs updated: this plan's checkboxes, and a note back to `docs/features/speaker-portal/USER_JOURNEY.md` that these P0s were the blocker for its own "repeatable browser QA run" gap
