# Event Settings

**Phase 0b · ~2h** · Screenshot: *Basic event config* (brief p.4-5)

Route: `/settings/event` · Admin only

## Goal

Configure the event itself, plus the rooms and tracks that agenda scheduling and conflict
detection depend on.

## Screen

Left sub-nav (from the screenshot): Overview · **Event Details** · Library (Fields, Tags,
Personas) · Record Settings · Portals · Submission Forms · Email Templates · Email Themes ·
Integrations. Build **Event Details** only; the rest are other features or out of scope.

**Event Details** form: Event Name\*, Event Slug\*, Event Type (select: Conference…), Event
Website URL, Event Location, Timezone (IANA, e.g. "(GMT-8:00) America/Los_Angeles"), Starts
At\*, Ends At\*, Theme (long text w/ `18 / 1000` counter). Then **Exhibitors & Sponsors**
(two toggle cards) and **Image Settings** (Logo 300×300, Background 1500×500). Save button.

Rooms and tracks aren't in the screenshot but are required by agenda scheduling — add them as
two simple inline lists on the same page.

## Schema

```ts
events: defineTable({
  name: v.string(),
  slug: v.string(),                    // public URLs: /submit/:slug/...
  type: v.optional(v.string()),        // "Conference"
  websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()),
  timezone: v.string(),                // IANA — render everything in THIS, not the browser's
  startDate: v.number(),
  endDate: v.number(),
  theme: v.optional(v.string()),       // max 1000
  logoUrl: v.optional(v.string()),
  backgroundUrl: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(),
  sponsorsEnabled: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),

rooms: defineTable({
  eventId: v.id("events"),
  name: v.string(), capacity: v.optional(v.number()), sortOrder: v.number(),
}).index("by_event", ["eventId"]),

tracks: defineTable({
  eventId: v.id("events"),
  name: v.string(), color: v.optional(v.string()), sortOrder: v.number(),
}).index("by_event", ["eventId"]),
```

## Tasks

1. `EventsRepo` methods + Convex/Airtable impls
2. `src/pages/settings/EventDetails.tsx`
3. Inline rooms + tracks editors
4. Slug uniqueness validation (it's in public URLs)
5. Logo/background upload → **Convex storage or R2, never an Airtable attachment URL**
   (they expire ~2h — see ARCHITECTURE)

## Verification

- [ ] Round-trips all fields
- [ ] Slug collision rejected with a clear message
- [ ] Timezone selection actually changes how agenda times render elsewhere

## Cut line

Reduce to: name, slug, dates, timezone, rooms, tracks. Those are load-bearing. Logo,
background, exhibitors/sponsors toggles, theme are cosmetic and droppable.
