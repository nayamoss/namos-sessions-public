# Demo Read-Only Mode — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
`convex/schema.ts` — `demo_workspaces` (existing, unchanged shape):
```
demo_workspaces: {
  workspaceId: string, organizationId: Id<"organizations">, eventId: Id<"events">,
  organizerUserId: string, reviewerUserId: string, speakerUserId: string,
  organizerEmail/reviewerEmail/speakerEmail: string,
  activeRole: "organizer" | "reviewer" | "speaker",
  createdAt/lastActiveAt/expiresAt/absoluteExpiresAt: number,
}
```
Indexed `by_workspaceId`, `by_expiresAt`, `by_event`.

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| demo_workspaces | ADD INDEX | `by_organizerUserId_reviewerUserId_speakerUserId` — not needed | — | Reuse existing rows; add a new index `by_any_user` is unnecessary — see Backend section, lookup is by Clerk `externalId` prefix, not a table scan. |
| (none) | — | — | — | No schema changes required. The guard identifies demo identities from the Clerk `externalId` pattern already stamped at creation (`namos-demo:{workspaceId}:{role}`) via `identity.subject`, cross-checked against `demo_workspaces` by the embedded workspaceId — a single indexed `by_workspaceId` lookup, not a scan. |

### Migration
None. No table or column changes.

---

## Backend / API

### Affected Existing Endpoints
| Method | Path | Change |
|--------|------|--------|
| POST | `/api/demo/workspaces` (worker/demo.ts `createWorkspace`) | Turnstile requirement removed for the default public entry; becomes the zero-click path. Rate limit tightened (see Risks). |
| ALL | Every Convex `mutation`/`internalMutation`-adjacent authenticated mutation across the app | Gains a shared demo-identity check (see below) — not individually edited per file. |

### New Endpoints
None. FR-001's "zero-click landing" reuses the existing `judgeScheduleStudio` no-Turnstile
provisioning path in `worker/demo.ts`, generalized to be the *default* `/demo` behavior instead of
a judge-only side door gated by `DEMO_JUDGE_ACCESS_KEY`.

**Change to existing internal route, not a new one:** `GET /demo` (public marketing entry) is
wired in the SPA router to call the same `createWorkspace(request, env, judgeEntry: true)` path
that `judgeScheduleStudio` already uses (no Turnstile, no body needed) — redirecting straight to
`/events/demo-{workspaceId}/dashboard` via a signed-in ticket. The existing
`POST /api/demo/workspaces` (Turnstile-gated) endpoint can be left in place unused, or removed —
implementer's call once the router change lands; either is fine since nothing else depends on it
after FR-001.

### Validation & Business Logic — The Core Change

**Single choke point: `requireIdentity` in `convex/functions.ts`.**

Every query/mutation in the app calls `requireIdentity(ctx)` first (per the file's own comment:
"Every non-public query/mutation must call this first"). This is the one place that sees every
authenticated call before any handler logic runs, which makes it the correct enforcement point —
not a per-file edit across dozens of mutation modules (`agenda.ts`, `agentRuns.ts`, `comms.ts`,
`tags.ts`, `speakers.ts`, `submissionEditing.ts`, etc.), which would be both a huge diff and a
guaranteed-to-regress pattern (any new mutation file forgets the check).

Two building blocks:

1. **`isDemoIdentity(ctx, identity)`** (new, in `convex/functions.ts` or a new
   `convex/demoGuard.ts`): given `identity.subject` (the Clerk user id), determine whether this
   user is one of the three seats of an active demo workspace. Demo Clerk users are created with
   `externalId: "namos-demo:{workspaceId}:{role}"` (see `worker/demo.ts` `createWorkspace`) — but
   Convex's `identity.subject` is the Clerk **user id**, not the externalId, so the check instead
   queries `demo_workspaces` directly: `organizerUserId == subject OR reviewerUserId == subject OR
   speakerUserId == subject`, using three point lookups against a new index
   `by_organizerUserId`, `by_reviewerUserId`, `by_speakerUserId` (three single-field indexes, or
   one composite lookup helper — implementer's call), and confirms `expiresAt > Date.now()` /
   `absoluteExpiresAt > Date.now()`. Fail closed: any error or ambiguity returns `true` (treat as
   demo → block), never `false`.

2. **`requireIdentity` gains a `write: boolean` distinction.** `convex-helpers` (already a
   dependency — `convex-helpers@^0.1.120`, confirmed in `package.json`) provides
   `customMutation`/`customCtx` from `convex-helpers/server/customFunctions`. Wrap the `mutation`
   export in `convex/functions.ts`:
   ```
   export const mutation = customMutation(rawMutation, customCtx(async (ctx) => {
     const identity = await ctx.auth.getUserIdentity();
     if (identity && await isDemoIdentity(ctx, identity)) {
       throw new ConvexError({ code: "demo_read_only", message: "This is a read-only demo." });
     }
     return {};
   }));
   ```
   This intercepts **every** mutation built on this export — including agent-run mutations
   (`agentRuns.create/.respond/.retry/.approveTaskProposal/.approveMessageProposal/.rejectProposal/.cancel`)
   and any storage-upload mutation — with zero per-file changes. Queries are unaffected (reads
   stay allowed, which is the point).

   Public/anonymous-caller mutations that don't call `requireIdentity` (e.g. the public CFP
   submission form) are explicitly out of scope per `functions.ts`'s own documented exemption
   list — demo workspaces don't expose that surface differently, so no change needed there.

3. **Internal mutations are unaffected.** `internalMutation` (used by `convex/demoWorkspaces.ts`
   itself for `provision`/`reset`/`switchRole`/`cleanupExpired`) is a separate Convex primitive
   from the browser-callable `mutation`, called only from the trusted edge worker via
   `x-namos-demo-secret` — the guard above does not wrap it, so reset/role-switch keep working
   exactly as today (FR-005).

### Enforcement Consistency (NFR-001)
`isDemoIdentity` fails closed: a thrown error inside the lookup is caught in the wrapper and
treated as "block the mutation," never as "allow it." This is checked directly in the plan's test
tasks.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/public/DemoLandingPage.tsx` | Route simplified: on load, immediately calls the zero-click provisioning flow and redirects — the current role-picker/Turnstile landing content becomes unreachable in the default flow. Keep the component (still used for `?proof=` deep links / explicit reset-then-choose-role flows) but auto-trigger organizer entry when no `?proof=` param is present, skipping the manual "Enter as" click. |
| `src/components/demo/DemoWorkspaceBar.tsx` | No structural change — role switcher and Reset stay. Add a persistent "Read-only demo" badge next to the "Demo workspace" label so the constraint is always visible, not just discovered on first blocked click. |
| Every write-capable control in every page a demo session can reach (buttons: Accept/Reject submission, Publish, Resolve conflict, Upload file, Send message, Delete, Save edits, Operations Agent send box, task-template actions, etc.) | Each gains a `disabled={isDemoReadOnly}` (or equivalent) condition sourced from the new `useDemoSession()` hook (below), plus a `title`/tooltip of "This is a read-only demo." This is UX polish on top of the server-side block (FR-006) — enumerating every such button file-by-file is implementation-time discovery via `grep -rl "mutation(" src/` cross-referenced with which pages render under `/events/demo-*` and `/portal`; not hand-listed here since the count spans dozens of files and would drift immediately. |

### New Components

**`useDemoSession()`** (hook)
- File: `src/lib/hooks/use-demo-session.ts`
- Returns: `{ isDemo: boolean, activeRole: DemoRole | null }` — reads the same
  `/api/demo/workspaces/current` state already fetched by `DemoWorkspaceBar`, lifted into a shared
  hook/context so any page can cheaply ask "is this a demo session" without a duplicate fetch.
  Implementation detail (context provider vs. simple fetch-with-cache): implementer's call.
- Location: consumed anywhere a write control needs to disable itself.
- Behavior: memoized, revalidates on route change (mirrors existing `DemoWorkspaceBar` refresh
  behavior).
- Third-party: none — plain fetch, matches the existing pattern already in
  `DemoWorkspaceBar.tsx`.

**Read-only banner on write-heavy surfaces** (e.g. Program Control Room, Agent Operations page)
- No new file — reuse `cardSurfaceClasses("muted", ...)` inline banner pattern already used
  elsewhere in the demo components (`DemoLandingPage.tsx` uses this pattern for its highlight
  strip).
- Elements: `ShieldCheck`/lock icon + "You're viewing a read-only demo — actions are disabled."
  text.
- Location: top of `Program Control Room` (organizer dashboard) and the Operations Agent panel
  (`src/pages/program/AgentOperations.tsx`) specifically, since those are the two most
  write-suggestive surfaces.
- Behavior: static, rendered only when `useDemoSession().isDemo` is true.
- Empty/loading/error states: N/A — purely conditional render, no own data fetch.

---

## State / Data Flow
- Demo-session state originates from the signed HttpOnly cookie set by `worker/demo.ts`, read via
  `GET /api/demo/workspaces/current`.
- `useDemoSession()` fetches that same endpoint (already CORS/same-origin safe, already used by
  `DemoWorkspaceBar`) and exposes `isDemo` to any component.
- The authoritative block is server-side in Convex (`customMutation` wrapper) — the frontend flag
  is purely a UX nicety layered on top; a stale/missing frontend flag can never itself cause an
  unintended write, since the Convex layer checks the real Clerk identity, not client state.
- Re-render trigger: route change (existing `DemoWorkspaceBar` pattern), or the hook's own
  interval/revalidation if implemented as SWR-style.

---

## Auth / Permissions
- Demo Clerk users are real, ordinary Clerk users (organizer/reviewer/speaker role in the seeded
  event) — they pass every existing `requireIdentity`/`isOrganizerOf`/`assertEventAccess` check
  exactly as a real customer would. The new guard is additive: identity passes normal auth, then
  is separately blocked at the mutation-wrapper level if it resolves to a demo workspace.
- No change to `auth.config.ts`, Clerk JWT template, or any existing role/permission table.
- The zero-click entry (`judgeEntry` provisioning path) still creates a short-lived signed-in
  ticket exactly as today — no change to how the session itself is established, only to whether a
  human has to click a button first.

---

## Edge Cases & Error States
- **Demo workspace expired mid-session, user attempts any read:** unaffected — existing
  `requireWorkspace`/Convex `expiresAt` checks in `worker/demo.ts` already 401 and clear the
  cookie; frontend already handles this (`DemoWorkspaceBar` shows "This demo workspace has
  expired.").
- **Demo workspace expired mid-session, user attempts a write:** blocked twice over — the
  mutation-layer guard rejects it regardless of expiry status (fail-closed on any lookup issue),
  and the workspace-expiry path would have already logged them out via the existing flow.
- **User opens two tabs, tries a write in one while `useDemoSession()` hasn't loaded in the
  other:** irrelevant — server-side guard is authoritative; a UI that hasn't loaded the flag yet
  just means the button briefly isn't disabled, but the mutation still throws `demo_read_only`
  server-side. Frontend should catch that error generically (existing error-toast pattern) and
  show "This is a read-only demo," same message as the disabled-button tooltip.
- **Rate limit exhausted on the now-Turnstile-free create path:** existing `rate_limited` (429)
  response and UI message in `DemoLandingPage.tsx` already handle this — no new state needed,
  just re-tune the limit (NFR-002).
- **Non-demo mutation calls during the rollout window (before/after deploy mismatch):** N/A — this
  is a single-repo, single-deploy change; no client/server version skew concern beyond normal
  Cloudflare Worker + Convex deploy ordering (deploy Convex functions first, then the worker/SPA,
  standard practice already followed in this repo per `namos-sessions-convex-deployments`
  guidance).

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to enforce read-only | Single `customMutation` wrapper around the shared `mutation` export in `convex/functions.ts` | Every mutation in the app already funnels through `requireIdentity`; wrapping the export covers all current and future mutations with one change instead of editing dozens of files (and prevents regression when new mutations are added later). |
| How to detect a demo identity | Query `demo_workspaces` by the three user-id fields, fail closed | Reuses existing schema/data, no new table; failing closed matches NFR-001. |
| Zero-click entry mechanism | Generalize the existing `judgeEntry` no-Turnstile path in `worker/demo.ts` (currently gated behind `DEMO_JUDGE_ACCESS_KEY` for `/demo/schedule-studio`) into the default `/demo` flow | That code path already does exactly what's needed (skip Turnstile, skip role confirmation, redirect straight into the app) — it exists today for judges, just needs to become the default rather than a side door. |
| Role switching | Keep (per Naya's decision) | Preserves the real app's structure; role-scoped views are core to the product being demoed. Read-only applies identically across all three roles via the same server-side guard. |
| Turnstile | Remove from default `/demo` entry (per Naya's decision) | True zero-friction entry; abuse risk is covered by tightened per-IP rate limiting instead, since a read-only demo has much lower blast radius than the current write-capable one. |
| Agent messaging | Blocked via the same mutation guard, no separate agent-specific code path | `agentRuns.create` etc. are ordinary Convex mutations — the general guard already covers them; a bespoke "agent-specific" block would be redundant and another place to drift out of sync. |

## Dependencies
**Requires:** `convex-helpers` (already installed, `^0.1.120` in `package.json`) —
`customMutation`/`customCtx` from `convex-helpers/server/customFunctions`.
**Enables:** A safe, linkable, always-current public demo that can be shared without abuse or
cost risk; unblocks correcting the marketing page copy (FR-008) to make an honest claim.

## Risks & Mitigations
- **Risk:** Removing Turnstile increases bot-driven workspace creation (each creates 3 real Clerk
  users, counted against Clerk's MAU-ish limits and workspace capacity — existing 100-workspace
  cap in `provision`).
  **Mitigation:** Tighten the existing per-IP `rate_limit` for the create path (currently
  `create-v2`: 3/hour, `judge-entry`: 10/hour) now that it's the only gate; existing 100-active-
  workspace cap and 2h idle / 24h absolute expiry already bound worst-case load.
- **Risk:** A future mutation file is added without realizing it's covered by the wrapper, and a
  contributor adds a manual (now-redundant, possibly inconsistent) demo check inline, causing
  drift.
  **Mitigation:** Document the wrapper prominently in `convex/functions.ts`'s existing header
  comment block (which already documents the `requireIdentity` convention) — implementer should
  add a line noting the demo guard is automatic and must not be duplicated per-file.
- **Risk:** `isDemoIdentity`'s three-field lookup adds a small per-mutation latency cost to
  *every* mutation in the app, including all real customer traffic.
  **Mitigation:** Each lookup is a single indexed point-read (NFR-003); Convex indexed reads are
  low-latency. If this becomes measurable, an alternative is stamping demo Clerk users'
  `publicMetadata` (already has `namosDemoWorkspaceId`/`namosDemoRole` in `privateMetadata` at
  creation, per `worker/demo.ts`) into the Clerk JWT session claims so `identity` itself carries
  the flag with zero DB lookup — noted as a follow-up optimization, not required for correctness.
