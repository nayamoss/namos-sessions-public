# Submission Form Builder

**Phase 1 · ~6-8h** · Screenshots: *Program > Submission Forms > Create* (brief p.6-14)

Routes: `/program/forms`, `/program/forms/:id/edit` · Admin only

## Goal

Build the CFP form that everything downstream flows from. A 7-step wizard producing a form
config the public page renders.

## Screens

### Forms list (`/program/forms`)
Card per form: name, `Open`/`Closed` badge, type tag ("Abstracts & Participants"), version tag
(V1/V2), "N submissions · M drafts", "Closes Sep 15, 2026", created date, `...` menu.
Tabs All/Open/Closed with counts. Search. Sort ("Most Pending"). `+ Add` → **Create Form** /
**Copy from…** (duplication is cheap — build it).

### Wizard (`/program/forms/:id/edit`)
Left rail with checkmarks on completed steps; header has View Form · Copy Link · Save.

1. **Submission Setup** — two choice cards: *Abstracts* ("collect abstract submissions for
   review before sessions are finalized") vs *Sessions* ("collect full session proposals").
   Plus a **Participants** toggle.
2. **Welcome Screen** — Internal Form Name (255), External Form Title (255), Page Heading
   (**15 char max**), Welcome Message rich text + "Show message" toggle.
3. **Abstract Information** — Section Title, Page Heading, Description & Instructions (rich
   text), then **Form Questions** + `Add Field`. Defaults: Title (**Locked**, text, 255),
   Description (wysiwyg, 5000), Format (dropdown), Tags (dropdown), Track (dropdown), Level
   (dropdown). Each row: drag handle, name, type/constraint subtitle, **Required** toggle, `…`.
4. **Participant Information** — same header pattern + **Participant roles** (e.g. Speaker)
   each with **Min/Max** counts. Fields: First Name (Locked), Last Name (Locked), Email
   (Locked), Mobile Phone, Biography (wysiwyg, 5000).
5. **Payments & Fees** — ❌ **swyx wrote "NOT NEEDED".** Omit the step entirely.
6. **Form Settings** — Close Date (*"kinda impt"*); Set Submission Limit toggle ("Event max: 3
   applies when no form-level limit is set"); Allow multiple draft submissions; **After
   submission**: Auto-redirect to speaker portal (after 10s) + Customize success page message
   — *"make sure this works"*; **Validation rules → Cross-field character limits**.
7. **Notifications** — admin alerts on new / updated submission (*"nice to have"*); Submitter
   → **Submission Confirmation** email (*"must have"*, see comms-notifications).

## The differentiator: cross-field character limits

> *"Cap the combined length of several text fields (for example a printed program block).
> Submitters see a live combined counter; speaker-field rules apply to each participant."*

swyx said on the walkthrough that Sessionboard's validation is weak — this is the one real
validation feature it has. Implementing it, **with the live counter on the public form**, is
the highest score-per-hour item in the build. Do not cut it.

## Schema

```ts
submission_forms: defineTable({
  eventId: v.id("events"),
  internalName: v.string(),            // admin-facing
  externalTitle: v.string(),           // public-facing
  pageHeading: v.string(),             // 15 char max
  version: v.number(),
  kind: v.union(v.literal("abstract"), v.literal("session")),
  collectParticipants: v.boolean(),
  welcomeMessage: v.optional(v.string()), showWelcomeMessage: v.boolean(),
  sections: v.array(v.object({         // abstract + participant sections
    id: v.string(), key: v.union(v.literal("abstract"), v.literal("participant")),
    title: v.string(), pageHeading: v.string(), description: v.optional(v.string()),
    fieldIds: v.array(v.string()),     // → field_definitions
  })),
  participantRoles: v.array(v.object({
    role: v.string(), min: v.optional(v.number()), max: v.optional(v.number()),
  })),
  crossFieldLimits: v.array(v.object({
    id: v.string(), label: v.string(),
    fieldIds: v.array(v.string()), maxCombinedChars: v.number(),
    perParticipant: v.boolean(),
  })),
  routingRules: v.optional(v.array(v.object({
    id: v.string(), fieldId: v.string(), equals: v.string(),
    assignTagIds: v.optional(v.array(v.id("tags"))),
    assignTrackId: v.optional(v.id("tracks")),
    setStatus: v.optional(v.union(
      v.literal("pending"), v.literal("accept_queue"), v.literal("accepted")
    )),
    reviewerUserIds: v.optional(v.array(v.string())),
  }))),
  closeDate: v.optional(v.number()),
  submissionLimit: v.optional(v.number()),
  allowMultipleDrafts: v.boolean(),
  autoRedirectToPortal: v.boolean(),
  successPageMessage: v.optional(v.string()),
  reminderEmailEnabled: v.boolean(),
  adminUserIds: v.array(v.string()),
  notifyAdminsOnNew: v.array(v.string()), notifyAdminsOnUpdate: v.array(v.string()),
  sendSubmitterConfirmation: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]),

// Shared, searchable field library — used by BOTH form builders (see portal-forms).
// Model as first-class, not inline-per-form.
field_definitions: defineTable({
           // per-org, not per-event
  label: v.string(),
  type: v.union(
    v.literal("text"), v.literal("wysiwyg"), v.literal("dropdown"),
    v.literal("multiselect"), v.literal("email"), v.literal("phone"),
    v.literal("file"), v.literal("date"), v.literal("number")
  ),
  maxChars: v.optional(v.number()),
  options: v.optional(v.array(v.string())),
  locked: v.boolean(),                            // Title/First/Last/Email can't be removed
  required: v.boolean(),
  showIf: v.optional(v.object({ fieldId: v.string(), equals: v.string() })), // conditional logic
  createdAt: v.number(), updatedAt: v.number(),
}),
```

## Tasks

1. `SubmissionFormsRepo` + `FieldDefinitionsRepo`
2. Forms list page w/ tabs, search, sort, duplicate
3. Wizard shell (step rail, validation gating, save-per-step)
4. Steps 1-4, 6, 7 (skip 5)
5. Field row editor: type, required, max chars, options, `showIf`
6. Cross-field limit rule editor
7. Seed the locked default fields on form creation
8. Routing rule editor for dropdown/multiselect categories, event tags/tracks, status, and existing reviewers

## Verification

- [ ] Create → save → reopen preserves every setting
- [ ] Locked fields can't be deleted, only reordered
- [ ] `showIf` conditional actually hides a field on the public renderer
- [ ] A cross-field rule enforces on the public form with a live counter
- [ ] Duplicate produces an independent copy
- [x] Sponsor category routes to its event tag, track, accept queue, and reviewer on live Convex

## Cut line

Keep: steps 1-4 + Close Date + auto-redirect + success message + confirmation email toggle +
cross-field limits. Droppable: version tags, admin assignment, reminder emails, form
duplication, Sort-by-Most-Pending.
