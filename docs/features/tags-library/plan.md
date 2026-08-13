# Tags Library

**Issue #27 · Settings library · Layout C**

Route: `/settings/library`

## Goal

Give organizers one event-scoped tag library and make those tags assignable to submissions.
This turns the Abstracts Tags column into durable program data without expanding the public
CFP or speaker portal flows while those journeys are under verification.

Personas are deliberately outside this slice. They are nav-only in the source material and
remain below the cut line until the required tag workflow is complete and verified.

## Data model

```ts
tags: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  color: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
```

`submissions.tagIds` is an optional array of tag IDs so the schema remains compatible with
existing seeded and submitted records. New repository operations are event-scoped:

- list, create, rename, and delete tags;
- replace one submission's selected tag IDs;
- delete cascades by removing the deleted ID from submissions in the same event.

Every write validates `eventId`. Assignment rejects cross-event submissions and tags.

## UI

### Settings → Library

- `AppLayout` title `Library`, Layout C, no detail pane.
- `ContentToolbar` owns the single `Add tag` primary action.
- The Tags section supports inline create and rename.
- Delete uses an inline confirmation panel, never an ungated destructive action.
- Loading, empty, and error states are explicit.

### Abstracts

- Add a Tags column to the existing canonical `DataGrid`.
- Each row uses a popover multi-select backed by the event tag library.
- Updates are optimistic and roll back with an inline error if persistence fails.
- Search and CSV export include assigned tag names.

## Adapter boundary

Feature code uses `Repository` only. Convex implements the durable operations. The default
Airtable transport rejects tag operations explicitly; issue #27 does not add Airtable tag
support.

## Verification

- [ ] Create, list, rename, and delete are event-scoped.
- [ ] Duplicate names in one event are rejected case-insensitively.
- [ ] Cross-event tag assignment is rejected.
- [ ] Deleting a tag removes it from affected submissions.
- [ ] Abstracts renders, assigns, searches, and exports tag names.
- [ ] Repository contract tests cover the new operation shapes.
- [ ] App and Convex typechecks, tests, lint, and production build pass.
