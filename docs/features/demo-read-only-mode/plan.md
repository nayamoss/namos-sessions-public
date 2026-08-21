# Demo Read-Only Mode — Implementation Plan

## Phase 1: Server-Side Read-Only Enforcement (do this first — it's the safety net everything else sits on)
- [ ] T001: Add `isDemoIdentity(ctx, identity)` to `convex/functions.ts` (or a new `convex/demoGuard.ts` imported there) — looks up `demo_workspaces` by `organizerUserId`/`reviewerUserId`/`speakerUserId` matching `identity.subject`, confirms `expiresAt`/`absoluteExpiresAt` are in the future, fails closed (any thrown error → treat as demo → block) per NFR-001.
- [ ] T002: Add the three indexes `isDemoIdentity` needs (`by_organizerUserId`, `by_reviewerUserId`, `by_speakerUserId`, or one combined lookup helper) to `demo_workspaces` in `convex/schema.ts` if not already coverable by an existing index — confirm first, only add what's missing.
- [ ] T003: Wrap the shared `mutation` export in `convex/functions.ts` with `customMutation`/`customCtx` from `convex-helpers/server/customFunctions`, throwing a `ConvexError({ code: "demo_read_only", ... })` before the handler runs when `isDemoIdentity` is true. Confirm `query` is untouched (reads must keep working).
- [ ] T004: Add a doc comment on the wrapper in `convex/functions.ts` (next to the existing `requireIdentity` comment) stating this check is automatic for every mutation and must never be duplicated per-file.
- [ ] T005: Write Convex tests asserting: a demo-organizer identity cannot call a representative sample of write mutations across modules — `agenda.ts`, `submissions`/`submissionEditing.ts`, `comms.ts`, `tags.ts`, `speakers.ts`, and specifically every `agentRuns.ts` export (`create`, `respond`, `retry`, `approveTaskProposal`, `approveMessageProposal`, `rejectProposal`, `cancel`) — all throw `demo_read_only`. Also assert a **non-demo** identity is unaffected (regression guard).
- [ ] T006: Write a test for the fail-closed path: force `isDemoIdentity`'s lookup to throw, assert the mutation is still blocked, not allowed through.
- [ ] T007: Confirm `internalMutation`-based demo lifecycle functions (`convex/demoWorkspaces.ts`: `provision`, `reset`, `switchRole`, `cleanupExpired`) are untouched by the wrapper and still work end-to-end (they use a different Convex primitive, called only from the trusted edge worker).

## Phase 2: Zero-Click Entry
- [ ] T008: In `worker/demo.ts`, generalize the existing `judgeEntry`/no-Turnstile branch of `createWorkspace` so the default public `/demo` route uses it (redirect straight to `/events/demo-{workspaceId}/dashboard` via the signed-in ticket) instead of requiring `POST /api/demo/workspaces` with a Turnstile token first.
- [ ] T009: Tighten the per-IP rate limit on the now-Turnstile-free create path (currently `create-v2`: 3/hour) — pick a value that still allows normal visitors through but bounds bot abuse; the existing 100-active-workspace cap and 2h/24h expiry remain as secondary backstops.
- [ ] T010: Update `src/pages/public/DemoLandingPage.tsx` so that with no `?proof=` query param, the page auto-triggers organizer entry on load and redirects immediately — no visible role-picker or Turnstile widget in the default path. Keep the manual role-picker content reachable for `?proof=` deep links (existing proof-route behavior) since those intentionally route to a specific role.
- [ ] T011: Confirm `worker/demo.test.ts` still passes and add a test for the generalized zero-click path (asserts no Turnstile token is required, 302 redirect straight to the dashboard).

## Phase 3: Frontend UI — Read-Only Affordances (REQUIRED — never skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Server-side blocking alone
> leaves visitors clicking dead buttons with no explanation — that reads as broken, not
> read-only.

### UI Spec

**`useDemoSession()` hook**
- File: `src/lib/hooks/use-demo-session.ts`
- Returns: `{ isDemo: boolean, activeRole: "organizer" | "reviewer" | "speaker" | null }`
- Data: fetches `GET /api/demo/workspaces/current` (same endpoint `DemoWorkspaceBar` already
  calls) — `credentials: "same-origin"`; 401/404 response → `{ isDemo: false, activeRole: null }`.
- Behavior: revalidates on route change, matching `DemoWorkspaceBar`'s existing `useEffect` on
  `location.pathname`.

**Read-only badge in `DemoWorkspaceBar.tsx`**
- Location: inside the existing "Demo workspace" label block (top-left of the bar).
- Elements: small lock icon (`Lock` from lucide-react) + text "Read-only" next to "Active until
  {expires}".
- Behavior: static, always shown while the bar is shown (the bar already only renders during an
  active demo session).

**Read-only banner**
- Location: top of the Program Control Room (organizer dashboard landing page) and top of
  `src/pages/program/AgentOperations.tsx` (Operations Agent panel).
- Elements: inline card (`cardSurfaceClasses("muted", ...)`) with a `ShieldCheck`/lock icon and
  the text "You're viewing a read-only demo — actions are disabled."
- Behavior: rendered only when `useDemoSession().isDemo` is true; no dismiss control (persistent,
  not a toast).
- Empty/loading/error state: none needed — pure conditional render off the hook's boolean.

**Disabled write controls, site-wide (demo session only)**
- Elements affected: every button/control that triggers a mutation and is reachable from a demo
  session — includes but is not limited to: Accept/Reject submission, Publish program, Resolve
  schedule conflict (drag-to-reschedule + explicit resolve action), Upload file (speaker
  portal + organizer-side document upload), Send/approve/reject in the Operations Agent panel,
  task-template create/edit/delete, comms template send, tag create/edit/delete, sponsor
  create/edit, embed create/edit, settings forms (event settings, organizer settings visible in
  demo).
- Behavior per element: `disabled={isDemo}` (or equivalent) on the trigger control, plus a
  `title="This is a read-only demo."` tooltip. Where the control is a full form rather than a
  single button (e.g. inline-editable fields), the field itself becomes non-editable
  (`readOnly`/`disabled`) with the same tooltip on focus/hover.
- Discovery method (implementation-time, not enumerated here since the exact file list spans
  dozens of components and will drift): `grep -rl "useMutation(" src/pages src/components` for
  every page reachable under `/events/demo-*` and `/portal`, cross-reference against
  `useDemoSession().isDemo`.
- Error fallback: if a write is attempted anyway (race between hook load and click, or a control
  missed in the sweep above) and the server throws `demo_read_only`, the existing generic
  mutation-error-toast pattern in the app displays "This is a read-only demo." (map the
  `demo_read_only` error code to that message wherever the app's toast/error-mapping layer lives).

### Tasks
- [ ] T012: Build `useDemoSession()` per the spec above.
- [ ] T013: Add the read-only badge to `DemoWorkspaceBar.tsx`.
- [ ] T014: Add the read-only banner to the organizer dashboard and `AgentOperations.tsx`.
- [ ] T015: Sweep write-capable controls reachable from a demo session (discovery method above)
  and disable each with the tooltip, prioritizing: submission accept/reject, publish, conflict
  resolution, file upload, and the Operations Agent send box first (these are the flows the
  current marketing copy specifically calls out).
- [ ] T016: Map the `demo_read_only` Convex error code to the "This is a read-only demo." toast
  message in the app's existing mutation-error handling.
- [ ] T017: Verify the full user flow end-to-end in a real browser: open `/demo` fresh (no
  cookie) → land in organizer dashboard with zero clicks → confirm every write control across all
  three roles is visibly disabled → confirm no agent message can be sent → confirm role switching
  still works → confirm Reset still works.

## Phase 4: Marketing Copy Correction
- [ ] T018: Update `namos-sessions-marketing/app/(marketing)/demo/page.tsx` — remove/rewrite any
  language implying write access: "Record an acceptance decision without sending it early,"
  "Detect and resolve a speaker or room scheduling conflict," "Send the approved decision and
  publish the program," and the "Confirmation before agent writes" highlight. Replace with
  read-only-accurate copy (e.g. "Inspect a real, fully seeded event exactly as an organizer,
  reviewer, or speaker would see it — nothing you click can change or publish anything").
- [ ] T019: Update the `proof` list and `roles` descriptions on that page to match (no
  "decide sessions," no "publish" as an action the visitor performs).
- [ ] T020: Confirm the `LIVE_DEMO_URL` link still points at the same `/demo` entry (no change to
  the link itself, only the copy describing what happens after clicking it).

## Task Dependencies
- T001–T007 (Phase 1) must land before T008–T011 (Phase 2) go live in a shared environment — the
  read-only guard must exist before the entry point is made frictionless, so a zero-click demo is
  never briefly writable.
- T012 (hook) blocks T013–T016.
- T018–T020 (marketing copy) should land after Phase 3 is verified in the browser, so the copy
  describes the actual shipped behavior rather than the plan.

## Verification Checklist

Implementation status (2026-08-20): T001–T016 are complete. T017 remains unverified because
the project dev script cannot bind its configured port in this sandbox (`listen EPERM :::8080`).
T018–T020 are skipped because the specified sibling marketing checkout is absent.
- [ ] All acceptance criteria in `requirements.md` met.
- [ ] Feature is accessible and usable in the UI — visiting `/demo` lands in the real app with
  zero clicks, and every role is browsable read-only.
- [ ] Server-side test suite (T005, T006) proves writes are blocked even if UI controls are
  bypassed (e.g. direct API call).
- [ ] No regression: non-demo (real customer) mutations still work exactly as before.
- [ ] Marketing page copy matches actual behavior.
- [ ] Docs updated if needed (this folder).
