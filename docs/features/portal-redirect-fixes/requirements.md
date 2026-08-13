# Portal Redirect Fixes — Requirements

**Type:** Bug Fix
**Status:** In Review
**Priority:** Critical
**Last Updated:** 2026-08-12

## Problem Statement

The 2026-08-11 Codex portal lifecycle audit (`test-artifacts/e2e-real-user-20260811-163018/FINAL-REPORT-CODEX-PORTAL-LIFECYCLE-AUDIT.md`, commit `5b6bbf7`) found two P0 defects in the public CFP → speaker portal path, the highest-priority judged workflow in the app:

1. **Wrong speaker after redirect.** After a public CFP submission and the timed auto-redirect to `/portal`, the portal opened as an unrelated existing speaker instead of the speaker who just submitted. The new submission was invisible to the person who made it.
2. **Missing abstract content in organizer review.** The public CFP form collects a non-empty Abstract, but the organizer's Abstracts grid and detail pane display it as `—`. Title and speaker persist correctly, so the write itself isn't failing — only this one field's display.

Both block the highest-priority judged path end-to-end and must be fixed before the portal can be considered release-ready, ahead of any further portal feature work (bios/headshots/slides/documents).

## Functional Requirements

- FR-001: A speaker who submits a public CFP form while signed out and is auto-redirected to `/portal` must land on their own speaker record, with their own new submission visible.
- FR-002: If `/portal` resolves the visitor to a *different*, already-authenticated Clerk speaker identity than the one who just submitted, the UI must make that mismatch visible rather than silently showing the wrong person's dashboard.
- FR-003: The Abstracts grid/detail pane must display the abstract text an organizer configured for that field, regardless of what label text the organizer chose for the field (e.g. "Abstract", "Session Abstract", "What will you cover?").
- FR-004: A regression test must assert that a submitted abstract answer renders in the grid when the field's label is anything other than the literal strings "abstract" / "description" / "summary".
- FR-005: A regression test must assert that an anonymous (signed-out) submitter's handoff speaker id wins the portal identity resolution when no conflicting Clerk-authenticated speaker exists.
- FR-006 (added 2026-08-12, see Phase 2b): `/portal/*` must remain fully gated by `RequireAuth`. An anonymous CFP submitter reaches the portal by verifying their email via Clerk (magic link or OTP) on the CFP's Account step, not by any weakening of that gate or any new unauthenticated data-access path.

## Out of Scope

- Email delivery / decision-email failures (P1, tracked separately, not blocking).
- Organizer auth/event-context loss on Account-menu interaction (P1, tracked separately).
- Task administration missing speaker context (P2).
- Public bio rendering literal `<p>` markup (P2).
- Availability React key warnings (P2).
- Full authenticated-speaker document/headshot/slides upload verification — that is the subject of the existing `docs/features/speaker-portal/USER_JOURNEY.md` and should be re-run only after these two P0s are confirmed fixed.

## Success Metrics

- Fresh, signed-out browser: submit CFP → auto-redirect → portal shows the submitting speaker's own new submission, not someone else's.
- Organizer Abstracts grid shows real abstract text (not `—`) for a submission whose form used a non-default abstract field label.
- `npm run check` passes with new regression tests included.
