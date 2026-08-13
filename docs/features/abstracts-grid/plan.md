# Abstracts Grid

**Phase 5 · ~5-6h** · Screenshots: *Program > Abstracts* (brief p.18-21)

Route: `/program/abstracts` · Admin only

## Goal

The admin review surface — a real data grid, not a simple list. This is where accept/decline
happens and where the most clicking occurs during judging.

## Screen

**Status tabs with counts:** All Abstracts · Accepted · Accept Queue · Pending · Decline Queue
· Declined · Withdrawn · Drafts

**Columns:** checkbox · Status · Source (which form) · Title · Client Session ID · Description
· Notified · Rating · Speaker · Track · Tags · Files · Location · Capacity · CEU Credits

**Toolbar:** Search · Saved Views · Columns · Sort · Filter · `… Options` · `+ Add Abstract`
**Footer:** "1 — 2 of 2 rows", Show 25

**Inline status editor** — click the status pill → multi-select list (Accepted / Accept Queue
/ Pending / Decline Queue / Declined) with Cancel · Save.

**Preferences panel** (right drawer) — tabs Columns / Sort / Filter / Drafts. Columns shows
"18/25", a searchable checkbox list grouped by section ("SESSION DETAILS"), and a draggable
**Selected** reorder list. "Reset to Default".

**`… Options`** — Import Sessions · Export .CSV · Export .XLSX · Download files bundle

**`+ Add Abstract`** — right side panel, tabs **Details | Participants**. Details: Title\*,
Status, Description, Starts At, Ends At, Capacity, CEU Credits, Client ID, Format.

## Schema additions to `submissions`

Beyond the core fields (see [public-cfp-submission](../public-cfp-submission/plan.md)), the
grid columns require:

```ts
clientSessionId: v.optional(v.string()),
format: v.optional(v.string()),
level: v.optional(v.string()),
trackId: v.optional(v.id("tracks")),
tags: v.optional(v.array(v.string())),
capacity: v.optional(v.number()),
ceuCredits: v.optional(v.number()),
location: v.optional(v.string()),
notified: v.boolean(),            // has a decision email gone out
rating: v.optional(v.number()),   // denormalized avg score, for sorting
startsAt: v.optional(v.number()), endsAt: v.optional(v.number()),
```

Status union is the shared one — see [`ARCHITECTURE.md`](../../ARCHITECTURE.md). The two
**queue** states are staging before a final decision; they're the actual review workflow.

## Performance — this is the graded screen

- **Status tabs are client-side filters over one fetched dataset.** Never refetch per tab.
  Seeded with 500 rows this is the single most visible speed difference vs. Sessionboard.
- **Optimistic inline status updates** — the most-clicked interaction in the app.
- Column visibility/order in local state; persist per user if cheap.

## Differentiators (from complaint research)

- **Unconditional export** — `.CSV` from *any* filtered view, always enabled. A common
  complaint about competitors is export being gated, partial, or view-specific.
- **Speaker detail view** (`/program/speakers/:id`) — all of one person's submissions,
  statuses, tasks and docs in one place. Repeated complaint across tools: you can see
  submissions, never the human. Small, and nobody else does it well.

## Tasks

1. `SubmissionsRepo.list` with joined speakers (one pass, no N+1)
2. Grid w/ TanStack Table or a hand-rolled table over shadcn `table.tsx`
3. Status tabs as client-side filters
4. Inline status editor w/ optimistic update
5. Preferences drawer: column toggle + drag reorder
6. Export `.CSV` (`.XLSX` optional)
7. Add Abstract side panel (Details tab; Participants tab optional)
8. Bulk select + bulk status change
9. Speaker detail view

## Verification

- [ ] Tab switch <200ms with 500 seeded rows
- [ ] Inline status change reflects immediately, persists on reload
- [ ] Column show/hide + reorder works
- [ ] Export downloads a correct CSV of the *filtered* view
- [ ] Accept → onboarding tasks auto-created (see [portal-tasks](../portal-tasks/plan.md))

## Cut line

Keep: tabs, core columns, inline status editing, CSV export. Droppable: Saved Views, XLSX,
files bundle, Import Sessions, the Participants tab of Add Abstract, per-user column
persistence.
