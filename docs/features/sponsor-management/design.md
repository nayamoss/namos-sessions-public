# Sponsor Management — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
```ts
events: defineTable({
  ...
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(),
  defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
  ...
}).index("by_slug", ["slug"]),

onboarding_tasks: defineTable({
  eventId: v.id("events"),
  targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission")),
  submissionId: v.optional(v.id("submissions")),
  speakerId: v.optional(v.id("speakers")),
  title: v.string(), description: v.optional(v.string()),
  source: v.union(v.literal("manual"), v.literal("auto")),
  linkedFormId: v.optional(v.id("submission_forms")),
  status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
  dueDate: v.optional(v.number()), completedAt: v.optional(v.number()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]).index("by_submission", ["submissionId"]).index("by_status", ["status"]),

submissions: defineTable({
  eventId: v.id("events"), formId: v.id("submission_forms"),
  tagIds: v.optional(v.array(v.id("tags"))), trackId: v.optional(v.id("tracks")),
  status: v.union(...), ...
}).index("by_event", ["eventId"])...,

submission_forms: defineTable({
  ...
  routingRules: v.optional(v.array(v.object({
    id: v.string(), fieldId: v.string(), equals: v.string(),
    assignTagIds: v.optional(v.array(v.id("tags"))),
    assignTrackId: v.optional(v.id("tracks")),
    setStatus: v.optional(v.union(v.literal("pending"), v.literal("accept_queue"), v.literal("accepted"))),
    reviewerUserIds: v.optional(v.array(v.string())),
  }))),
  ...
}).index("by_event", ["eventId"]),
```

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| `sponsor_tiers` | NEW TABLE | — | see below | tier catalog per event |
| `sponsors` | NEW TABLE | — | see below | sponsor record per event |
| `sponsor_contacts` | NEW TABLE | — | see below | contacts per sponsor |
| `onboarding_tasks` | ADD to union | `targetType` | `+ v.literal("sponsor")` | matches `"contact" \| "group" \| "submission"` pattern |
| `onboarding_tasks` | ADD COLUMN | `sponsorId` | `v.optional(v.id("sponsors"))` | mirrors existing `speakerId`/`submissionId` |
| `onboarding_tasks` | ADD INDEX | `by_sponsor` | `["sponsorId"]` | same shape as `by_speaker` |
| `submissions` | ADD COLUMN | `sponsorId` | `v.optional(v.id("sponsors"))` | set by routing, never by the public submitter directly |
| `submission_forms.routingRules[]` | ADD FIELD | `assignSponsorId` | `v.optional(v.id("sponsors"))` | new routing target alongside `assignTagIds`/`assignTrackId`/`setStatus` |

New tables:
```ts
sponsor_tiers: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  sortOrder: v.number(),
  color: v.optional(v.string()),
  benefitsDescription: v.optional(v.string()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]),

sponsors: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  tierId: v.optional(v.id("sponsor_tiers")),
  status: v.union(v.literal("prospect"), v.literal("confirmed"), v.literal("declined")),
  websiteUrl: v.optional(v.string()),
  notes: v.optional(v.string()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_tier", ["tierId"]),

sponsor_contacts: defineTable({
  sponsorId: v.id("sponsors"),
  eventId: v.id("events"), // denormalized for scoping, same pattern as speaker_documents
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  role: v.optional(v.string()),
  isPrimary: v.boolean(),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_sponsor", ["sponsorId"]).index("by_event", ["eventId"]),
```

### Migration
No backfill needed — all new fields/tables are additive and optional. `onboarding_tasks`,
`submissions`, and `submission_forms` rows written before this ships simply have no
`sponsorId`/`assignSponsorId` and continue to validate against the widened union/optional field.
Convex schema changes deploy as a normal `npx convex deploy`; no data migration script required.

---

## Backend / API

### Affected Existing Endpoints
| Function | File | Change |
|----------|------|--------|
| `tasks.list` / `tasks.create` | `convex/tasks.ts` | accept `targetType: "sponsor"` and `sponsorId`; validate sponsor belongs to `eventId` the same way `speakerId`/`submissionId` are validated today |
| `taskTemplates.applyToTarget` (or equivalent apply mutation) | `convex/taskTemplates.ts` | accept a sponsor target the same way it accepts a speaker/contact target |
| `forms.save` → `validateRoutingRules` | `convex/categoryRouting.ts` | validate `assignSponsorId` belongs to the event, same pattern as `assignTagIds`/`assignTrackId` |
| `publicForms.submit` → `resolveSubmissionRouting` | `convex/categoryRouting.ts`, `convex/publicForms.ts` | `evaluateRoutingRules` also returns `assignSponsorId`; `publicForms.ts:167-176` spreads it onto the inserted submission (`...(routing.assignSponsorId ? { sponsorId: routing.assignSponsorId } : {})`) |

### New Endpoints (Convex functions — new files)
| File | Function | Args | Returns |
|------|----------|------|---------|
| `convex/sponsorTiers.ts` | `list` (query) | `{ eventId }` | `SponsorTier[]` ordered by `sortOrder` |
| `convex/sponsorTiers.ts` | `create` (mutation) | `{ eventId, name, sortOrder, color?, benefitsDescription? }` | `Id<"sponsor_tiers">` |
| `convex/sponsorTiers.ts` | `update` (mutation) | `{ id, eventId, name?, sortOrder?, color?, benefitsDescription? }` | `void` |
| `convex/sponsorTiers.ts` | `remove` (mutation) | `{ id, eventId }` | `void` — throws if any `sponsors` row references this `tierId` |
| `convex/sponsors.ts` | `list` (query) | `{ eventId }` | `Sponsor[]` (each with resolved primary contact + tier name, same join pattern `speakers.ts` uses for related data) |
| `convex/sponsors.ts` | `get` (query) | `{ id, eventId }` | `Sponsor \| null` with contacts and open task count |
| `convex/sponsors.ts` | `create` (mutation) | `{ eventId, name, tierId?, status, websiteUrl?, notes? }` | `Id<"sponsors">` |
| `convex/sponsors.ts` | `update` (mutation) | `{ id, eventId, name?, tierId?, status?, websiteUrl?, notes? }` | `void` |
| `convex/sponsors.ts` | `remove` (mutation) | `{ id, eventId }` | `void` — cascades: deletes `sponsor_contacts` rows, unassigns (`sponsorId: undefined`, not delete) matching `onboarding_tasks` and `submissions` |
| `convex/sponsorContacts.ts` | `listBySponsor` (query) | `{ sponsorId }` | `SponsorContact[]` |
| `convex/sponsorContacts.ts` | `create` (mutation) | `{ sponsorId, eventId, name, email?, phone?, role?, isPrimary }` | `Id<"sponsor_contacts">` — if `isPrimary`, unsets any other primary contact on the same sponsor in the same mutation |
| `convex/sponsorContacts.ts` | `update` (mutation) | `{ id, sponsorId, name?, email?, phone?, role?, isPrimary? }` | `void` — same primary-swap rule |
| `convex/sponsorContacts.ts` | `remove` (mutation) | `{ id, sponsorId }` | `void` |

### Validation & Business Logic
- All mutations call `assertOrganizer(ctx)` first, matching `sponsorTiers`/`sponsors`/`sponsorContacts` to the auth pattern already used in `tasks.ts`, `sponsors` is never writable by a portal/speaker identity.
- `sponsors.create`/`update`: `name` trimmed and required non-empty; `tierId`, if present, must belong to the same `eventId`.
- `sponsorTiers.remove`: query `sponsors.by_tier` for that tier id; if any rows exist, throw `"Reassign or remove sponsors in this tier before deleting it."` — same guard shape as other reference-integrity checks in this codebase (e.g. routing rule field validation in `categoryRouting.ts`).
- `sponsorContacts.create`/`update` with `isPrimary: true`: within the same mutation, list existing contacts for `sponsorId` and clear `isPrimary` on any other row before setting it on this one — keeps "exactly one primary" true without a unique index (Convex has no partial unique index).
- `categoryRouting.validateRoutingRules`: extend the existing tag/track validation block to also resolve and check `assignSponsorId` belongs to `eventId`; extend the "every routing rule needs at least one target" check to include `assignSponsorId`.
- `tasks.create`: extend the existing `if (args.speakerId) {...}` / `if (args.submissionId) {...}` validation blocks with an equivalent `if (args.sponsorId) { const sponsor = await ctx.db.get(args.sponsorId); if (!sponsor || sponsor.eventId !== args.eventId) throw new Error("The selected sponsor does not belong to this event."); }`.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/components/AppLayout.tsx` | add `{ to: "/program/sponsors", label: "Sponsors", icon: Handshake }` to the `Program` nav section; render the item only when the active event's `sponsorsEnabled` is true (same conditional pattern already used for optional nav items) |
| `src/App.tsx` | add `<Route path="/program/sponsors" element={<Sponsors />} />` |
| `src/pages/settings/EventDetails.tsx` | no code change required — existing "Sponsors" toggle now has a real effect (nav visibility) |
| `src/pages/portal/TasksAdmin.tsx` | extend the target-type filter/badge rendering to include `"sponsor"` alongside `"contact"/"group"/"submission"`, resolving the sponsor's name for display the same way it resolves a speaker's name today |
| `src/data/types.ts` | add `SponsorId`, `SponsorTierId` branded ids; add `Sponsor`, `SponsorTier`, `SponsorContact` interfaces; widen `OnboardingTask.targetType` to include `"sponsor"` and add `sponsorId?: SponsorId`; add `sponsorId?: SponsorId` to `Submission` |
| `src/data/repo.ts` | add `SponsorsRepo`, `SponsorTiersRepo`, `SponsorContactsRepo` interfaces and wire them into the top-level `Repo` type |
| `src/data/convex/index.ts` | implement the three new repo interfaces against `convex/sponsors.ts` / `sponsorTiers.ts` / `sponsorContacts.ts` |

### New Components

**SponsorsPage**
- File: `src/pages/program/Sponsors.tsx`
- Props: none (reads current event from the same context/hook every other `program/*` page uses)
- Location: `/program/sponsors`, replacing the placeholder in the `Program` nav group
- Elements:
  - `ContentToolbar` — left: search input + tier filter dropdown; right: "Add sponsor" primary button, "Manage tiers" secondary button
  - `DataGrid` columns: Sponsor name, Tier (colored dot + label), Status (Prospect/Confirmed/Declined badge), Primary contact (name, email), Open tasks (count)
  - Row click opens `SponsorDetail` in the flex-sibling detail panel (same interaction as `Speakers.tsx`)
  - Empty state (no sponsors yet): icon (Lucide `Handshake`, size 40, muted) + "No sponsors yet" heading + "Add your first sponsor to start tracking tiers, contacts, and deliverables." subtext + "Add sponsor" CTA button
  - Loading state: `SkeletonList` (same component `EventDetails.tsx` uses)
  - Error state: inline `role="alert"` red text below the toolbar, matching `EventDetails.tsx`

**AddSponsorPane**
- File: `src/pages/program/Sponsors.tsx` (co-located, same pattern as `AddSpeakerPane` in `Speakers.tsx`)
- Props: `{ event: Event; onClose: () => void; onCreated: (sponsor: Sponsor) => void }`
- Location: opens as the detail-panel flex sibling when "Add sponsor" is clicked
- Elements:
  - Label + Input: Sponsor name (required, autofocus)
  - Label + Select: Tier (options loaded from `sponsorTiers.list`, plus "No tier")
  - Label + Select: Status (Prospect / Confirmed / Declined, default Prospect)
  - Label + Input (type url): Website
  - Label + Textarea: Notes
  - Inline `role="alert"` error text on validation failure
  - Footer: "Cancel" ghost button, "Add sponsor" submit button (disabled while saving, label becomes "Adding…")
- Behavior: submit validates non-empty trimmed name; on success calls `onCreated` and closes the pane

**SponsorDetail**
- File: `src/pages/program/Sponsors.tsx` (co-located, same pattern as `SpeakerDetail`)
- Props: `{ sponsor: SponsorWithRelations; event: Event; onClose: () => void; onUpdated: (sponsor: Sponsor) => void }`
- Location: detail panel, flex sibling of the sponsor list, opens on row click
- Elements:
  - Header: sponsor name (editable inline text field), tier select, status select, close (X) button top-right
  - "Website" and "Notes" fields, same input styling as the add pane
  - Contacts section: list of contact cards (name, email, phone, role, "Primary" badge on the primary contact), each with an edit (pencil icon button) and remove (trash icon button); "Add contact" button opens an inline form (name, email, phone, role, "Set as primary" checkbox)
  - Tasks section: reuses the existing task list UI (same rendering `SpeakerDetail` uses via `OnboardingTask` — checklist rows with title, status badge, due date; "Add task" button; "Apply template" dropdown listing this event's `task_templates`)
  - Danger zone: "Remove sponsor" button (destructive style) with a confirmation `AlertDialog` — text warns that contacts will be deleted and linked tasks/submissions will be unassigned, not deleted
- Behavior: every field autosaves on blur/change (same debounce pattern as `EventDetails.tsx` fields) rather than a single form submit, since this is an edit-in-place panel like `SpeakerDetail`

**SponsorTiersPane**
- File: `src/pages/program/SponsorTiers.tsx` (or co-located dialog — same shape as `Library.tsx`'s tag/track management)
- Props: `{ event: Event; onClose: () => void }`
- Location: opens from "Manage tiers" button on the Sponsors toolbar, as a detail-panel flex sibling
- Elements:
  - List of existing tiers, each row: color swatch, name (inline-editable), sponsor count, drag handle or up/down reorder buttons, remove (trash) button
  - "Add tier" row at the bottom: Input (name) + "Add" button
  - Remove attempt on a tier with sponsors shows inline error: "Reassign or remove sponsors in this tier before deleting it."
- Behavior: reorder writes new `sortOrder` values for all affected tiers in one mutation call

### Third-party
No new third-party library. Reuses existing `@radix-ui/react-select`, `@radix-ui/react-alert-dialog`, `lucide-react` (`Handshake` icon), and the existing `DataGrid`/`DetailPane`/`ContentToolbar`/`SkeletonList` shared components — same stack every other `program/*` page already uses.

---

## State / Data Flow
- Sponsor list/detail data originates from Convex (`convex/sponsors.ts`, `sponsorTiers.ts`,
  `sponsorContacts.ts`) via the reactive `useQuery` wrapper in `src/data/convex/reactive.tsx`,
  reached only through the `SponsorsRepo`/`SponsorTiersRepo`/`SponsorContactsRepo` interfaces —
  `Sponsors.tsx` never imports Convex hooks directly, per the existing data-adapter boundary.
- Convex's reactive queries mean list/detail panels re-render automatically on any mutation
  (add contact, complete task, change tier) — no manual refetch/invalidation needed, matching how
  `Speakers.tsx` already behaves.
- CFP-side flow: public submitter picks a dropdown value on the CFP form → `publicForms.submit`
  resolves routing via `resolveSubmissionRouting` → if a rule's `equals` matches and it carries
  `assignSponsorId`, the new submission is inserted with that `sponsorId` set → the Sponsors
  detail panel can then list submissions/speakers linked to that sponsor (read via
  `submissions.by_event` filtered client-side by `sponsorId`, same shallow-filter pattern already
  used for tag filtering in `Abstracts.tsx`).

---

## Auth / Permissions
- Every sponsor/tier/contact query and mutation requires `assertOrganizer(ctx)` — same gate as
  `tasks.ts`, `tags.ts`, `sponsors` has no portal-facing (speaker-identity) access at all, unlike
  `speakers`/`onboarding_tasks` which also serve the portal.
- No new Clerk role or permission tier is introduced. Organizer role is already database-backed
  per `convex/organizers.ts`.
- The public CFP form (`publicForms.ts`) never returns sponsor names, tiers, or contact info to
  the browser — only the dropdown option label the organizer configured. `assignSponsorId` is
  resolved and applied entirely server-side inside the `submit` mutation.

## Edge Cases & Error States
- **No sponsors yet:** empty state with CTA, described above.
- **Convex query still loading:** `SkeletonList` matching `EventDetails.tsx`'s loading pattern.
- **Create/update mutation fails:** inline `role="alert"` red text under the relevant form,
  save button re-enabled, matching `AddSpeakerPane`'s error handling.
- **Deleting a tier with sponsors assigned:** blocked server-side, error surfaced inline in
  `SponsorTiersPane`.
- **Deleting a sponsor with contacts/tasks/submissions:** contacts cascade-delete; tasks and
  submissions are unassigned (`sponsorId`/`speakerId`-style field cleared), never silently
  deleted — matches how removing other referenced records behaves elsewhere in this schema.
- **Marking a second contact primary:** previous primary is automatically un-set in the same
  mutation; no UI-visible race, since the mutation runs atomically.
- **Routing rule references a sponsor from a different event** (shouldn't be reachable via UI,
  but must be defended server-side): `validateRoutingRules` throws, same as it already does for
  a tag/track ownership mismatch.
- **`sponsorsEnabled` toggled off after sponsors already exist:** data is preserved; only the nav
  item and page route are hidden — reflects existing "toggle just gates visibility" pattern for
  `exhibitorsEnabled`/`sponsorsEnabled`.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sponsor deliverables tracking | Reuse `onboarding_tasks` + `task_templates` with a new `"sponsor"` target type | Stakeholder decision; avoids building a second checklist engine when one already exists and already supports templates |
| Contact model | Separate `sponsor_contacts` table (1:many) | Stakeholder decision; sponsors often have more than one point of contact (marketing vs. logistics) |
| Public-facing sponsor page | Deferred, internal-only for v1 | Stakeholder decision; keeps this pass scoped to internal ops, not marketing-site rendering |
| CRM depth (pipeline/renewal/analytics) | Explicitly out of scope | Matches the standing decision in `docs/research/competitors.md` — this product's claim is "the program lifecycle for $0," not CRM parity |
| Fast-track mechanism | Extend the existing `routingRules`/`categoryRouting.ts` machinery with `assignSponsorId`, rather than a new routing system | One routing engine already exists and is well-tested (`resolveSubmissionRouting`, `validateRoutingRules`); adding a field is far lower risk than a parallel path |
| Airtable adapter | Not implemented for this feature | The Airtable adapter (`src/data/airtable/index.ts`, 43 lines) has not tracked recent features like task templates; keeping it in sync here would be net-new scope disconnected from this feature's goal |

## Dependencies
**Requires:** existing `onboarding_tasks`/`task_templates` system (issue history: task templates,
#67-era work), existing `categoryRouting.ts` routing engine, existing `events.sponsorsEnabled`
flag.
**Enables:** future public sponsor logo wall (if prioritized later — this feature's `sponsors`/
`sponsor_tiers` tables become the data source), future CSV bulk import for sponsors (mirrors the
existing speaker bulk import).

## Risks & Mitigations
- **Risk:** widening `onboarding_tasks.targetType` and `submission_forms.routingRules[]` touches
  shared, well-tested code (`categoryRouting.ts`, `tasks.ts`) used by every existing form/task
  flow. **Mitigation:** all new fields are additive/optional; existing rules and tasks with no
  `sponsorId`/`assignSponsorId` continue to validate and behave identically. Run the full existing
  `src/test/category-routing.test.ts` and task-related suites after the change, not just new tests.
- **Risk:** "exactly one primary contact" has no DB-level uniqueness (Convex lacks partial unique
  indexes). **Mitigation:** enforced in the mutation (clear-then-set), which is sufficient given
  all writes to this table go through these mutations — no other write path exists.
