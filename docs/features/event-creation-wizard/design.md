# Event Creation Wizard — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
`events` (`convex/schema.ts` ~line 67), via `eventFields` in `convex/events.ts`:
- Required: `name`, `slug`, `timezone`, `startDate`, `endDate`, `exhibitorsEnabled`, `sponsorsEnabled`, `status` (`draft`/`published`/`archived`)
- Optional: `type`, `websiteUrl`, `location`, `description`, `contactEmail`, `logoFileId`, `programPublishedAt`, `theme`, `logoStorageKey`, `backgroundStorageKey`, `defaultOnboardingTemplateId`
- Indexed `by_slug`

`event_members`: `eventId`, `userId`, `email`, `role`, `invitedByUserId`, `invitedAt`, `createdAt`. Indexed `by_event`, `by_userId`, `by_email`, `by_event_email`.

`submission_forms` (~line 95): required `eventId`, `internalName`, `externalTitle`, `pageHeading`, `version`, `kind`, plus the CFP builder's own fields. Indexed `by_event`.

### Required Changes
None. No schema changes needed — every field the wizard collects already exists on `events`, `event_members`, and `submission_forms`. This is a pure frontend orchestration feature over existing mutations.

### Migration
N/A — no schema change.

---

## Backend / API

### Affected Existing Endpoints
| Function | Change |
|----------|--------|
| `events.save` (mutation, `convex/events.ts:111`) | No signature change. Called once from Basics (create) then again from Branding (patch via `eventId`). |
| `forms.createFromTemplate` (mutation, `convex/forms.ts:101`) | No change. Called from the CFP fork step exactly as `SubmissionForms.tsx` already calls it. |
| `eventMembers.add` (mutation, `convex/eventMembers.ts:44`) | No change. Called once per invited teammate from the Team step, and once per copied member when "copy team from an existing event" is chosen post-creation (see note below). |
| `eventMembers.list` (query, `convex/eventMembers.ts:36`) | No change. Used to read the source event's member list when copying a team after the event already exists. |

### New Endpoints
None. This feature composes existing mutations/queries — no new Convex functions.

### Validation & Business Logic
- Slug uniqueness and schedule validation (`assertEventSchedule`) already live server-side inside `events.save` — the wizard just surfaces whatever error it throws (via `cleanErrorMessage`, same as today's `EventEditor`).
- **Team-copy timing caveat:** `events.save`'s `pullTeamFromEventId` argument only works in the same call that creates the event (`args.eventId` must be unset). Because this wizard creates the event at the end of Basics (step 1) and the Team step comes later (step 4), the wizard **cannot** use `pullTeamFromEventId` for its "copy team from existing event" option — that argument stays reserved for the untouched "Duplicate event" quick action. Instead, the Team step fetches the source event's members via `eventMembers.list({ eventId: sourceEventId })` and inserts each (minus the creator, respecting `EVENT_TEAM_MEMBER_LIMIT`) via individual `eventMembers.add` calls against the wizard's own `eventId`. This is slightly more chatty (N mutation calls vs. 1) but is the only correct option given save-early-patch-later.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/events/EventsLanding.tsx` | Replace `EventEditor`'s `{ mode: "new" }` rendering with the new `EventCreationWizard`. Keep `{ mode: "duplicate" }` (the existing `EventEditor` duplicate form) exactly as-is — untouched. |

### New Components

**`EventCreationWizard`**
- File: `src/pages/events/EventCreationWizard.tsx`
- Props: `{ onClose: () => void (required); onSaved: (eventId: string, slug: string) => void (required); events: Event[] (required, for the Team step's "copy from" picker) }`
- Location: Renders in the same `AppLayout` detail panel slot `EventEditor` currently occupies (opened from `EventsLanding.tsx`'s "+ New event" button).
- Built on `WizardShell` (`src/components/shared/WizardShell.tsx`) with steps: `["Basics", "CFP", "Branding", "Team", "Review"]`. When the user chooses "Yes" on the CFP fork, `"CFP"` expands into the CFP builder's own steps in place (see Behavior below) rather than being a single step.
- Elements:
  - **Step 1 — Basics:** Name (`Input`, autofocus), URL slug (`Input`, auto-derived from name until touched, same `slugify` helper as today), Starts/Ends (`Input type=date`, 2-col grid), Timezone (`Select`, IANA timezone list — see Edge Cases), Location (`Input`, optional), Type (`Input`, optional, freeform). Inline `role="alert"` error text on save failure. Footer: Back (disabled, first step) / Next ("Create & continue").
  - **Step 2 — CFP fork:** Two large selectable cards: "Yes, add a CFP now" and "Skip for now — I'll add one later." No form fields. Footer: Back / Next.
    - If "Yes" selected: replaces the wizard's remaining flow with `TemplateGallery` (`src/components/forms/TemplateGallery.tsx`) inline, then the selected form's builder steps (reusing `SubmissionFormBuilder`'s existing step components/state, scoped to `eventId` + the new `formId`), before returning to this wizard's Branding step.
    - If "Skip" selected: advances directly to Branding.
  - **Step 3 — Branding (optional):** Theme (`CharCounterInput`, maxLength 1000 — same field/component `EventDetails.tsx` already uses). No logo upload — see Out of Scope note below. "Skip" text button next to Next.
  - **Step 4 — Team (optional):** Two sub-sections: (a) "Invite by email" — repeatable row of `Input type=email` + role `Select` (`organizer`/reviewer role options already defined in `eventMembers.ts`) + remove button, "+ Add another" link; (b) "Or copy team from an existing event" — `Select` populated from the `events` prop, disabled/hidden if `events.length === 0`. "Skip" text button next to Next.
  - **Step 5 — Review:** Read-only summary cards for Basics, CFP (shows "No CFP yet — you can add one from Program" if skipped, or the created form's name if not), Branding, Team (list of pending invites/copied members). Each card has an "Edit" link that calls `onStepChange` back to that step. Footer: Back / "Finish" (`finalLabel="Finish"` on `WizardShell`).
  - Loading state: Basics' Next button shows "Creating…" and is disabled while `events.save` is in flight (matches today's `busy` pattern in `EventEditor`).
  - Error state: inline `role="alert"` red text under the relevant step's fields, using `cleanErrorMessage` (same as `EventEditor` today).
- Behavior:
  - On Basics "Next": validates name/slug/dates client-side (same checks `EventEditor` does today), calls `repo.events.save({ ...basics fields, exhibitorsEnabled: false, sponsorsEnabled: false, status: "draft" })`, stores the returned `eventId` + `slug` in wizard state, advances to CFP fork.
  - On Branding "Next"/"Skip": if theme was changed, calls `repo.events.save({ eventId, ...unchanged existing fields, theme })` (patch); "Skip" advances without a network call if nothing changed.
  - On Team "Next"/"Skip": fires one `eventMembers.add` per invite row and per copied member (sequential, so a mid-list failure surfaces which specific email/name failed); "Skip" advances without calls.
  - On Review "Finish": calls `onSaved(eventId, slug)` — same contract `EventEditor` uses today — which `EventsLanding.tsx` already wires to close the panel and navigate into the event workspace. If a CFP was created, `onSaved` additionally navigates into `/events/{slug}/program/forms/{formId}/edit` instead of the plain event workspace (mirrors `SubmissionForms.tsx`'s existing navigate call).
  - `WizardShell`'s left-hand step list lets the user jump backward to any completed step at any time (existing `onStepChange` behavior) — forward jumps beyond the current step are not allowed, matching `WizardShell`'s existing contract.
- Third-party: none new. Uses existing Radix `Select`/`Input`/`Checkbox` wrappers already in `src/components/ui/`.

**Out of scope, flagged as a gap:** `logoStorageKey`/`logoFileId` exist on the `events` schema and `convex/files.ts` exposes `generateUploadUrl`, but **no frontend upload UI exists anywhere in the app today** for event logos (confirmed — no component calls `generateUploadUrl`). Building that upload widget is real net-new scope beyond wizard orchestration and would risk blowing the 15-minute/small-PR goal. The Branding step ships with theme only; logo upload is a separate follow-up issue.

---

## State / Data Flow
- Wizard-local React state (`useState`) holds all step field values plus `eventId`/`formId` once created — no new global store.
- Each step's "Next" either (a) calls a Convex mutation and waits before advancing, or (b) advances immediately for skippable steps with no changes.
- `events` list (for the Team step's "copy from" picker) is passed down from `EventsLanding.tsx`, which already queries it via `repo.events.list` today for `EventEditor`'s "start with an existing team" dropdown — no new query.
- Re-renders are driven purely by local wizard state changes; Convex's reactive queries (`repo.events.list`, `repo.eventMembers.list`) refresh the rest of the app automatically once mutations commit, same as every other mutation in this codebase.

---

## Auth / Permissions
- Event creation requires an authenticated identity with an email (`requireIdentity` inside `events.save` — unchanged, same as today).
- Every subsequent patch/invite call is scoped by `assertEventOrganizerAccess(ctx, eventId)` inside `events.save`, `eventMembers.add`, and `forms.createFromTemplate` — all pre-existing guards, nothing new to add. The creator is auto-added as `organizer` on the new event inside `events.save`, so they always pass this check for the rest of the wizard.
- No new roles or permission tiers introduced.

---

## Edge Cases & Error States
- **Basics validation failure** (empty name/slug, end date before start date, duplicate slug): inline error text, same messages `EventEditor` throws today (`assertEventSchedule` server-side, plus the existing client-side checks) — wizard does not advance.
- **Network/mutation failure on Branding or Team steps:** inline error, "Next"/"Skip" stays clickable to retry; the event itself is already safely created, so nothing is lost.
- **User closes the wizard after Basics but before Review:** the event row exists in `draft` status with whatever was filled in — reopening "New event" does NOT resume this draft automatically (no resume-a-draft UX in this feature; the partially-created event simply appears in the events list as any other draft event, editable via Settings). Flagged as an intentional scope cut, not a bug — full resume-wizard-from-draft is a larger feature.
- **Team invite: EVENT_TEAM_MEMBER_LIMIT (8) exceeded:** `eventMembers.add` throws server-side; wizard surfaces the exact error and stops adding further rows until the user removes one.
- **Team invite: invalid email:** `eventMembers.add`'s `isEventTeamEmail` check throws server-side; surfaced inline next to the offending row.
- **CFP fork "Yes" then user backs out mid-builder:** stepping back via `WizardShell`'s step list returns to the CFP fork step; the partially-configured form row (created by `createFromTemplate`) remains in `draft`/unpublished form status same as if the user had abandoned the standalone CFP builder today — no special cleanup, consistent with existing behavior.
- **No existing events yet (first event ever):** Team step's "copy from an existing event" option is hidden (same guard `EventEditor` already uses: `events.length > 0`).

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Step ordering | Basics → CFP fork → Branding → Team → Review | Consequential, hard-to-change-later fields (dates/timezone/location) go first; the biggest decision fork (CFP or not) goes second, right after the event exists; genuinely optional/skippable steps (branding, team) come last so they never block completion. |
| Persistence model | Save-early-patch-later: `events.save` creates the row at the end of Basics, later steps patch by `eventId` | Matches the existing `OnboardingWizard.tsx` pattern; guarantees no data loss if the user abandons partway, and gives the CFP fork a real `eventId`/`slug` to work with immediately. |
| CFP embedding | Inline, reusing `TemplateGallery` + `SubmissionFormBuilder`'s existing step components | User's explicit ask: one continuous wizard, not a redirect. Avoids rebuilding the CFP flow — just re-hosts its existing steps inside this wizard's shell. |
| Team-copy mechanism | Per-member `eventMembers.add` calls instead of `events.save`'s `pullTeamFromEventId` | `pullTeamFromEventId` only works at initial creation, which happens during Basics — before the Team step runs. The existing "Duplicate event" quick action keeps using `pullTeamFromEventId` unchanged; this wizard needs a different mechanism given its step ordering. |
| Logo upload | Excluded from this feature | No existing frontend upload plumbing anywhere in the app; building it is separate scope from wizard orchestration. |

## Dependencies
**Requires:** `WizardShell`, `TemplateGallery`, `SubmissionFormBuilder`'s step components, `events.save`, `eventMembers.add`/`list`, `forms.createFromTemplate` — all already exist and are unmodified.
**Enables:** A future "resume a draft event wizard" feature; a future logo-upload feature that could slot into the Branding step later.

## Risks & Mitigations
- **Risk:** Re-hosting `SubmissionFormBuilder`'s step components inside this wizard's shell could be more invasive than expected if that component isn't cleanly extractable from its current page-level context (routing, layout assumptions). **Mitigation:** implementer should read `SubmissionFormBuilder.tsx` first; if its steps aren't cleanly reusable as-is, fall back to the "navigate after finish" pattern (event wizard ends at Review → Create, then routes to `/events/{slug}/program/forms/new/edit` exactly as `SubmissionForms.tsx` does today) rather than forcing an awkward inline embed. Flag this tradeoff back to Naya if it comes up.
- **Implementation note:** The fallback is used here. `SubmissionFormBuilder` owns route-scoped event loading, form loading, and all builder state in a page component, so extracting its steps would require a disproportionate rewrite. The wizard embeds the existing `TemplateGallery`, creates the selected form in the new event scope, and routes to the unchanged builder after Review (or to its blank-form route when “Start from blank” is chosen).
- **Risk:** Sequential per-member `eventMembers.add` calls on the Team step could be slow with a full 8-person team. **Mitigation:** acceptable given the 8-person cap; not worth optimizing into a batch mutation for this feature.
- **Found in browser verification:** `WizardShell` originally switched to a side-by-side sidebar+content layout at the `lg` *viewport* breakpoint, not based on its container's actual width. Placed inside `AppLayout`'s ~400px detail panel, this broke the CFP fork step (two option cards rendered overlapping and unreadable) and cramped the Basics step's paired fields. Fixed by adding an opt-in `layout?: "row" | "stack"` prop to `WizardShell` (default `"row"`, i.e. unchanged for the CFP builder's existing full-page usage) and passing `layout="stack"` from `EventCreationWizard`; also dropped the CFP fork's and Basics' `md:`/`sm:grid-cols-2` classes to single-column, since the panel is too narrow for two columns at any viewport width. Re-verified clean after the fix — see plan.md Phase 6.
