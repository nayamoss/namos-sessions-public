# Public Embeds — Kill My SaaS Brief Addendum

**Date:** 2026-08-17
**Covers:** brief requirement 9 — *mobile-friendly, embeddable public speaker gallery and schedule
itinerary.*
**Relationship to this package:** the existing four documents (status `Done`, 2026-08-13) remain
authoritative. This addendum records the brief-coverage audit, the seeding gap, and the mobile
validation that has never actually been run.

---

## Requirements coverage

| Brief clause | Implementation | Verdict |
|---|---|---|
| Public speaker gallery | `embeds.view` includes `speaker_gallery` and `speaker_list` (`convex/schema.ts:522`); rendered at `EmbedRenderer.tsx:121,183` | **PASS (source)** |
| Public schedule itinerary | `schedule_itinerary` view (`EmbedRenderer.tsx:221`), alongside `agenda`, `schedule_grid`, `session_list` | **PASS (source)** |
| Embeddable | Public route `/embed/:embedId` (`src/App.tsx:492`); `Content-Security-Policy: frame-ancestors *` scoped to `/embed/*` in `netlify.toml`; copyable snippet via `iframeSnippet` (`src/lib/public-embed.ts`, used at `EmbedsListPage.tsx:62`) | **PASS (source)** |
| Public URL | Direct link from the editor (`EmbedEditorPage.tsx:149`) | **PASS (source)** |
| Mobile-friendly | Responsive throughout: gallery `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (`EmbedRenderer.tsx:183`); schedule rows collapse from a five-column `sm:` grid to a stacked column (`:59`); filters stack `flex-col sm:flex-row` (`:159`); container padding `p-3 sm:p-4` (`:149`) | **PASS (source)** · **UNVERIFIED at device widths** |
| Published-only | `publicEmbeds.getPublic` (`convex/publicEmbeds.ts:450`) projects published data only; the attendee site at `/e/:eventSlug` fails closed through each item's own accepted linked submission | **PASS (source)** |
| Filters, calendar export, theming | Track filter, light/dark/system theme, primary colour, date and time formats, per-view field toggles (`convex/schema.ts:520-531`) | Exceeds |

Test coverage: `src/test/public-embed-views.test.tsx`, `embed-renderer.test.tsx`,
`public-embed.test.ts`, `public-embed-saved.test.ts`, `public-embed-security-contract.test.ts`,
`attendee-site.test.tsx`, `public-layout.test.tsx`.

**No new embed feature work is proposed.** Requirement 9 is covered in source.

## Gap 1 — the seeded speaker gallery is switched off

`convex/seed.ts` seeds two embeds:

| Name | View | `enabled` |
|---|---|---|
| Main event agenda | `agenda` | `true` |
| Speaker gallery draft | `speaker_gallery` | **`false`** |

The brief's headline public surface is disabled by default in the demo, and named "draft". No
`schedule_itinerary` embed is seeded at all — so the second surface the brief names by name does
not exist in the demo either.

**Fix (Phase 1.9):** enable the gallery, rename it to something a judge reads as finished, and add
a seeded `schedule_itinerary` embed. `convex/seed.ts` only.

## Gap 2 — the gallery has no photographs

`convex/seed.ts` deliberately clears legacy headshot keys:

```
...(existing.headshotStorageKey?.startsWith("seed/") ? { headshotStorageKey: undefined } : {})
```

The comment is right — a non-Convex placeholder path must never be presented as a public storage
asset. But the consequence is that an enabled gallery renders sixty blank avatars, which is a worse
demo than a smaller gallery with real images.

**Fix (Phase 1.4, shared with `speaker-portal-readiness/`):** seed real headshots through Convex
storage for the demo speakers. If the seed cannot write binaries from an `internalMutation` in this
Convex version, a companion `internalAction` runs alongside `npm run seed:demo`. Resolve this before
starting — it is the same open question flagged in
`speaker-portal-readiness/design.md`.

## Gap 3 — mobile is asserted, never measured

Every breakpoint above is correct in source and covered by component tests. Nothing has been loaded
at a device width, in a real browser, inside a third-party iframe. Component tests do not catch
horizontal overflow, touch-target size, iframe height collapse, or a filter dropdown that opens off
the viewport edge.

**Fix (Phase 8):** the verification gate below, run and recorded.

## Verification gate

At **390 × 844** (iPhone-class) and **768 × 1024**, for both the speaker gallery and the schedule
itinerary:

1. Load the public URL directly. No horizontal scroll at any scroll position.
2. Load inside a third-party page via the copied `iframeSnippet`. The iframe sizes correctly and
   does not clip content.
3. Operate the track filter by touch. The dropdown opens fully on-screen.
4. Gallery: headshots present, names legible, three-up collapsing to one column.
5. Itinerary: times, rooms, tracks, and speaker names readable without zooming.
6. Confirm an unpublished session and an unaccepted submission appear **nowhere** in either.
7. Confirm the dark theme renders legibly — a fixed-palette surface must pin its own text colours
   rather than inheriting `foreground` / `muted-foreground`.
8. Copy the iframe snippet from the list page; confirm it pastes and works verbatim.
9. Repeat at 1280px to confirm nothing regressed at desktop width.

## Status

**PASS (source) · DEMO off-by-default and photo-less · E2E good at component level ·
Live/browser/device evidence NOT VERIFIED.** Reported as PASS only after the gate above is walked.
</content>
