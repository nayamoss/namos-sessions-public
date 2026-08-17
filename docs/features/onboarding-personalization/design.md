# Onboarding Personalization — Technical Design

## Database / Schema Changes

### Current Schema (affected table)

`convex/schema.ts` — `organizers`:
```ts
organizers: defineTable({
  userId: v.string(),
  email: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin")),
  onboardingCompletedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_userId", ["userId"]).index("by_email", ["email"]),
```

This is the per-person record (one row per Clerk identity with organizer/owner access) — the
right place for signup-identity data, not `events` (which is per-conference and can have
multiple organizers).

### Required Changes

| Table | Action | Column | Type | Notes |
|-------|--------|--------|------|-------|
| organizers | ADD COLUMN | `signupRole` | `v.optional(v.union(v.literal("solo"), v.literal("team")))` | Named `signupRole` (not `role`) — `role` already means owner/admin permission level, must not collide. |
| organizers | ADD COLUMN | `referralSource` | `v.optional(v.string())` | Free-form string; UI constrains to a fixed option list + "Other" (typed), stored as plain text either way — avoids a second schema migration if the option list changes. |

### Migration

Both columns are `v.optional` — Convex allows additive optional fields with no backfill and no
downtime; existing rows simply read as `undefined` for both. No data migration script needed.

---

## Backend / API

### Affected Existing Endpoints
None modified.

### New Endpoints (Convex functions, `convex/userProfiles.ts`)

**Implementation note (post-planning revision):** originally planned against `organizers`, keyed
off the caller's `organizers` row. That table only ever has a row for the one-time bootstrap
owner or someone an owner explicitly adds — a normal user creating their first event never gets
one, so the mutation as originally planned would have silently no-op'd for nearly every real
signup. Moved to a new `userProfiles` table keyed purely on `identity.subject`, with no
authorization meaning at all. `OrganizersRepo`/`convex/organizers.ts` below should be read as
`ProfilesRepo`/`convex/userProfiles.ts`.

| Kind | Name | Args | Behavior |
|------|------|------|----------|
| mutation | `profiles.save` | `{ signupRole?: "solo" \| "team", referralSource?: string, displayName?: string }` | Requires identity via `requireIdentity`. Looks up (or creates) the caller's `userProfiles` row by `identity.subject` — never gated on an `organizers`/`event_members` row existing. Patches only the fields provided; never overwrites an existing answer with `undefined`. |

### Validation & Business Logic
- Trim `referralSource`; cap at 200 chars server-side (defense against a runaway "Other" text
  field) — reject nothing, just truncate.
- No admin-only gate needed: a user may only ever write their own row, resolved from
  `identity.subject`/`identity.email`, exactly like `completeOnboarding` — never from a
  client-supplied id.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/onboarding/OnboardingWizard.tsx` | Insert new step between Welcome and Your Conference; renumber `stepMeta`/`next()`/`goBack()` step indices; collapse conference-details step to name-only with defaults; wire the new step to `repo.profiles.save`. |
| `src/data/repo.ts` | New `ProfilesRepo` interface: `save(input: { signupRole?: "solo" \| "team"; referralSource?: string; displayName?: string }): Promise<void>`. |
| `src/data/transport.ts` | Implement `ProfilesRepo` against the new `profiles.save`/`profiles.getMine` operations. |
| `src/components/shared/DateTimeField.tsx` | Time input width `w-[7.5rem]` → `w-[10rem]` (already applied — fixes the clipped "08:44 PM" bug reported in prod). |

### New Components

**`IdentityStep`** (inline section within `OnboardingWizard.tsx`, matching the existing pattern
where each step is a `<section>` block rather than a separate file — consistent with steps 0–2
today; only `ImportDataStep` is split out because it's substantially larger)

- File: inline in `src/pages/onboarding/OnboardingWizard.tsx` (new `step === 1` block)
- Location: Onboarding wizard, step 2 of 5 (between Welcome and Your Conference)
- Elements:
  - H1: "A couple quick things"
  - Subtext: "Helps us set things up right for you — skip if you'd rather not say."
  - Label: "Are you running this solo or with a team?"
  - Two-option segmented control (not a native radio, not a dropdown): `Solo` / `With a team`
    buttons side by side, `bg-card` unselected → `bg-primary` accent + dark text when selected,
    `rounded-[10px]`, no border, no shadow, per the design system
  - Label: "How did you hear about us?"
  - `Select` (existing shadcn Select component, already used elsewhere in the wizard's
    dependency tree) with options: `Search`, `Social media`, `A colleague or friend`,
    `Another conference tool`, `Other`
  - When `Other` is selected: a follow-up `Input` appears inline below it, placeholder "Tell us
    more" — same `h-11 rounded-[12px] bg-card` styling as every other input in this wizard
  - Error state: none — this step cannot fail validation, everything is optional
  - Back / Continue buttons, same `Button`/`PrimaryButton` components and layout as every other
    step (`Back` outline button + `PrimaryButton` "Continue")
  - `Skip this step` ghost button, same placement/style as the existing skip buttons on steps
    2–3 today (email, import) — `canSkip` threshold moves from `step >= 2` to `step >= 1`
- Behavior:
  - Selecting a segmented-control option updates local `event`-sibling state (new
    `identity: { signupRole?: "solo" | "team"; referralSource?: string }` state alongside the
    existing `event` state — not merged into `Event`, since it isn't event data)
  - Continue (or Enter, via the existing keyboard handler) calls
    `repo.profiles.save(identity)` best-effort: fire the mutation, advance
    regardless of success/failure (a lost analytics field is not worth blocking setup over), log
    failure to console via the existing `friendlyErrorMessage` pattern only if it throws
  - Skip advances without calling the mutation at all
- Data: writes via `repo.profiles.save`; nothing read on this step

**Collapsed "Your conference" step** (modifies the existing `step === 1` block, becomes
`step === 2`)
- Location: unchanged position relative to conference creation (now step 3 of 5)
- Elements:
  - H1: "Name your conference" (was "Tell us about your conference")
  - Subtext: "We've filled in sensible defaults below — change anything now, or later in
    Settings → Event Details."
  - Conference name `Input` — unchanged, still the only required field, still auto-focused
  - Everything else (URL slug, event type, timezone, starts-at, ends-at) moves inside a
    collapsed `Collapsible` (existing Radix dependency, already installed) trigger labeled
    "Customize details" with a chevron icon; collapsed by default. Same fields, same components
    (`TimezoneCombobox`, `DateTimeField` ×2), unchanged behavior — only their default visibility
    changes.
  - Defaults computed once when the step is first entered (not on every render): `timezone` from
    `getBrowserTimezone()` (already the default), `startDate` = now + 14 days at a fixed sane
    time (e.g. 9:00 AM local), `endDate` = `startDate` + 1 day, `type` = "Conference" (unchanged
    default), `slug` auto-derived from name as today.
  - Error state: unchanged (conference name required message)
- Behavior: unchanged Continue/Back logic — `repo.events.save` still fires on Continue with
  whatever values are current (defaults if the organizer never opened "Customize details").

---

## State / Data Flow

New local state in `OnboardingWizard`:
```ts
const [identity, setIdentity] = useState<{ signupRole?: "solo" | "team"; referralSource?: string }>({});
```
Lives alongside `event` state, not inside it. Flows: user interacts with segmented
control/Select → `setIdentity` → on Continue, `repo.profiles.save(identity)`
→ Convex mutation patches the `organizers` row → no re-fetch needed, wizard advances
optimistically (same pattern `next()` already uses for the event-save step, which calls
`update({ id })` immediately after `repo.events.save` resolves rather than re-querying).

## Auth / Permissions
Identical to `completeOnboarding` today: `requireIdentity` resolves the caller from the Convex
auth context (never from client input); the mutation only ever patches the row matching that
identity's `userId`/`email`. No new permission tier.

## Edge Cases & Error States
- Organizer row doesn't exist yet when the identity step is reached (shouldn't happen in the
  normal flow, since `claimOwner`/existing-organizer check runs on step 0 — but reloads mid-flow
  are possible): mutation no-ops instead of throwing; step still advances.
- Mutation network failure: caught, logged via `friendlyErrorMessage`, step still advances —
  this data is valuable but never worth blocking setup over (matches NFR-001/002).
- "Other" selected then left blank: stored as `referralSource: "Other"` (the select value)
  rather than an empty string, so it's still a usable signal.
- Organizer skips step 2 entirely: both fields stay `undefined` forever, distinguishable from "asked and declined" only in that we don't currently store a distinct "skipped" sentinel — acceptable for v1 per requirements (Out of Scope covers deeper progressive profiling).

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Store fields on `organizers`, not `events` | `organizers` | Identity is a property of the person, not the conference; an organizer may create multiple events later. |
| Field name `signupRole` not `role` | `signupRole` | `organizers.role` already means owner/admin permission — reusing the name would silently corrupt permission data. |
| `referralSource` as free string, not enum | `v.string()` | UI presents a fixed list, but storing free text avoids a schema migration every time marketing wants to add/remove a channel option. |
| Best-effort save, never blocking | fire-and-forget on Continue | Matches NFR-001/002 — this is enrichment data, not critical-path data. |
| Collapsible advanced fields vs. deleting them | Collapsible, not removed | Timezone/dates still need to be set correctly for real conferences; hiding by default (with sane auto-computed defaults) removes the friction without removing the capability. |

## Dependencies
**Requires:** none (all UI primitives — `Select`, `Collapsible` — are already installed
dependencies per `package.json`).
**Enables:** future progressive-profiling / segmented-onboarding work (e.g. "invite your team"
nudge for `signupRole: "team"` accounts) — out of scope here, but this is the data foundation
for it.

## Risks & Mitigations
- **Risk:** renumbering steps breaks the `__debugStep` URL param used for QA/dev.
  **Mitigation:** update any hardcoded step-index references alongside `stepMeta`; sweep the
  codebase for `__debugStep=` usages in docs/tests before merging.
- **Risk:** collapsing fields by default means an organizer picks the wrong timezone without
  noticing. **Mitigation:** browser-detected timezone is already the status quo default today
  (nothing gets worse); the "Customize details" section stays one click away, not hidden behind
  a separate page.
