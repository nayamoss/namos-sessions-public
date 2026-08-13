# Organizer Onboarding Wizard — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
```ts
// convex/schema.ts
organizers: defineTable({
  userId: v.string(),
  email: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin")),
  createdAt: v.number(),
}).index("by_userId", ["userId"]),

events: defineTable({
  name: v.string(), slug: v.string(), /* ... */ status: v.union(...),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),

submission_forms: defineTable({ eventId: v.id("events"), internalName: v.string(), kind: v.union(
  v.literal("abstract"), v.literal("session"), v.literal("contact"), v.literal("group"), v.literal("submission_task")
), /* ... */ }).index("by_event", ["eventId"]),

submissions: defineTable({ eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.optional(v.id("speakers")),
  title: v.string(), status: v.union(...), answers: v.any(), /* ... */ }).index("by_event", [...]),

speakers: defineTable({ eventId: v.id("events"), email: v.string(), firstName: v.string(), lastName: v.string(),
  bio: v.optional(v.string()), status: v.union(...), /* ... */ }).index("by_event_email", ["eventId", "email"]),
```

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| organizers | ADD COLUMN | `onboardingCompletedAt` | `v.optional(v.number())` | Unset = onboarding incomplete. Set by the organizer's own `organizers.completeOnboarding` mutation. |

No new tables. Imported speakers/submissions use the existing `speakers` and `submissions`
tables. A CSV-imported "past talk" needs a `submission_forms` row to hang off (schema requires
`formId`) — reuse a single synthetic form per event rather than adding a table:
- On first CSV import for an event, look up a `submission_forms` row with
  `internalName === "Imported from CSV"` for that `eventId`; create it if absent, never shown on
  any public submit page since nothing links to it from `/submit/:eventSlug/:formId`. Every field
  on `submission_forms` is required except `routingRules`/`closeDate`/`submissionLimit`/
  `successPageMessage`/`portalFormSettings` (see `convex/schema.ts`) — insert with exactly:
  ```ts
  {
    eventId, internalName: "Imported from CSV", externalTitle: "Imported from CSV",
    pageHeading: "Imported", version: 1, kind: "session", collectParticipants: false,
    showWelcomeMessage: false, sections: [], participantRoles: [], crossFieldLimits: [],
    allowMultipleDrafts: false, autoRedirectToPortal: false, reminderEmailEnabled: false,
    adminUserIds: [], notifyAdminsOnNew: [], notifyAdminsOnUpdate: [],
    sendSubmitterConfirmation: false, status: "closed", createdAt: now, updatedAt: now,
  }
  ```
  (`pageHeading` must be ≤15 characters — `forms.save` enforces this; `"Imported"` is 8.)
- Every imported talk becomes a `submissions` row with `formId` = that synthetic form,
  `status: "accepted"` (it already happened), `answers: { abstract: <talkAbstract ?? "">}`.

### Migration
Additive optional field on an existing table — no backfill required. Existing `organizers` rows
without `onboardingCompletedAt` are treated as "onboarding incomplete," which is correct: no
current organizer has been through this wizard.

---

## Backend / API

### Affected Existing Endpoints
| Method | Path (Convex function) | Change |
|--------|------|--------|
| `organizers.isCurrentUserOrganizer` (query) | — | No signature change. Continue using for the pre-claim check. |
| `src/pages/dashboard/DashboardHome.tsx` claim-owner banner | — | Removed; the same `repo.organizers.claimOwner()` call moves into onboarding Step 1. |

### New Endpoints (all in `convex/organizers.ts` unless noted)
| Function | Type | Args | Response | Notes |
|--------|------|--------------|----------|---|
| `organizers.getMine` | query | `{}` | `Organizer \| null` | Requires identity only (not `assertOrganizer` — must work for a not-yet-organizer to read "no row yet"). Returns the caller's own row including `onboardingCompletedAt`. |
| `organizers.completeOnboarding` | mutation | `{}` | `void` | `assertOrganizer`; patches the caller's own row: `onboardingCompletedAt: Date.now()`. |
| `speakers.bulkImport` (`convex/speakers.ts`) | mutation | `{ eventId: v.id("events"), rows: v.array(v.object({ firstName: v.string(), lastName: v.string(), email: v.string(), bio: v.optional(v.string()), talkTitle: v.optional(v.string()), talkAbstract: v.optional(v.string()) })) }` | `{ importedSpeakers: number, importedTalks: number, skipped: Array<{ row: number, reason: string }> }` | `assertOrganizer`. Caps `rows.length` at 500 (matches NFR-002). Reuses `requiredSpeakerText`/`normalizedSpeakerEmail` already in `speakers.ts`. Per row: validate → skip existing email (by `by_event_email`) → insert speaker → if `talkTitle` present, ensure/create the synthetic import form (see Schema) and insert a `submissions` row. Runs as one mutation so a partial failure never leaves the CSV half-imported silently — invalid rows are collected into `skipped` and reported, valid rows still commit. |

### Validation & Business Logic
- Email: reuse `normalizedSpeakerEmail` (lowercase, trimmed, regex-checked) from `speakers.ts`.
- Name: reuse `requiredSpeakerText` (non-empty, ≤200 chars).
- Duplicate handling: an existing speaker for `(eventId, email)` is skipped with
  `reason: "Speaker with this email already exists for this event"` — never overwritten, matching
  `speakers.create`'s existing duplicate behavior.
- Row cap: reject the whole call with a clear error if `rows.length > 500` (client also enforces
  this before calling, per NFR-002, so the organizer sees it before submitting).
- `events.save` (existing, unchanged) is reused as-is for Step 2 — no new validation beyond what
  `assertEventSchedule` already does.
- Email integration Step 3 reuses `emailIntegrations.save`/`.status`/`.test` unchanged.

### Airtable adapter
Add to `src/data/airtable/index.ts`'s operation router:
```ts
if (operation === "organizers.getMine" || operation === "organizers.completeOnboarding" || operation === "speakers.bulkImport")
  throw new Error("Airtable does not yet provide the organizer/RBAC boundary.");
```
(Extends the existing `operation.startsWith("organizers.")` line already there for the first two;
add `speakers.bulkImport` explicitly since `speakers.*` isn't otherwise blocked.)

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/App.tsx` | Add `/onboarding` route inside `RequireAuth` (see routing note below); add the onboarding redirect guard. |
| `src/pages/dashboard/DashboardHome.tsx` | Remove the `// TEMPORARY` claim-owner banner, `claiming`/`claimError`/`claimed` state, and `claimOwner` callback — this moves to onboarding Step 1. Keep `needsOwnerClaim`'s underlying error handling removed since the redirect guard now catches this case before the dashboard ever renders. |
| `src/pages/settings/EmailDelivery.tsx` | Extract the connect-form body (provider/auth-method selection, credential fields, save/test/disconnect) into a new shared component (see below); `EmailDelivery` becomes a thin wrapper passing `eventId`. |
| `convex/schema.ts` | Add `onboardingCompletedAt` to `organizers`. |
| `convex/organizers.ts` | Add `getMine`, `completeOnboarding`. |
| `convex/speakers.ts` | Add `bulkImport`. |
| `src/data/types.ts` | Add `onboardingCompletedAt?: number` to `Organizer`; add `SpeakerImportRow`, `SpeakerImportResult` types. |
| `src/data/repo.ts` | Extend `OrganizersRepo` with `getMine()`/`completeOnboarding()`; extend `SpeakersRepo` with `bulkImport(input)`. |
| `src/data/convex/index.ts` | Wire the three new operations to their Convex functions. |
| `src/data/airtable/index.ts` | Block the three new operations (see Airtable adapter above). |

### New Components

**`OnboardingWizard`** (page)
- File: `src/pages/onboarding/OnboardingWizard.tsx`
- Props: none (route-level page)
- Location: new route `/onboarding`, rendered inside `PublicLayout` (reused as-is — it's just a
  centered, sidebar-free container; no props change needed) width `"wide"`, wrapped in
  `RequireAuth` (needs a signed-in session to know who's onboarding) but deliberately outside
  `AppLayout`.
- Elements:
  - Page heading: "Set up your conference" (`text-xl font-semibold`) + subtitle "This takes about
    2 minutes. You can skip any step and come back later."
  - `WizardShell` (`src/components/shared/WizardShell.tsx`, reused as-is) with 4 steps:
    `welcome`, `conference`, `email`, `import`
  - Global error line (`role="alert"`) above the step content, same pattern as `EventDetails.tsx`
  - Step content per step below
  - Wizard-level "Skip for now" text link next to the `WizardShell` Next/Back row on steps 3–4
    only (steps 1–2 have no skip — identity claim and a conference name are mandatory)
  - Final step's primary button reads "Finish" (via `WizardShell`'s existing
    `activeStep === steps.length - 1 ? "Save" : "Next"` — pass a custom final label, see Tasks)
- Behavior:
  - On mount: calls `repo.organizers.getMine()` and `repo.events.list()`. If an event already
    exists, pre-fills Step 2 with it (supports FR-008 re-entry).
  - Step 1 → Step 2: if `getMine()` returned `null`, calls `repo.organizers.claimOwner()` first;
    surfaces its error inline (e.g. "an owner already exists") without advancing.
  - Finish: calls `repo.organizers.completeOnboarding()` then `navigate("/dashboard")`.
  - Back/Next delegate to `WizardShell`'s existing `onStepChange`/`onBack`/`onNext`.

**Step 1 — `WelcomeStep`**
- File: `src/pages/onboarding/steps/WelcomeStep.tsx`
- Props: `{ email: string; claiming: boolean; claimError?: string }`
- Elements:
  - Heading "Welcome" + short copy: "You're signed in as:"
  - Read-only field showing the Clerk account email (`<Input value={email} disabled />` with a
    `Label`, same `Field` pattern as `EventDetails.tsx`)
  - Inline error text (`role="alert"`, `text-sm text-destructive`) shown only if `claimError` set
  - No skip button (mandatory step)
- Behavior: purely display — the actual `claimOwner()` call is triggered by the wizard's Next
  button, not by anything inside this step.

**Step 2 — `ConferenceDetailsStep`**
- File: `src/pages/onboarding/steps/ConferenceDetailsStep.tsx`
- Props: `{ event: Omit<Event,"id"> & { id?: EventId }; onChange: (event) => void; error?: string }`
- Elements:
  - `Field label="Conference name *"` → `Input`, autofocus
  - `Field label="URL slug"` → `Input`, auto-derived from name via a slugify helper on every
    name keystroke unless the organizer has manually edited the slug field (same "auto until
    touched" pattern commonly used — implement as a local `slugTouched` boolean)
  - `Field label="Conference type"` → `Input` (defaults `"Conference"`, matches `blankEvent` in
    `EventDetails.tsx`)
  - `Field label="Timezone"` → `Input`, defaulted to `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - Two-column row: `Field label="Starts"` / `Field label="Ends"` → `Input type="datetime-local"`,
    reusing `toDateTimeLocalValue`/`parseDateTimeLocalValue` from `EventDetails.tsx` (move them to
    `src/lib/` so both files import instead of duplicating)
  - Helper text under the group: "You can add rooms, tracks, and full event settings later from
    Settings → Event Details."
  - No skip button (mandatory step — an event must exist for later steps to attach to)
- Behavior: on Next, calls `repo.events.save(event)` (existing mutation, unchanged); blocks
  advancing and shows the thrown error inline if the slug is taken or dates are invalid
  (`assertEventSchedule` already enforces end > start).

**Step 3 — `ConnectEmailStep`**
- File: `src/pages/onboarding/steps/ConnectEmailStep.tsx`
- Props: `{ eventId: EventId }`
- Elements: renders the new shared `EmailIntegrationForm` component (see below) — no extra chrome
  beyond a heading "Connect email delivery" + subtitle "Needed to send submission confirmations,
  decisions, and reminders. You can skip this and connect it later from Settings."
  - "Skip this step" link/button, secondary style, next to Back/Next
- Behavior: identical to today's `EmailDelivery` page for the connect/test/save flow, just
  embedded. Advancing past this step does not require a successful connection.

**`EmailIntegrationForm`** (extracted shared component — not new business logic, a refactor)
- File: `src/components/shared/EmailIntegrationForm.tsx`
- Props: `{ eventId: EventId }`
- Extracted verbatim from the body of `src/pages/settings/EmailDelivery.tsx` (provider segmented
  control, auth-method segmented control, credential fields, sender/region fields, Save/Test/
  Disconnect buttons, all existing state and validation from `@/lib/email-integration-form`).
  `EmailDelivery.tsx` becomes `<AppLayout title="Email Delivery"><EmailIntegrationForm eventId={event.id} /></AppLayout>` plus its own load-event/loading/error wrapper (unchanged).

**Step 4 — `ImportDataStep`**
- File: `src/pages/onboarding/steps/ImportDataStep.tsx`
- Props: `{ eventId: EventId }`
- Elements:
  - Heading "Import from a previous conference" + subtitle "Bring over speakers and past talks
    from a CSV export."
  - "Download CSV template" link/button (secondary) — generates and downloads a static CSV with
    header row `firstName,lastName,email,bio,talkTitle,talkAbstract` and one example row,
    client-side (Blob + `<a download>`, no server round-trip)
  - File picker: `<input type="file" accept=".csv,text/csv">` styled as a dashed-border-free drop
    card (`bg-neutral-100 rounded-[12px] p-8`, per design system — icon `Upload` from lucide,
    heading "Drop a CSV file or click to choose", subtext "firstName, lastName, email required.
    bio, talkTitle, talkAbstract optional.")
  - Once a file is chosen and parsed:
    - Preview table (scrollable, `overflow-x-auto` container per artifact/table rules — this is a
      normal app page, not an Artifact, but the same "no horizontal page scroll" instinct
      applies): columns First name, Last name, Email, Talk title, Status
      - Status cell: "Ready" (muted) or the validation error in `text-destructive`
    - Summary line above the table: "12 rows ready to import, 2 rows have errors and will be
      skipped."
    - "Import N speakers" primary button (disabled while zero valid rows)
    - "Choose a different file" secondary button/link to reset
  - Loading state: while parsing, a `SkeletonList` (reuse `src/components/shared/SkeletonList.tsx`)
    in place of the preview table
  - Result state after import: replace the table with a summary card — "Imported 12 speakers and
    5 talks. 2 rows were skipped: [list reasons]." + "Done" (advances to Finish)
  - Empty state (no file chosen yet): the file-picker card described above, no table
  - "Skip this step" link/button, secondary style, next to Back/Finish
- Behavior:
  - File selection → read as text (`FileReader`/`file.text()`) → parse with `papaparse`
    (`Papa.parse(text, { header: true, skipEmptyLines: true })`) → client-side validate each row
    (same rules as server: non-empty name/email, valid email regex, row count ≤ 500) → render
    preview.
  - Rows failing validation are marked invalid in the preview and excluded from the count sent to
    `speakers.bulkImport`; the mutation's own `skipped` result (email-already-exists case) is
    merged into the same summary after the call returns.
  - "Import N speakers" calls `repo.speakers.bulkImport({ eventId, rows: validRows })`.

### Third-party
- **papaparse** (`^5.4.x`) + `@types/papaparse` — new dependency for CSV parsing. Chosen over a
  hand-rolled splitter because real CSV exports (Google Sheets, Sessionize) routinely contain
  quoted fields with embedded commas/newlines, which a naive `split(",")` breaks on. Client-side
  only; no server-side parsing.

---

## State / Data Flow
- `OnboardingWizard` owns `activeStep` (number) and the in-progress `event` draft; each step
  component is controlled (props in, `onChange`/callbacks out) — same pattern as
  `SubmissionFormBuilder.tsx`'s use of `WizardShell`.
- Data origin: Convex queries via `useRepo()` (`RepoProvider`, already wraps the whole app in
  `App.tsx`) — no new global store.
- Data flow: Convex mutation → `repo.*` call resolves → local wizard state updates →
  `WizardShell` advances `activeStep` → next step's props reflect the now-persisted `event`/
  `eventId`.
- Re-render triggers: standard React state updates from the async calls above; no polling, no
  subscriptions beyond what `useRepo`'s Convex adapter already does elsewhere.
- The redirect guard (`App.tsx`) re-runs its `organizers.getMine()`/`events.list()` check on every
  navigation via a small wrapper component around `<Outlet />` (see Routing below) — it does not
  need to be globally reactive beyond normal React Router re-renders, since the only way
  `onboardingCompletedAt` changes is the Finish action, which already `navigate()`s away.

### Routing (in `src/App.tsx`)
```tsx
function RequireOnboarding() {
  const repo = useRepo();
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "incomplete" | "complete">("loading");
  useEffect(() => {
    let cancelled = false;
    repo.organizers.getMine()
      .then((organizer) => { if (!cancelled) setStatus(organizer?.onboardingCompletedAt ? "complete" : "incomplete"); })
      .catch(() => { if (!cancelled) setStatus("incomplete"); }); // no row yet == incomplete
    return () => { cancelled = true; };
  }, [repo, location.pathname]);
  if (status === "loading") return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (status === "incomplete" && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
```
Mount `<Route element={<RequireOnboarding />}>` as a layer inside the existing `RequireAuth`
wrapper, wrapping every **organizer-facing** route currently under `RequireAuth` — `/dashboard`,
`/dashboard/speakers`, `/program/*`, `/settings/*`, `/portals/forms`, `/portals/tasks` — but
**excluding two things**:
- the new `/onboarding` route itself, which stays a direct sibling inside `RequireAuth`
  (signed-in but not gated on onboarding status — otherwise visiting `/onboarding` while
  incomplete would redirect to itself, which is harmless but pointless; keeping it as a plain
  sibling avoids the extra round trip and the redirect-loop edge case NFR-003 calls out)
- **`/portal/*`**, which also stays a direct sibling inside `RequireAuth`. This is the
  speaker-facing portal (`PortalHome`), not an organizer surface — a signed-in speaker has no
  `organizers` row at all and must never be redirected into an organizer onboarding wizard.
  `App.tsx`'s existing comment on `RequireAuth` already flags `/portal/*` as speaker-facing;
  `RequireOnboarding` must not blanket-wrap "everything under `RequireAuth`" or it silently locks
  every speaker out of the portal. This was a real gap in an earlier draft of this design — see
  plan.md T011 for the corrected route tree.

The public `/e/:eventSlug/:feed` and `/submit/:eventSlug/:formId` routes stay outside
`RequireAuth` entirely, unaffected.

---

## Auth / Permissions
- Every onboarding route requires a signed-in Clerk session (`RequireAuth`, unchanged).
- `organizers.getMine` requires identity but not an existing organizer row (must answer "you have
  no row yet" for a genuinely new user) — this is the one query in the onboarding flow that
  intentionally does not call `assertOrganizer`.
- `organizers.claimOwner` (existing, unchanged): self-limiting, only works while the `organizers`
  table is empty.
- `organizers.completeOnboarding`, `speakers.bulkImport`, `events.save`, `emailIntegrations.save`:
  all require `assertOrganizer` (existing pattern) — a signed-in non-organizer cannot reach these
  writes even by hitting the Convex function directly.
- No new roles or permission tiers introduced.

---

## Edge Cases & Error States
- **Loading**: `OnboardingWizard` shows a `SkeletonList` while its initial `getMine()`/
  `events.list()` load is in flight, matching `EventDetails.tsx`'s loading pattern.
- **Empty state — Step 4 before a file is chosen**: file-picker card described above, no table,
  no error.
- **API failure — claim owner**: "an owner already exists" (existing message from
  `organizers.claimOwner`) shown inline on Step 1; user cannot proceed by claiming, but *can*
  still proceed if they already have an organizer row from a prior claim (re-check `getMine()`
  before treating this as blocking).
- **API failure — event save**: existing `assertEventSchedule` errors ("An event must end after
  it starts.", "That event slug is already in use.") surfaced inline above the step, same as
  `EventDetails.tsx` today.
- **API failure — email connect**: unchanged, existing `EmailIntegrationForm` error handling.
- **API failure — CSV import**: mutation error (e.g. row cap exceeded) shown as a page-level
  alert above the preview table; already-parsed preview stays intact so the organizer doesn't
  have to re-upload.
- **Malformed CSV** (unparseable, wrong headers, empty file): "This file doesn't look like a
  valid CSV. Expected columns: firstName, lastName, email, bio, talkTitle, talkAbstract." with
  the template download link repeated.
- **Partial-success import**: summary line explicitly states both counts ("Imported 12, skipped
  2") — never silently drops rows.
- **Row cap exceeded (>500)**: blocked before any network call, with the exact row count shown:
  "This file has 640 rows; the limit is 500. Split it into two files."

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| CSV parsing location | Client-side, papaparse | Matches NFR-001; avoids a new server-side file-upload/parsing surface for a one-time onboarding action. |
| Talk import target | Reuse `submissions` + one synthetic `submission_forms` row per event | Avoids a new table; `submissions.answers` is already `v.any()` so no `field_definitions` are required for imported talks. |
| Wizard step UI | Reuse `WizardShell` | Already used by `PortalForms.tsx` and `SubmissionFormBuilder.tsx` — no new stepper component needed, per explicit reuse instruction. |
| Email step UI | Extract `EmailIntegrationForm` from `EmailDelivery.tsx` | Single source of truth for the connect form instead of duplicating it inside the wizard. |
| Redirect guard scope | New `organizers.getMine` query, not a reused one | `isCurrentUserOrganizer` returns only a boolean; the guard and Step 1 both need the row itself (email, `onboardingCompletedAt`). |
| Onboarding-complete flag location | `organizers.onboardingCompletedAt` | Role/identity state already lives on this table (see schema comment in `convex/schema.ts`); no new table for a single timestamp. |

## Dependencies
**Requires:** none — all underlying capabilities (`organizers`, `events`, `email_integrations`,
`speakers`) already exist.
**Enables:** future "everboarding" nudges (e.g. a Settings "Setup checklist" card) can reuse the
same `getMine()`/`onboardingCompletedAt` signal — not built here, just unblocked.

## Risks & Mitigations
- **Risk:** `RequireOnboarding`'s extra `getMine()` call on every authenticated navigation adds a
  network round trip. **Mitigation:** it's a single indexed point lookup (`by_userId`), same cost
  class as calls already made on every page (e.g. `assertOrganizer` itself does this lookup on
  every existing query/mutation).
- **Risk:** CSV import silently overloading `submissions`/`speakers` for an event with dirty data.
  **Mitigation:** row cap (500), preview-before-commit, explicit skipped/imported counts, no
  destructive action (import never deletes/overwrites existing rows).
- **Risk:** Extracting `EmailIntegrationForm` out of `EmailDelivery.tsx` regresses the existing
  Settings > Email Delivery page. **Mitigation:** plan.md requires running the existing test
  suite for that page/lib after the extraction and before touching onboarding-specific code.
