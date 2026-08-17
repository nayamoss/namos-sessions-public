# Public Embeds — Schedule Grid View — Technical Design

## Database / Schema Changes
N/A — no schema changes. `schedule_grid` is a value in the existing `EmbedView` union
(`src/data/types.ts`), already stored the same way as every other view value on the `embeds` table.

## Backend / API
N/A — no new endpoints. Public embed data fetching is unchanged; `schedule_grid` is purely a rendering
mode selected client-side from the same session data every other view already receives.

## Frontend Components

### Modified Components (already written, uncommitted)
| File Path | Change |
|-----------|--------|
| `src/components/embeds/EmbedRenderer.tsx` | Adds the `schedule_grid` render branch: groups sessions by day → builds a room list + hour list → renders an HTML `<table>` with rooms as columns, hours as rows, sessions placed in their `[hour, room]` cell |
| `src/data/types.ts` | `EmbedView` union gains `"schedule_grid"` |
| `src/lib/public-embed.ts` | `embedViews`, `embedViewLabels`, `embedViewDescriptions`, `iframeHeight` all updated to include the new view (900px default height) |
| `src/test/embed-renderer.test.tsx` | New test asserting room columns render and sessions land in the correct cell |
| `src/test/public-embed-saved.test.ts` | Updated count assertion (5 views → 6) |

### New Components
None — `schedule_grid` is a new branch inside the existing `EmbedRenderer`, not a new component.

## State / Data Flow
Unchanged from every other embed view: public embed data is fetched once per embed
(`publicEmbeds.getPublic`-style query already in place), and `EmbedRenderer` derives `dayGroups`
(existing) and the new `gridDayGroups` (rooms + hours per day) via `useMemo` from that same session
list — no new data source.

## Auth / Permissions
N/A — public embeds are, by definition, publicly accessible with no auth (same as every other embed
view). No permission change.

## Edge Cases & Error States
- Session with no `roomName` → falls back to `"General"` column (already handled in the uncommitted
  code)
- Day with zero sessions at a given hour/room combination → empty cell, no placeholder needed (matches
  how a real timetable reads)
- Very wide grids (many rooms) → wrapped in `overflow-x-auto` (already present) so it scrolls instead of
  breaking the page layout — should still be spot-checked on a narrow/mobile viewport during
  verification

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Table vs. CSS grid | Semantic HTML `<table>` | Session count/room layout is a genuine timetable — table semantics give correct screen-reader row/column announcement for free, already implemented this way |

## Dependencies
- **Requires:** nothing new — reuses existing embed data pipeline entirely
- **Enables:** organizers can offer a grid-style public schedule alongside the existing itinerary/list
  views

## Risks & Mitigations
- **Risk:** none significant — this is finish-and-verify work on an already-implemented, already-tested
  feature. **Mitigation:** the plan's only real job is live browser verification before calling it done.
